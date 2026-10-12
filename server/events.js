/* Live updates over Server-Sent Events. Each signed-in browser tab keeps GET /api/events open; services call
   emit(userId, event) and every open tab of that user receives it. */
export function createEvents() {
  const streams = new Map(); // userId -> Set of responses

  setInterval(() => { for (const set of streams.values()) for (const res of set) res.write(': keep-alive\n\n'); }, 25000).unref();

  return {
    connect(userId, req, res) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      if (!streams.has(userId)) streams.set(userId, new Set());
      streams.get(userId).add(res);
      req.on('close', () => { const set = streams.get(userId); if (set) { set.delete(res); if (!set.size) streams.delete(userId); } });
    },
    emit(userId, event) {
      const set = streams.get(userId); if (!set) return;
      const data = `data: ${JSON.stringify(event)}\n\n`;
      for (const res of set) res.write(data);
    },
    connections: () => [...streams.values()].reduce((n, s) => n + s.size, 0)
  };
}
