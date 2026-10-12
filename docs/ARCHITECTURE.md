# Nearhand: Current Architecture

This document describes the architecture of the Nearhand prototype **as it exists in the code today** (commit `5377582` plus the uncommitted `server/`, `js/` and `css/` folders). It was recovered from the source with a generative AI coding assistant (Claude Code), using the prompts listed in [How this was produced](#how-this-was-produced). Every diagram is written in [Mermaid](https://mermaid.js.org/), so it renders directly on GitHub and can be edited as text.

Contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [System context diagram](#2-system-context-diagram)
3. [Container diagram](#3-container-diagram)
4. [Component diagram: server](#4-component-diagram-server)
5. [Component diagram: browser client](#5-component-diagram-browser-client)
6. [Class diagram: domain model](#6-class-diagram-domain-model)
7. [Class diagram: code modules](#7-class-diagram-code-modules)
8. [Database schema (ER diagram)](#8-database-schema-er-diagram)
9. [Sequence diagrams](#9-sequence-diagrams)
10. [State diagrams](#10-state-diagrams)
11. [Deployment diagram](#11-deployment-diagram)
12. [Architectural decisions and observations](#12-architectural-decisions-and-observations)
13. [How this was produced](#how-this-was-produced)

---

## 1. Architecture at a glance

| Aspect | What the code does |
|---|---|
| Style | Client/server **single-page application**. A thin JSON API in front of an in-memory domain model with write-through persistence. |
| Server | Node.js 22.13+, **no npm dependencies**: `node:http`, `node:sqlite`, `node:vm`, `node:crypto`. |
| Client | Plain HTML, CSS and non-module JavaScript files sharing one global scope; hash-based routing; HTML built from template strings. |
| Shared code | The same business-rule files (`constants`, `schedule`, `queries`, `services`) run in the browser *and* on the server. The server loads them into a Node `vm` sandbox. |
| API | Two endpoints: `GET /api/state` (everything this user may see) and `POST /api/action/:name` (run one business rule). An RPC style, not REST. |
| Persistence | SQLite, one table per collection, each row is `(id, data JSON)`. The whole data set lives in memory; `save()` writes only changed rows. |
| Auth | Random 48-hex session token in an `HttpOnly` cookie; sessions stored in SQLite; passwords hashed with scrypt. |
| External services | Resend (email), OpenStreetMap Nominatim (geocoding), OpenStreetMap tiles and Leaflet from cdnjs (maps), Google Fonts. |

---

## 2. System context diagram

Who uses Nearhand and which outside systems it depends on (C4 level 1).

```mermaid
flowchart LR
    employer(["Employer<br/>posts jobs, hires, funds escrow"])
    worker(["Worker<br/>finds jobs, bids, does the work"])

    subgraph nearhand["Nearhand system"]
        app["Nearhand web app<br/>(browser SPA + Node server)"]
    end

    resend["Resend<br/>email API"]
    nominatim["OpenStreetMap Nominatim<br/>city geocoding"]
    tiles["OpenStreetMap tile servers<br/>+ cdnjs (Leaflet)"]
    fonts["Google Fonts"]

    employer -- "HTTPS" --> app
    worker -- "HTTPS" --> app
    app -- "sends notification emails<br/>(POST /emails)" --> resend
    resend -. "email" .-> employer
    resend -. "email" .-> worker
    app -- "looks up unknown US cities<br/>(max 1 request/second)" --> nominatim
    app -- "browser loads map library and tiles" --> tiles
    app -- "browser loads Inter font" --> fonts
```

---

## 3. Container diagram

The deployable pieces and how they talk (C4 level 2).

```mermaid
flowchart TB
    user(["Employer / Worker"])

    subgraph browser["Web browser"]
        spa["Single-page app<br/>index.html + css/ + js/<br/>(hash router, template-string views)"]
        localdb[("In-memory DB copy<br/>(filtered for this user)")]
        spa --- localdb
    end

    subgraph node["Node.js process (npm start)"]
        http["HTTP server<br/>server/server.js"]
        appcore["Application core<br/>server/app.js + vm sandbox<br/>running js/services, js/data"]
        memdb[("Authoritative in-memory DB")]
        http --> appcore --> memdb
    end

    sqlite[("SQLite file<br/>server/data/nearhand.db")]
    uploadsdir[("Uploaded images<br/>server/data/uploads/")]

    user --> spa
    spa -- "GET /, /css/*, /js/*, /uploads/*" --> http
    spa -- "GET /api/state<br/>POST /api/action/:name<br/>(JSON, session cookie)" --> http
    memdb -- "save(): changed rows only" --> sqlite
    appcore -- "data: URL to file" --> uploadsdir
    http -- "streams files" --> uploadsdir
    appcore -- "HTTPS" --> resend["Resend"]
    appcore -- "HTTPS" --> osm["Nominatim"]
```

---

## 4. Component diagram: server

Each box is one file in `server/`, or a group of shared files loaded into the sandbox.

```mermaid
flowchart LR
    subgraph server["server/"]
        direction TB
        S["server.js<br/>HTTP routing, static files,<br/>session cookies, JSON body parsing"]
        A["app.js<br/>createApp(): action whitelist,<br/>per-user state filtering,<br/>password hashing, city resolution"]
        D["db.js<br/>openDatabase(): load / save / clear,<br/>getSession / setSession"]
        U["uploads.js<br/>createUploads(): storeImages, fileFor"]
        E["email.js<br/>createMailer(): flush, send, render"]
        G["geocode.js<br/>createGeocoder(): queued, cached lookup"]
        R["reset-db.js<br/>deletes DB + uploads"]
    end

    subgraph vm["node:vm sandbox (same files the browser uses)"]
        direction TB
        C["config/constants.js"]
        SCH["data/schedule.js"]
        PH["data/placeholders.js"]
        SEED["data/seed.js"]
        Q["data/queries.js (Q)"]
        SV["services/services.js (S)"]
    end

    S -->|"stateFor(), act(), blankSession()"| A
    S -->|"getSession / setSession"| D
    S -->|"fileFor()"| U
    A -->|"load / save / clear"| D
    A -->|"storeImages()"| U
    A -->|"flush()"| E
    A -->|"lookup()"| G
    A -->|"runInContext: S[name](...args)"| SV
    SV --> Q
    SV --> SCH
    SV --> C
    SEED --> PH
    A -->|"seed() on empty DB"| SEED
```

**Request pipeline inside `app.act(name, args, session)`**

1. Reject unknown actions. Only names in `MEMBER_ACTIONS` (signed-in) or `PUBLIC_ACTIONS` can run.
2. For member actions, overwrite the "acting user" argument with `session.userId`, so a browser cannot act as someone else.
3. If the action carries a city (`signup`, `saveJob`, `saveSettings`), normalise it through `Q.city()` or the Nominatim geocoder.
4. Replace every `data:image/...` string in the arguments with a saved file URL (`uploads.storeImages`).
5. Run the business rule `S[name]` synchronously with `DB.session` pointing at this browser's session.
6. Strip password hashes from the result, then email pending notifications in the background (`mailer.flush`).

---

## 5. Component diagram: browser client

The client is layered by folder. `index.html` loads the layers in this order, and a layer may use anything loaded before it.

```mermaid
flowchart TB
    subgraph L6["main.js (boot)"]
        main["refresh() then render();<br/>poll state every 30 s (5 s on Messages)"]
    end
    subgraph L5["app/ (controller)"]
        router["router.js<br/>ROUTES, render(), go(), access guards"]
        actions["actions.js<br/>A: click handlers via data-act"]
        forms["forms.js<br/>F: submit handlers via data-form"]
        inputs["inputs.js<br/>live filters, file inputs, hashchange"]
        state["state.js<br/>ui flags, route, FIL filters"]
    end
    subgraph L4["views/ (pages)"]
        views["V.home, V.jobs, V.workers, V.job, V.post,<br/>V.dashboard, V.profile, V.payments, V.settings,<br/>V.login/signup/verify/forgot/reset,<br/>V.notifications, V.messages,<br/>V.about/terms/privacy/contact"]
    end
    subgraph L3["ui/ (shared presentation)"]
        comps["components.js<br/>cards, chips, stepper, fields"]
        layout["layout.js<br/>header, nav, footer, V registry"]
        feedback["feedback.js<br/>modal, toast"]
        maps["maps.js<br/>Leaflet wrappers"]
        images["images.js<br/>client-side compression"]
        helpers["helpers.js<br/>$, esc, money, dates"]
    end
    subgraph L2["data/ (model access)"]
        api["api.js<br/>DB copy, refresh(), S proxy (RPC stub)"]
        queries["queries.js<br/>Q: read-only queries"]
        schedule["schedule.js<br/>recurrence maths"]
    end
    subgraph L1["config/"]
        constants["constants.js<br/>statuses, categories, cities, NOTIFY_TYPES"]
    end

    main --> router
    router --> views
    actions --> api
    forms --> api
    inputs --> views
    views --> comps
    views --> queries
    comps --> queries
    queries --> constants
    api -- "fetch JSON" --> server[("Nearhand server")]
    maps --> leaflet["Leaflet (cdnjs)"]
```

**Key idea: the `S` proxy.** In the browser, `S` is not the real business-rule object. It is a JavaScript `Proxy` in `js/data/api.js` that turns any call `S.hire(bidId, me.id)` into `POST /api/action/hire` with `{ args: [bidId, me.id] }`, swaps in the fresh state that comes back, and returns the rule's `{ ok, value | error }` result. The views and controllers therefore call business rules exactly as if they were local, while the real `S` from `services.js` only ever runs on the server.

---

## 6. Class diagram: domain model

The data model is documented in `js/config/constants.js` and enforced by `js/services/services.js`. The records are plain JSON objects (no JavaScript classes), so the diagram shows their fields and relationships.

```mermaid
classDiagram
    direction LR

    class User {
        +String id
        +Role role
        +String name
        +String email
        +String password  "scrypt hash"
        +String phone
        +String location
        +Number lat
        +Number lon
        +Boolean verified
        +String avatar
        +Map emailPrefs
        +Number createdAt
    }
    class EmployerProfile {
        +String userId
        +String company
        +String about
    }
    class WorkerProfile {
        +String userId
        +String headline
        +String bio
        +String[] skills
        +String[] categories
        +Number experienceYears
        +String experience
        +Number hourlyRate
        +String pricingNote
        +PortfolioItem[] portfolio
    }
    class PortfolioItem {
        +String id
        +String kind  "photo or pair"
        +String src
        +String before
        +String after
        +String caption
        +String category
    }
    class Job {
        +String id
        +String employerId
        +String workerId
        +String title
        +String description
        +String category
        +String location
        +String experience
        +Number budgetMin
        +Number budgetMax
        +JobStatus status
        +Number agreedPrice
        +String completionNote
        +Schedule schedule
        +History[] history
        +Object dispute  "reserved"
    }
    class Schedule {
        +String start  "YYYY-MM-DD"
        +String time  "HH:MM"
        +String repeat
        +Number[] days
        +String until
    }
    class Bid {
        +String id
        +String jobId
        +String workerId
        +Number price
        +String message
        +String[] photos
        +BidStatus status
        +Counter counter
        +History[] history
    }
    class Counter {
        +Number price
        +String note
        +String status  "pending, accepted, declined"
        +Number at
    }
    class Transaction {
        +String id  "TX-nnnn"
        +String jobId
        +String employerId
        +String workerId
        +Number amount
        +Number fee
        +TxStatus status
        +String card  "fake"
        +Event[] events
    }
    class Review {
        +String id
        +String jobId
        +String fromId
        +String toId
        +Number rating  "1 to 5"
        +String text
    }
    class Notification {
        +String id
        +String userId
        +NotifyType type
        +String title
        +String body
        +String link
        +Boolean read
        +EmailStatus email
    }
    class Category {
        +String id
        +String name
        +String icon
        +Number hue
        +Boolean custom
        +String createdBy
    }
    class City {
        +String id
        +String name  "City, ST"
        +Number lat
        +Number lon
    }
    class Conversation {
        +String id
        +String[] participants
        +Map lastRead
    }
    class Message {
        +String id
        +String conversationId
        +String fromId
        +String text
    }

    class Role {
        <<enumeration>>
        employer
        worker
    }
    class JobStatus {
        <<enumeration>>
        Open for Bids
        Worker Selected
        Payment Funded
        In Progress
        Awaiting Approval
        Completed
    }
    class BidStatus {
        <<enumeration>>
        active
        accepted
        rejected
        withdrawn
    }
    class TxStatus {
        <<enumeration>>
        held
        released
        disputed (planned)
        refunded (planned)
    }

    User "1" -- "0..1" EmployerProfile : has
    User "1" -- "0..1" WorkerProfile : has
    WorkerProfile "1" *-- "0..24" PortfolioItem
    User "1" --> "*" Job : employerId posts
    User "0..1" <-- "*" Job : workerId hired
    Job "1" *-- "0..1" Schedule
    Job "1" --> "*" Bid
    User "1" --> "*" Bid : workerId places
    Bid "1" *-- "0..1" Counter
    Job "1" --> "0..1" Transaction : escrow
    Job "1" --> "0..2" Review
    User "1" --> "*" Review : fromId / toId
    User "1" --> "*" Notification
    Job ..> Category : category
    Job ..> City : location
    User ..> City : location
    Conversation "1" *-- "*" Message
    User "2" -- "*" Conversation : participants
    User ..> Role
    Job ..> JobStatus
    Bid ..> BidStatus
    Transaction ..> TxStatus
```

**Invariants enforced by the services layer** (`js/services/services.js`)

- Only `employer` users can post, edit, delete, counter, hire, fund and confirm; only `worker` users can bid, start and complete.
- A worker has at most one bid per job (re-bidding revises it).
- Hiring accepts one bid, rejects every other active bid, and closes bidding.
- A `Transaction` is created only when a job moves from *Worker Selected* to *Payment Funded*, and is released only on *Completed*.
- Each party can leave at most one review per completed job, and only about the other party.
- Messaging is only allowed between a verified employer and a verified worker (`Q.canMessage`).

---

## 7. Class diagram: code modules

Nearhand is not written with `class` declarations. Each module is either a **factory function returning an object** (server) or a **global singleton object** (shared and client). This diagram treats each of those as a class to show responsibilities and dependencies.

```mermaid
classDiagram
    direction TB

    class HttpServer {
        <<server/server.js>>
        -store
        -uploads
        -mailer
        -geocoder
        -app
        +serveStatic(req, res, path)
        +sessionFor(req, res) Session
        +readJson(req) Promise
        +handleApi(req, res, path)
    }
    class App {
        <<server/app.js createApp>>
        -vm.Context context
        -MEMBER_ACTIONS
        -PUBLIC_ACTIONS
        +act(name, args, session) Promise~Result~
        +stateFor(session) State
        +blankSession() Session
        -withSession(session, fn)
        -resolveCity(form) Promise
        -hashPassword(pw) String
        -verifyPassword(pw, stored) Boolean
    }
    class Store {
        <<server/db.js openDatabase>>
        -DatabaseSync db
        -Map written
        +load(version) Data
        +save(data)
        +clear()
        +getSession(token) Session
        +setSession(token, session)
    }
    class Uploads {
        <<server/uploads.js createUploads>>
        +storeImages(value) value
        +fileFor(urlPath) String
        -saveDataUrl(dataUrl) String
    }
    class Mailer {
        <<server/email.js createMailer>>
        +Boolean configured
        +flush(db, save) Promise
        -send(notification, user) Promise
        -render(notification, user) Email
    }
    class Geocoder {
        <<server/geocode.js createGeocoder>>
        -Map cache
        -Promise queue
        +lookup(input, key) Promise~LookupResult~
        -search(input) Promise
    }
    class S_Services {
        <<js/services/services.js>>
        +signup(form) Result
        +verify(userId) Result
        +login(email, pw) Result
        +logout()
        +requestReset(email) Result
        +resetPassword(pw) Result
        +saveJob(form, id, employerId) Result
        +deleteJob(id, uid) Result
        +submitBid(jobId, uid, form) Result
        +withdrawBid(id, uid) Result
        +counter(bidId, uid, price, note) Result
        +respondCounter(bidId, uid, accept) Result
        +hire(bidId, uid) Result
        +fund(jobId, uid) Result
        +start(jobId, uid) Result
        +complete(jobId, uid, note) Result
        +confirm(jobId, uid) Result
        +review(jobId, uid, rating, text) Result
        +saveSettings(uid, form) Result
        +addPortfolioItem(uid, form) Result
        +removePortfolioItem(uid, itemId) Result
        +startConversation(uid, otherId) Result
        +sendMessage(uid, convId, text) Result
        +markConversationRead(uid, convId) Result
        +markNotificationsRead(uid, ids) Result
    }
    class Q_Queries {
        <<js/data/queries.js>>
        +me() User
        +user(id) User
        +job(id) Job
        +bidsFor(jobId) Bid[]
        +tx(jobId) Transaction
        +rating(uid) Rating
        +completed(uid) Number
        +distance(a, b) Number
        +city(name) City
        +canViewJob(user, job) Boolean
        +canMessage(a, b) Boolean
        +notifications() Notification[]
    }
    class ApiClient {
        <<js/data/api.js>>
        +DB state
        +refresh() Promise
        +S Proxy
        -api(path, body) Promise
    }
    class Router {
        <<js/app/router.js>>
        +ROUTES
        +PUBLIC
        +render(keepScroll)
        +go(hash)
        -parseRoute()
    }
    class Views {
        <<js/views/*.js>>
        +home() html
        +jobs() html
        +job(id) html
        +post(id) html
        +dashboard() html
        +profile(id) html
        +payments() html
        +settings() html
        +notifications() html
        +messages(id) html
    }
    class A_Actions {
        <<js/app/actions.js>>
        click handlers keyed by data-act
    }
    class F_Forms {
        <<js/app/forms.js>>
        submit handlers keyed by data-form
    }

    HttpServer --> App
    HttpServer --> Store
    HttpServer --> Uploads
    App --> Store
    App --> Uploads
    App --> Mailer
    App --> Geocoder
    App --> S_Services : runs in vm
    S_Services --> Q_Queries
    Router --> Views
    Views --> Q_Queries
    A_Actions --> ApiClient
    F_Forms --> ApiClient
    ApiClient ..> HttpServer : HTTP JSON
    ApiClient ..|> S_Services : remote proxy for
```

---

## 8. Database schema (ER diagram)

`server/db.js` creates one table per collection with the same two columns, plus `meta` and `sessions`. Relationships are **logical only**: they live inside the JSON `data` column and SQLite does not enforce them with foreign keys.

```mermaid
erDiagram
    users {
        TEXT id PK
        TEXT data "User JSON"
    }
    employerProfiles {
        TEXT id PK "= userId"
        TEXT data
    }
    workerProfiles {
        TEXT id PK "= userId"
        TEXT data
    }
    jobs {
        TEXT id PK
        TEXT data "employerId, workerId inside"
    }
    bids {
        TEXT id PK
        TEXT data "jobId, workerId inside"
    }
    transactions {
        TEXT id PK
        TEXT data "jobId inside"
    }
    reviews {
        TEXT id PK
        TEXT data "jobId, fromId, toId inside"
    }
    notifications {
        TEXT id PK
        TEXT data "userId inside"
    }
    categories {
        TEXT id PK
        TEXT data
    }
    cities {
        TEXT id PK
        TEXT data
    }
    conversations {
        TEXT id PK
        TEXT data "participants inside"
    }
    messages {
        TEXT id PK
        TEXT data "conversationId inside"
    }
    meta {
        TEXT key PK "version, seq"
        TEXT value
    }
    sessions {
        TEXT token PK
        TEXT data "userId, pending, resetFor"
        INTEGER updated_at
    }

    users ||--o| employerProfiles : "has"
    users ||--o| workerProfiles : "has"
    users ||--o{ jobs : "posts"
    jobs ||--o{ bids : "receives"
    users ||--o{ bids : "places"
    jobs ||--o| transactions : "escrow"
    jobs ||--o{ reviews : "about"
    users ||--o{ notifications : "receives"
    conversations ||--o{ messages : "contains"
    users }o--o{ conversations : "participates"
    sessions }o--o| users : "signed in as"
```

---

## 9. Sequence diagrams

### 9.1 Page load and navigation

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant B as Browser (main.js, router.js)
    participant API as api.js
    participant SRV as server.js
    participant APP as app.js
    participant DB as db.js (SQLite)

    U->>B: open http://localhost:3000/#/dashboard
    B->>SRV: GET / , /css/*, /js/*
    SRV-->>B: static files
    B->>API: refresh()
    API->>SRV: GET /api/state (cookie nh_session)
    SRV->>DB: getSession(token)
    alt no valid cookie
        SRV->>DB: setSession(newToken, blankSession)
        SRV-->>B: Set-Cookie nh_session=...
    end
    SRV->>APP: stateFor(session)
    APP-->>SRV: filtered state (no password hashes, no other users' email/phone)
    SRV-->>API: { state }
    API-->>B: DB = state
    B->>B: render(): guard route, call V.dashboard(), set #app innerHTML
    loop every 30 s while tab visible (every 5 s on #/messages)
        B->>API: refresh()
        API->>SRV: GET /api/state
        B->>B: update bell and message badges
    end
```

### 9.2 Running a business rule: employer hires a worker

```mermaid
sequenceDiagram
    autonumber
    actor E as Employer
    participant A as actions.js (A.hire)
    participant P as S proxy (api.js)
    participant SRV as server.js
    participant APP as app.js
    participant UP as uploads.js
    participant SV as services.js (S.hire, in vm)
    participant DB as db.js
    participant M as email.js
    participant R as Resend

    E->>A: click "Hire" (data-act="hire")
    A->>P: S.hire(bidId, me.id)
    P->>SRV: POST /api/action/hire { args:[bidId, me.id] }
    SRV->>APP: act("hire", args, session)
    APP->>APP: "hire" is in MEMBER_ACTIONS, so args[1] = session.userId
    APP->>UP: storeImages(args)
    APP->>SV: withSession(session, S.hire(bidId, userId))
    SV->>SV: check owner and status "Open for Bids"
    SV->>SV: reject other active bids and notify those workers
    SV->>SV: accept bid, set workerId and agreedPrice, status = "Worker Selected"
    SV->>SV: notify hired worker (email.status = pending)
    SV->>DB: save(DB): upsert changed rows in one transaction
    SV-->>APP: { ok:true, value: job }
    APP-->>SRV: result without passwords
    APP-)M: flush(DB) in background
    M-)R: POST /emails for each pending notification
    M->>DB: save() with email status sent / failed / skipped
    SRV->>DB: setSession(token, session)
    SRV->>APP: stateFor(session)
    SRV-->>P: { result, state }
    P-->>A: DB = state, return result
    A->>E: toast + re-render job page
```

### 9.3 Signup with an unknown city

```mermaid
sequenceDiagram
    autonumber
    actor V as Visitor
    participant F as forms.js (F.signup)
    participant SRV as server.js / app.js
    participant G as geocode.js
    participant N as Nominatim
    participant SV as services.js (S.signup)

    V->>F: submit signup form
    F->>SRV: POST /api/action/signup { args:[form] }
    SRV->>SRV: Q.city(form.location) not known
    SRV->>G: lookup("dallas tx")
    alt cached
        G-->>SRV: cached result
    else not cached
        G->>N: GET /search?q=dallas tx&countrycodes=us (queued, 1 per second)
        N-->>G: lat, lon, address
        G-->>SRV: { status:"found", city:"Dallas, TX" }
    end
    SRV->>SRV: add City row, form.location = "Dallas, TX"
    SRV->>SV: S.signup(form)
    SV->>SV: validate, hashPassword (scrypt), create User + profile
    SV->>SV: session.pending = new user id
    SV-->>F: { ok:true }
    F->>V: go("#/verify") (simulated email verification)
```

---

## 10. State diagrams

### 10.1 Job lifecycle

```mermaid
stateDiagram-v2
    [*] --> OpenForBids : S.saveJob (employer)
    OpenForBids --> OpenForBids : submitBid / withdrawBid / counter / respondCounter
    OpenForBids --> WorkerSelected : S.hire (employer)
    OpenForBids --> [*] : S.deleteJob (employer)
    WorkerSelected --> PaymentFunded : S.fund (employer), Transaction held
    PaymentFunded --> InProgress : S.start (worker)
    InProgress --> AwaitingApproval : S.complete (worker)
    AwaitingApproval --> Completed : S.confirm (employer), Transaction released
    Completed --> Completed : S.review (either party, once each)
    Completed --> [*]

    OpenForBids : Open for Bids
    WorkerSelected : Worker Selected
    PaymentFunded : Payment Funded
    InProgress : In Progress
    AwaitingApproval : Awaiting Approval
```

### 10.2 Bid and counter-offer

```mermaid
stateDiagram-v2
    [*] --> active : submitBid
    active --> active : submitBid again (revised)
    active --> withdrawn : withdrawBid
    withdrawn --> active : submitBid again
    active --> accepted : hire (this bid)
    active --> rejected : hire (another bid)
    accepted --> [*]
    rejected --> [*]

    state active {
        [*] --> noCounter
        noCounter --> pending : counter (employer)
        pending --> acceptedCounter : respondCounter(true), price = counter price
        pending --> declined : respondCounter(false) or worker revises bid
        declined --> pending : counter again
        acceptedCounter --> pending : counter again
    }
```

### 10.3 Escrow transaction and notification email

```mermaid
stateDiagram-v2
    direction LR
    state "Transaction" as T {
        [*] --> held : fund
        held --> released : confirm
        held --> disputed : planned
        disputed --> refunded : planned
        released --> [*]
    }
    state "Notification email" as N {
        [*] --> pending : notify()
        pending --> sending : flush()
        sending --> sent
        sending --> failed
        sending --> skipped : user turned type off
        sending --> notConfigured : no RESEND_API_KEY
    }
```

---

## 11. Deployment diagram

```mermaid
flowchart LR
    subgraph client["User device"]
        br["Web browser"]
    end
    subgraph host["Host: localhost or Render / Railway / Fly.io"]
        subgraph proc["node --env-file-if-exists=.env server/server.js"]
            srv["Nearhand server<br/>PORT (default 3000)"]
        end
        subgraph disk["Persistent disk (DB_FILE dir)"]
            dbf[("nearhand.db<br/>+ WAL files")]
            up[("uploads/*.jpg|png|webp|gif")]
        end
        env["Environment<br/>RESEND_API_KEY, EMAIL_FROM,<br/>EMAIL_REDIRECT_TO, APP_URL,<br/>DB_FILE, PORT"]
    end
    subgraph internet["Third-party services"]
        resend["api.resend.com"]
        nom["nominatim.openstreetmap.org"]
        cdn["cdnjs.cloudflare.com<br/>tile.openstreetmap.org<br/>fonts.googleapis.com"]
    end

    br -- "HTTP(S)" --> srv
    br --> cdn
    srv --> dbf
    srv --> up
    env -.-> srv
    srv --> resend
    srv --> nom
```

---

## 12. Architectural decisions and observations

**Decisions visible in the code**

| Decision | Where | Effect |
|---|---|---|
| Zero dependencies | `package.json` has no `dependencies`; only `node:*` modules | No install step, nothing to audit, but everything (HTTP routing, body parsing, cookies) is hand-written. |
| Shared rules run in a `vm` sandbox | `server/app.js` `SHARED_SCRIPTS` | One copy of the rules for client and server, without converting the browser scripts to modules. |
| Server is the source of truth | `MEMBER_ACTIONS` fills in the acting user from the session | The browser cannot bypass rules or impersonate another user. |
| Read-everything state endpoint | `GET /api/state`, filtered by `stateFor()` | Simple client (no per-page fetching); payload grows with the data set. |
| Document-style tables | `db.js`: `(id, data JSON)` per collection | Schema changes need no migrations, but there are no foreign keys or indexes on fields, and a `DB_VERSION` bump discards all data. |
| In-memory data, diff-based writes | `db.js` `written` map | Fast reads; the whole data set must fit in memory, and only one server process can run. |
| Synchronous rules, single-threaded Node | `withSession()` comment in `app.js` | Swapping `DB.session` per request is safe only because rules never `await`. |
| Images as content-addressed files | `uploads.js` (SHA-256 file names) | Small JSON payloads, duplicate uploads stored once, immutable caching. |

**Gaps and drift found while recovering the architecture**

- **Messaging polls instead of pushing.** `Conversation`/`Message` records, `S.startConversation` and `S.sendMessage`, the `#/messages` route and `js/views/messages.js` now exist. Instead of a push channel (WebSocket or server-sent events), the Messages page polls `GET /api/state` every 5 seconds (`js/main.js`), and each poll resends the user's entire visible data set, not just new messages.
- **Leftover constant.** `STORE_KEY` in `js/config/constants.js` is no longer used; it dates from when data was kept in browser `localStorage`.
- **Scalability limits.** Single process, whole data set in memory, and `GET /api/state` returns every job, bid and review to each signed-in user on every page change, every 30-second poll, and every 5 seconds while Messages is open.
- **No automated tests**, and no foreign-key integrity in the database; the services layer is the only place relationships are checked.
- **Session table is never pruned.** A new row is created for every cookieless request (including bots), and old rows are never deleted.

---

## How this was produced

The architecture was reverse-engineered from the source with **Claude Code** (Anthropic's AI coding assistant, model Claude Opus 5.5) running in the repository. The assistant read the files itself (`server/*.js`, `js/**/*.js`, `index.html`, `package.json`, `README.md`) and then wrote the diagrams. The prompts below can be reused with any AI coding assistant that can read the repository, such as Claude Code, GitHub Copilot Chat or Cursor.

**Prompt used**

> Use gen AI tools and prompts to determine the current architecture of that system. Include class diagrams, component diagrams, etc.

**Follow-up prompts that reproduce each section**

1. *Inventory:* "List every source file in this repository with its line count, and summarise in one sentence what each file is responsible for. Identify the runtime, frameworks and external services it uses."
2. *Context and containers:* "Draw a C4 system context diagram and a container diagram in Mermaid for this app. Include every external HTTP service the code calls and every place data is stored."
3. *Components:* "For `server/` and for `js/`, draw a Mermaid component diagram showing each module and the functions it calls in other modules. Follow `index.html`'s script order for the browser layers."
4. *Domain classes:* "From the data model comment in `js/config/constants.js` and the rules in `js/services/services.js`, draw a Mermaid class diagram of the domain entities with fields, enumerations, multiplicities and relationships. List the invariants the services enforce."
5. *Code structure:* "The code has no `class` declarations. Treat each factory function and global singleton (`S`, `Q`, `A`, `F`, `V`, `createApp`, `openDatabase`, ...) as a class and draw a Mermaid class diagram of their public methods and dependencies."
6. *Data:* "Draw a Mermaid ER diagram of the SQLite tables `server/db.js` creates, marking which relationships are only logical (inside the JSON column)."
7. *Behaviour:* "Write Mermaid sequence diagrams for (a) first page load, (b) an employer hiring a worker, end to end through the server, and (c) signing up with a city the app has never seen. Write state diagrams for the job lifecycle, bids and counter-offers, escrow transactions and notification emails."
8. *Review:* "Compare the code with the README. List architectural decisions, their trade-offs, and anything that is partly implemented, unused, or inconsistent."

**Verification.** Each claim was checked against the code it cites (file and function names are given throughout so a reader can do the same). AI-generated diagrams can still contain mistakes, so treat the source as authoritative if they ever disagree.
