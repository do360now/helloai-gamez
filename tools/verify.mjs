// Replays every recorded run in a browser and checks that the game reaches the same score and stats.
//   node verify.mjs [run.json ...] [--base http://127.0.0.1:8765]
// With no files, verifies everything under data/runs/. Exits 1 if any run does not reproduce.
import { chromium } from "playwright";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const bi = args.indexOf("--base");
const base = bi >= 0 ? args.splice(bi, 2)[1] : "http://127.0.0.1:8765";

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith(".json") && e.name !== "index.json") out.push(p);
  }
  return out;
}

const files = args.length ? args.map((f) => path.resolve(f)) : await walk(path.join(root, "data/runs"));
const benchmarks = JSON.parse(await readFile(path.join(root, "data/benchmarks.json"), "utf8"));
const browser = await chromium.launch();
let failed = 0;

for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  const run = JSON.parse(await readFile(file, "utf8"));
  const problems = [];
  const bench = benchmarks.find((b) => b.game === run.game && b.bench === run.bench);
  if (!bench) problems.push(`no benchmark ${run.game}/${run.bench}`);
  else if (bench.seed !== run.seed) problems.push(`seed ${run.seed} is not the benchmark seed ${bench.seed}`);
  // A real-time run logs every input and gravity step, so it replays turn by turn like any other.
  if (run.mode !== "turn" && run.mode !== "realtime") problems.push(`mode must be "turn" or "realtime"`);
  if (bench && bench.disclosure && !["blind", "open-book"].includes(run.player && run.player.disclosure)) problems.push('player.disclosure must be "blind" or "open-book"');

  if (!problems.length) {
    const page = await browser.newPage();
    await page.goto(`${base}/games/${run.game}/?replay=${rel}&speed=0`);
    await page.waitForFunction(
      () => document.documentElement.hasAttribute("data-replay-done") || document.documentElement.hasAttribute("data-arcade-error"),
      null,
      { timeout: 120000 },
    );
    const error = await page.evaluate(() => document.documentElement.getAttribute("data-arcade-error"));
    const got = await page.evaluate(() => window.arcade.run());
    await page.close();
    if (error) problems.push(error);
    if (got.actions.length !== run.actions.length) problems.push(`only ${got.actions.length}/${run.actions.length} actions applied`);
    if (got.score !== run.score) problems.push(`score ${got.score}, recorded ${run.score}`);
    for (const [k, v] of Object.entries(run.stats || {})) {
      if (got.stats[k] !== v) problems.push(`${k} ${got.stats[k]}, recorded ${v}`);
    }
    if (!got.over) problems.push("replay did not finish the game");
  }

  if (problems.length) {
    failed++;
    console.log(`FAIL ${rel}: ${problems.join("; ")}`);
  } else {
    console.log(`ok   ${rel}: score ${run.score}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
