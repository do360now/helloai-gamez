// The end-of-run report on observe() and the personal best in the banner (games/arcade.js).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { choose } from "../agents/random.mjs";

const BENCH = "/games/block-drop/?agent=1&seed=20261022&bench=sprint-40";
const fmt = (n) => Number(n).toLocaleString("en-US");

// The official best for a benchmark, ranked like the landing page: score, then the tiebreak stat (lower wins).
function officialBest(index, game, bench) {
  const info = index.benchmarks.find((b) => b.game === game && b.bench === bench) || {};
  const runs = index.runs.filter((r) => r.game === game && r.bench === bench && r.seed === info.seed);
  runs.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const k = info.tiebreak;
    const x = k && a.stats ? a.stats[k] : undefined, y = k && b.stats ? b.stats[k] : undefined;
    return typeof x === "number" && typeof y === "number" ? x - y : 0;
  });
  return runs[0] || null;
}

async function open(browser, url) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.arcade && window.arcade.observe().ready);
  return { context, page, errors };
}

// Plays random legal placements until the run is over; returns the last observation.
async function playOut(page) {
  let obs = await page.evaluate(() => window.arcade.observe());
  while (!obs.over) obs = await page.evaluate((a) => window.arcade.act(a), choose(obs));
  return obs;
}

const bannerText = (page) => page.textContent("#arcade-banner");

export default async function (t) {
  const index = JSON.parse(await readFile(path.join(t.root, "data/runs/index.json"), "utf8"));
  const best = officialBest(index, "block-drop", "sprint-40");
  const browser = await t.browser();

  await t.check("report: absent while live, complete when over", async () => {
    const { context, page, errors } = await open(browser, t.base + BENCH);
    try {
      // The banner's index.json fetch is what sets the leader; wait for it before the run ends.
      await page.waitForFunction(() => window.Arcade.leader !== null);
      const live = await page.evaluate(() => window.arcade.observe());
      t.assert(!("report" in live), "no report while live");
      const obs = await playOut(page);
      const r = obs.report;
      t.assert(r && r.score === obs.score, "report.score matches observe().score");
      const run = await page.evaluate(() => window.arcade.run());
      t.assert(JSON.stringify(r.stats) === JSON.stringify(run.stats), "report.stats matches run().stats");
      t.assert(!("report" in run), "run() has no report");
      t.assert(r.leader && r.leader.score === best.score && r.leader.name === best.player.name,
        `report.leader is ${best.player.name} ${best.score}, got ${JSON.stringify(r.leader)}`);
      t.assert(r.say.startsWith(`Run over: ${fmt(obs.score)} points, ${run.stats.lines} line`), `say starts with the score: ${r.say}`);
      t.assert(r.say.includes(`${run.stats.pieces} pieces`) && r.say.includes(`level ${run.stats.level}`), `say has pieces and level: ${r.say}`);
      t.assert(r.say.includes(`The official best is ${fmt(best.score)} (${best.player.name}).`), `say has the official best: ${r.say}`);
      t.assert(r.say.endsWith("/agents.md#after-the-run"), `say ends with the link: ${r.say}`);
      t.assert(!errors.length, errors.join("; "));
    } finally {
      await context.close();
    }
  });

  await t.check("banner: new best on a first run", async () => {
    const { context, page } = await open(browser, t.base + BENCH);
    try {
      await playOut(page);
      await page.waitForFunction(() => /new best/.test(document.getElementById("arcade-banner").textContent));
      t.assert(!/your best/.test(await bannerText(page)), "no your-best line on a record");
    } finally {
      await context.close();
    }
  });

  await t.check("banner: submit opens the issue form with the run", async () => {
    const { context, page, errors } = await open(browser, t.base + BENCH);
    try {
      await playOut(page);
      await page.evaluate(() => { window.open = (url) => { window.__opened = url; }; });
      await page.click("#arcade-banner button:text('SUBMIT TO SCOREBOARD')");
      const url = new URL(await page.evaluate(() => window.__opened));
      const run = await page.evaluate(() => window.arcade.run());
      t.assert(url.origin + url.pathname === "https://github.com/do360now/helloai-gamez/issues/new", `form url: ${url}`);
      t.assert(url.searchParams.get("template") === "run-submission.yml", "uses the run-submission template");
      t.assert(url.searchParams.get("run") === JSON.stringify(run), "run is prefilled exactly");
      t.assert(url.searchParams.get("title").endsWith(fmt(run.score)), `title has the score: ${url.searchParams.get("title")}`);
      t.assert(!errors.length, errors.join("; "));
    } finally {
      await context.close();
    }
  });

  await t.check("banner: your best N when the run is below the stored best", async () => {
    const { context, page } = await open(browser, t.base + BENCH);
    try {
      await page.evaluate(() => localStorage.setItem("arcade.best.block-drop.sprint-40.20261022.turn",
        JSON.stringify({ score: 987654, stats: {}, at: "2026-10-25T00:00:00.000Z" })));
      await page.reload();
      await page.waitForFunction(() => window.arcade && window.arcade.observe().ready);
      const live = await bannerText(page);
      t.assert(!/your best|new best/.test(live), "no personal line while live");
      await playOut(page);
      await page.waitForFunction(() => /your best 987,654/.test(document.getElementById("arcade-banner").textContent));
      t.assert(!/new best/.test(await bannerText(page)), "no new best below the record");
    } finally {
      await context.close();
    }
  });

  await t.check("report: no index.json, leader null and no official best", async () => {
    const site = await t.serve(t.root, { missing: ["/data/runs/index.json"] });
    const { context, page, errors } = await open(browser, site.base + BENCH);
    try {
      const obs = await playOut(page);
      t.assert(obs.report && obs.report.leader === null, `leader null, got ${JSON.stringify(obs.report && obs.report.leader)}`);
      t.assert(obs.report.say.includes(fmt(obs.score)) && !obs.report.say.includes("official best"), `say: ${obs.report.say}`);
      t.assert(!errors.length, errors.join("; "));
    } finally {
      await context.close();
      await site.close();
    }
  });

  await t.check("report: replay has a report and no personal best", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(t.base + "/games/block-drop/?replay=data/runs/block-drop/sprint-40/baseline-random.json&speed=0");
      await page.waitForFunction(() => document.documentElement.hasAttribute("data-replay-done"), null, { timeout: 60000 });
      const obs = await page.evaluate(() => window.arcade.observe());
      t.assert(obs.over && obs.report && obs.report.score === obs.score, "report on a finished replay");
      await page.waitForTimeout(400);   // the banner re-renders every 300 ms
      t.assert(!/your best|new best/.test(await bannerText(page)), "no personal line in a replay");
    } finally {
      await context.close();
    }
  });

  await t.check("report: realtime game over", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(t.base + "/games/block-drop/?seed=20261022&bench=sprint-40");
      await page.waitForFunction(() => window.arcade && window.Arcade.adapter);
      await page.keyboard.press("Space");   // starts the game
      for (let i = 0; i < 200 && !(await page.evaluate(() => window.arcade.observe().over)); i++) {
        await page.keyboard.press("Space");   // hard drop
        await page.waitForTimeout(60);
      }
      const obs = await page.evaluate(() => window.arcade.observe());
      t.assert(obs.over, "realtime game ended");
      t.assert(obs.report && obs.report.score === obs.score, "report on a realtime game over");
      await page.waitForFunction(() => /new best/.test(document.getElementById("arcade-banner").textContent));
    } finally {
      await context.close();
    }
  });
}
