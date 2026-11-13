// A stand-in for api.resend.com, for local tests. Records every request.
//   bad422@...  -> rejected as invalid (batch: whole batch 422, like Resend)
//   flaky@...   -> 503 (temporary) every time
// GET /__log returns what was received; POST /__reset clears it.
import http from "node:http";

const PORT = Number(process.argv[2] ?? 3399);
let log = [];
let n = 0;

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.url === "/__log") return send(res, 200, log);
      if (req.url === "/__reset") {
        log = [];
        return send(res, 200, { ok: true });
      }
      const body = raw ? JSON.parse(raw) : null;
      const entry = { path: req.url, auth: req.headers.authorization, idem: req.headers["idempotency-key"], body };
      log.push(entry);
      const list = req.url === "/emails/batch" ? body : [body];
      const tos = list.map((m) => m.to[0]);
      if (tos.some((t) => t.startsWith("bad422"))) return send(res, 422, { message: "Invalid `to` field." });
      if (tos.some((t) => t.startsWith("flaky"))) return send(res, 503, { message: "Service unavailable" });
      const ids = list.map(() => ({ id: `fake-${++n}` }));
      return req.url === "/emails/batch" ? send(res, 200, { data: ids }) : send(res, 200, ids[0]);
    });
  })
  .listen(PORT, () => console.log(`fake resend on ${PORT}`));
