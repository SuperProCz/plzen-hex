// Plzeň Hex analytics API. Listens on localhost only; Caddy terminates HTTPS in front of it.
//   POST /api/visits  {"visits": {"<cell>": <count>}}  → adds the counts to hex_visits
//   GET  /api/visits                                   → aggregated counts for the public dashboard
//   GET  /api/health                                   → {"ok": true}
// Privacy: nothing identifying is stored or logged. Client IPs are only held in memory for rate limiting.
import http from "node:http";
import pg from "pg";
import { parseBatch } from "./batch.js";

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT = { requests: 30, windowMs: 10 * 60 * 1000 };
/** Cells entered fewer times than this are left out of the public read, so one person's route can't be traced. */
const MIN_PUBLIC_VISITS = Number(process.env.MIN_PUBLIC_VISITS ?? 3);
const READ_CACHE_MS = 30 * 1000;

// Peer authentication over the local socket: the service runs as the OS user that owns the database.
const pool = new pg.Pool({ host: process.env.PGHOST ?? "/var/run/postgresql", database: process.env.PGDATABASE ?? "plzenhex" });

const UPSERT = `
  INSERT INTO hex_visits (cell, visits)
  SELECT * FROM unnest($1::text[], $2::bigint[])
  ON CONFLICT (cell) DO UPDATE
    SET visits = hex_visits.visits + EXCLUDED.visits, updated_at = now()`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

let readCache = null; // { at, body }

/** Aggregates for the dashboard; totals include the hidden small cells, the per-cell list doesn't. */
async function readVisits() {
  if (readCache && Date.now() - readCache.at < READ_CACHE_MS) return readCache.body;
  const { rows } = await pool.query("SELECT cell, visits::int AS visits, updated_at FROM hex_visits WHERE visits > 0");
  const cells = {};
  let totalVisits = 0;
  let updatedAt = null;
  for (const r of rows) {
    totalVisits += r.visits;
    if (r.visits >= MIN_PUBLIC_VISITS) cells[r.cell] = r.visits;
    if (!updatedAt || r.updated_at > updatedAt) updatedAt = r.updated_at;
  }
  const body = {
    minVisits: MIN_PUBLIC_VISITS,
    totalVisits,
    visitedCells: rows.length,
    updatedAt: updatedAt?.toISOString() ?? null,
    cells,
  };
  readCache = { at: Date.now(), body };
  return body;
}

const hits = new Map(); // ip → { count, since }
function rateLimited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.since > RATE_LIMIT.windowMs) {
    hits.set(ip, { count: 1, since: now });
    return false;
  }
  return ++h.count > RATE_LIMIT.requests;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, h] of hits) if (now - h.since > RATE_LIMIT.windowMs) hits.delete(ip);
}, RATE_LIMIT.windowMs).unref();

function send(res, status, body) {
  res.writeHead(status, { ...CORS, ...(body ? { "Content-Type": "application/json" } : {}) });
  res.end(body ? JSON.stringify(body) : undefined);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  if (path === "/api/health" && req.method === "GET") return send(res, 200, { ok: true });
  if (path !== "/api/visits") return send(res, 404, { error: "not found" });
  if (req.method === "OPTIONS") return send(res, 204);
  if (req.method === "GET") {
    try {
      return send(res, 200, await readVisits());
    } catch (err) {
      console.error("db error:", err.message);
      return send(res, 500, { error: "read failed" });
    }
  }
  if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });

  // Caddy sets X-Forwarded-For; the app itself is only reachable from localhost.
  const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress;
  if (rateLimited(ip)) return send(res, 429, { error: "too many requests" });

  let batch;
  try {
    batch = parseBatch(await readBody(req));
  } catch {
    return send(res, 413, { error: "body too large" });
  }
  if (!batch) return send(res, 400, { error: "invalid batch" });

  try {
    await pool.query(UPSERT, [batch.cells, batch.counts]);
    readCache = null;
    send(res, 204);
  } catch (err) {
    console.error("db error:", err.message);
    send(res, 500, { error: "storage failed" });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`plzen-hex-api listening on 127.0.0.1:${PORT}`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => pool.end().then(() => process.exit(0))));
