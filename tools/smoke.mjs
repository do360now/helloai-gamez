// Browser smoke checks for the landing page, the end-of-run report and the discovery files.
//   node smoke.mjs [name-filter]
// Serves the repo itself on a free port (no npm run serve needed), then runs every tools/smoke/*.mjs in name
// order. Each of those exports default async function (t), with t = {base, root, browser, check, assert, serve}:
// base is the served repo root, browser() launches chromium on first use and returns the shared instance,
// check(name, fn) runs one named check, assert(cond, msg) fails it, serve(dir, {missing}) starts another server.
// Prints "ok <name>" or "FAIL <name>: <reason>" per check and exits 1 if any check failed.
import { chromium } from "playwright";
import http from "node:http";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const filter = process.argv[2] || "";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".css": "text/css", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
};

// A static server for dir on an ephemeral port. opts.missing lists URL paths that answer 404, to simulate a failed fetch.
async function serve(dir = root, opts = {}) {
  const missing = new Set(opts.missing || []);
  const server = http.createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(dir, p);
    if (missing.has(p) || !file.startsWith(dir + path.sep)) { res.writeHead(404); res.end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

class CheckFailed extends Error {}
function assert(cond, msg) { if (!cond) throw new CheckFailed(msg); }

let failed = 0;
async function check(name, fn) {
  if (filter && !name.includes(filter)) return;
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e instanceof CheckFailed ? e.message : e.stack || e}`);
  }
}

const site = await serve();
let launched = null;
const browser = () => (launched ||= chromium.launch());
const files = (await readdir(path.join(here, "smoke")).catch(() => [])).filter((f) => f.endsWith(".mjs")).sort();
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(here, "smoke", f)).href);
  try {
    await mod.default({ base: site.base, root, browser, check, assert, serve });
  } catch (e) {
    failed++;
    console.log(`FAIL ${f}: ${e.stack || e}`);
  }
}
if (launched) await (await launched).close();
await site.close();
process.exit(failed ? 1 : 0);
