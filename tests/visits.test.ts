// Anonymous visit reporter against a stand-in server that uses the real server validation (server/batch.js):
// entry counting, GPS-jitter de-duplication, offline queue, retries, opt-out.
import { Window } from "happy-dom";
import http from "node:http";
import { parseBatch } from "../server/batch.js";
const win = new Window({ url: "https://localhost/" });
let online = true;
Object.assign(globalThis, { window: win, document: win.document, localStorage: win.localStorage });
Object.defineProperty(globalThis, "navigator", { value: { get onLine() { return online; } }, configurable: true });
const { VisitReporter } = await import("../src/analytics/visits");

// Stand-in server: real validation, totals in memory, can be told to fail.
const totals: Record<string, number> = {}; let fail = false; let requests = 0;
const srv = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
  requests++;
  if (fail) { res.writeHead(500).end(); return; }
  const batch = parseBatch(b); if (!batch) { res.writeHead(400).end(); return; }
  batch.cells.forEach((c: string, i: number) => (totals[c] = (totals[c] ?? 0) + batch.counts[i])); res.writeHead(204).end(); }); });
await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
const url = `http://127.0.0.1:${(srv.address() as any).port}/api/visits`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0; const check = (n: string, ok: boolean, info: unknown = "") => { if (!ok) failures++; console.log(ok ? "PASS" : "FAIL", n, ok ? "" : info); };
const queue = () => JSON.parse(localStorage.getItem("plzen-hex:visit-queue") ?? "{}");

const A = "871e30d52ffffff", B = "871e30d53ffffff", C = "871e30d52ffffff-31";
const r = new VisitReporter(url);
let t = 1_000_000;
r.record(A, t); await sleep(50);
check("first entry sent", totals[A] === 1, totals);
r.record(A, (t += 5000)); await sleep(50);
check("staying in same cell doesn't count", totals[A] === 1);
r.record(B, (t += 60_000)); r.record(A, (t += 60_000)); await sleep(50);
check("jitter re-entry within 10 min ignored", totals[A] === 1 && totals[B] === 1, totals);
r.record(B, (t += 11 * 60_000)); r.record(A, (t += 11 * 60_000)); await sleep(50);
check("real re-entry after 10 min counts", totals[A] === 2 && totals[B] === 2, totals);

online = false;
r.record(C, (t += 60_000)); r.record(A, (t += 11 * 60_000)); await sleep(50);
check("offline: queued, not sent", !totals[C] && queue()[C] === 1 && queue()[A] === 1, queue());
online = true; win.dispatchEvent(new win.Event("online")); await sleep(80);
check("back online: queue flushed", totals[C] === 1 && totals[A] === 3 && Object.keys(queue()).length === 0, { totals, q: queue() });

fail = true; r.record(B, (t += 11 * 60_000)); await sleep(50);
check("server error: kept in queue", queue()[B] === 1 && totals[B] === 2);
fail = false; await r.flush();
check("retry after error succeeds", totals[B] === 3 && !queue()[B], { totals, q: queue() });

const r2 = new VisitReporter(url);
check("new instance (app restart) picks up nothing stale", Object.keys(queue()).length === 0);
localStorage.setItem("plzen-hex:visit-queue", JSON.stringify({ "bogus": 3 }));
const r3 = new VisitReporter(url); await sleep(50);
check("invalid stale batch (400) is dropped, not retried forever", Object.keys(queue()).length === 0, queue());

r3.setEnabled(false); const before = requests;
r3.record(A, (t += 11 * 60_000)); await sleep(50);
check("opted out: nothing queued or sent", requests === before && Object.keys(queue()).length === 0 && !r3.enabled);
r3.setEnabled(true); check("opt back in", r3.enabled);
const off = new VisitReporter(null); off.record(A, t + 99e6); await sleep(30);
check("no URL (dev build): disabled", !off.available && !off.enabled && Object.keys(queue()).length === 0);
void r2;
srv.close(); await win.happyDOM.close();
console.log(failures ? `${failures} FAILED` : "ALL PASSED"); process.exit(failures ? 1 : 0);
