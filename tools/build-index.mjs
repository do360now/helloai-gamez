// Rebuilds data/runs/index.json, the scoreboard the home page reads: every run without its action list.
//   node build-index.mjs            write it
//   node build-index.mjs --check    exit 1 if the committed index differs (ignoring its date)
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
// Within a benchmark: score first; then, only where the benchmark declares a tiebreak (a stats key,
// lower is better, for example "commands"), that stat; otherwise the order is left as is.
const tiebreakOf = Object.fromEntries(benchmarks.map((b) => [b.id, b.tiebreak || null]));
function compare(a, b) {
  if (a.benchmark !== b.benchmark) return a.benchmark.localeCompare(b.benchmark);
  if (a.score !== b.score) return b.score - a.score;
  const key = tiebreakOf[a.benchmark];
  const x = key && a.stats ? a.stats[key] : undefined;
  const y = key && b.stats ? b.stats[key] : undefined;
  return typeof x === "number" && typeof y === "number" ? x - y : 0;
}
runs.sort(compare);
const indexFile = path.join(runsDir, "index.json");
if (process.argv.includes("--check")) {
  const { updated, ...committed } = JSON.parse(await readFile(indexFile, "utf8"));
  const same = JSON.stringify(committed) === JSON.stringify({ benchmarks, runs });
  console.log(same ? `data/runs/index.json is up to date (${runs.length} runs)` : "data/runs/index.json is stale: run node build-index.mjs");
  process.exit(same ? 0 : 1);
}
await writeFile(indexFile, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), benchmarks, runs }, null, 1) + "\n");
console.log(`${runs.length} runs in data/runs/index.json`);
