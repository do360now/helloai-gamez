// Rebuilds data/runs/index.json, the scoreboard the home page reads: every run without its action list.
//   node build-index.mjs
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runsDir = path.join(root, "data/runs");
const benchmarks = JSON.parse(await readFile(path.join(root, "data/benchmarks.json"), "utf8"));

const runs = [];
for (const b of benchmarks) {
  const dir = path.join(runsDir, b.game, b.bench);
  let names = [];
  try { names = (await readdir(dir)).filter((n) => n.endsWith(".json")); } catch { continue; }
  for (const name of names) {
    const run = JSON.parse(await readFile(path.join(dir, name), "utf8"));
    if (run.seed !== b.seed) continue;
    const { actions, ...rest } = run;
    runs.push({ benchmark: b.id, file: `data/runs/${b.game}/${b.bench}/${name}`, moves: actions.length, ...rest });
  }
}
runs.sort((a, b) => a.benchmark.localeCompare(b.benchmark) || b.score - a.score);
await writeFile(path.join(runsDir, "index.json"), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), benchmarks, runs }, null, 1) + "\n");
console.log(`${runs.length} runs in data/runs/index.json`);
