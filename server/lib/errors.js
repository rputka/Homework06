/* An error with an HTTP status and a message that is safe to show the user. Thrown by services, turned into
   { ok: false, error } responses by the HTTP layer. */
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (message, status = 400) => { throw new HttpError(status, message); };
export const notFound = (what = 'That page') => fail(`${what} could not be found.`, 404);
export const forbidden = message => fail(message || 'You do not have access to that.', 403);
