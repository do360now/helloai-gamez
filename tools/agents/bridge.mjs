// Puts a benchmark game behind a local HTTP endpoint, so any agent that can make HTTP requests can play it.
//   node agents/bridge.mjs <benchmark-id> --id <player-id> --name "<name>" [--model <model>] [--harness "<text>"] [--port 8770]
//   GET  /            the board as text (what an LLM reads)
//   GET  /observe     the full observation as JSON
//   POST /act         body: one action, for example "place 1 4"; replies with the new board as text
// When the game ends the run is written to data/runs/<game>/<bench>/<player-id>.json and the bridge exits.
import { chromium } from "playwright";
import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [benchId, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : fallback;
};
const base = opt("--base", "http://127.0.0.1:8765");
const port = Number(opt("--port", "8770"));
const player = {
  id: opt("--id"),
  name: opt("--name"),
  kind: opt("--kind", "llm"),
  model: opt("--model", null),
  harness: opt("--harness", "tools/agents/bridge.mjs, text observations"),
  notes: opt("--notes", null),
};
if (!benchId || !player.id || !player.name || !/^[a-z0-9-]+$/.test(player.id)) {
  console.error('usage: node agents/bridge.mjs <benchmark-id> --id <lowercase-id> --name "<name>" [--model <model>]');
  process.exit(2);
}

const benchmarks = JSON.parse(await readFile(path.join(here, "../../data/benchmarks.json"), "utf8"));
const bench = benchmarks.find((b) => b.id === benchId);
if (!bench) throw new Error(`unknown benchmark ${benchId}`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/games/${bench.game}/?agent=1&seed=${bench.seed}&bench=${bench.bench}`);
await page.waitForFunction(() => window.arcade && window.arcade.observe().ready);

async function finish() {
  const run = await page.evaluate(() => window.arcade.run());
  const record = {
    protocol: run.protocol, game: run.game, bench: run.bench, seed: run.seed, mode: run.mode,
    player, date: new Date().toISOString().slice(0, 10), score: run.score, stats: run.stats, actions: run.actions,
  };
  const file = path.resolve(here, "../../data/runs", bench.game, bench.bench, `${player.id}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(record) + "\n");
  console.log(`run saved: score ${run.score} ${JSON.stringify(run.stats)} -> ${file}`);
  await browser.close();
  process.exit(0);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/observe") {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify(await page.evaluate(() => window.arcade.observe())));
    }
    if (req.method === "GET" && req.url === "/") {
      return res.end((await page.evaluate(() => window.arcade.observe())).text + "\n");
    }
    if (req.method === "POST" && req.url === "/act") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const obs = await page.evaluate((a) => window.arcade.act(a), body.trim());
      res.end((obs.ok ? "" : `ERROR ${obs.error}\n`) + obs.text + "\n");
      if (obs.over) setTimeout(finish, 50);
      return;
    }
    res.statusCode = 404;
    res.end("GET / | GET /observe | POST /act\n");
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e) + "\n");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`bridge on http://127.0.0.1:${port}/ for ${bench.id}`));
