// Plays a benchmark with a baseline agent through the public window.arcade API and writes the run.
//   node agents/run.mjs <agent> <benchmark-id> [--base http://127.0.0.1:8765] [--out ../data/runs]
// Agents: random (any game), heuristic (block-drop), greedy-color-stack, greedy-pill-drop.
// Each module exports { player, choose(observation) }.
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [agentName, benchId, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : fallback;
};
const base = opt("--base", "http://127.0.0.1:8765");
const outDir = path.resolve(opt("--out", path.join(here, "../../data/runs")));
if (!agentName || !benchId) {
  console.error("usage: node agents/run.mjs <random|heuristic|greedy-color-stack|greedy-pill-drop> <benchmark-id>");
  process.exit(2);
}

const benchmarks = JSON.parse(await readFile(path.join(here, "../../data/benchmarks.json"), "utf8"));
const bench = benchmarks.find((b) => b.id === benchId);
if (!bench) throw new Error(`unknown benchmark ${benchId}`);
const agent = await import(`./${agentName}.mjs`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/games/${bench.game}/?agent=1&seed=${bench.seed}&bench=${bench.bench}`);
await page.waitForFunction(() => window.arcade && window.arcade.observe().ready);

let obs = await page.evaluate(() => window.arcade.observe());
while (!obs.over) {
  const action = agent.choose(obs);
  obs = await page.evaluate((a) => window.arcade.act(a), action);
  if (!obs.ok) throw new Error(`${action}: ${obs.error}`);
}
const run = await page.evaluate(() => window.arcade.run());
await browser.close();

const date = new Date().toISOString().slice(0, 10);
const record = {
  protocol: run.protocol,
  game: run.game,
  bench: run.bench,
  seed: run.seed,
  mode: run.mode,
  player: agent.player,
  date,
  score: run.score,
  stats: run.stats,
  actions: run.actions,
};
const file = path.join(outDir, bench.game, bench.bench, `${agent.player.id}.json`);
await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, JSON.stringify(record) + "\n");
console.log(`${agent.player.name}: score ${run.score}, ${JSON.stringify(run.stats)} -> ${path.relative(process.cwd(), file)}`);
