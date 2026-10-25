// Landing page: "Copy for your agent" on every benchmark and in #agents (plan Task 2).
import { readFile } from "node:fs/promises";
import path from "node:path";

export default async function ({ base, root, browser, check, assert }) {
  const benches = JSON.parse(await readFile(path.join(root, "data/runs/index.json"), "utf8")).benchmarks;
  const sel = (scope, cls, id) => `${scope} .${cls}[data-bench="${id}"]`;
  const BD = "block-drop/sprint-40";

  async function open(opts = {}, init) {
    const ctx = await (await browser()).newContext(opts);
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(base + "/");
    await page.waitForSelector(".bench .copy-prompt", { timeout: 10000 });
    return { ctx, page, errors };
  }

  await check("landing: copy control for every benchmark", async () => {
    const { ctx, page } = await open();
    try {
      for (const b of benches) {
        assert(await page.$(sel(".bench", "copy-prompt", b.id)), `copy control for ${b.id}`);
        const pre = await page.$eval(sel(".bench", "agent-prompt", b.id), (e) => ({ hidden: e.hidden, text: e.textContent }));
        assert(pre.hidden, `prompt for ${b.id} hidden before click`);
        assert(pre.text.length > 0 && !pre.text.includes("undefined"), `prompt text for ${b.id}`);
        assert(pre.text.includes("without writing a solver unless I ask for one"), `no-solver sentence for ${b.id}`);
      }
    } finally { await ctx.close(); }
  });

  await check("landing: click reveals the prompt for this origin and the label flips to Copied", async () => {
    const { ctx, page, errors } = await open({ permissions: ["clipboard-read", "clipboard-write"] });
    try {
      await page.click(sel(".bench", "copy-prompt", BD));
      const shown = await page.$eval(sel(".bench", "agent-prompt", BD), (e) => ({ hidden: e.hidden, text: e.textContent }));
      assert(!shown.hidden, "prompt revealed");
      assert(shown.text.includes(base + "/games/block-drop/?agent=1&seed=20261022&bench=sprint-40"), "prompt uses this origin");
      const s = sel(".bench", "copy-prompt", BD);
      await page.waitForFunction((q) => document.querySelector(q).textContent === "Copied", s, { timeout: 3000 });
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      assert(clip === shown.text, "clipboard holds the prompt");
      await page.waitForFunction((q) => document.querySelector(q).textContent === "Copy for your agent", s, { timeout: 4000 });
      assert(errors.length === 0, "page errors: " + errors.join("; "));
    } finally { await ctx.close(); }
  });

  await check("landing: #agents has the copy control", async () => {
    const { ctx, page } = await open();
    try {
      await page.waitForSelector(sel("#agents", "copy-prompt", BD));
      assert(await page.$(sel("#agents", "agent-prompt", BD)), "#agents prompt");
    } finally { await ctx.close(); }
  });

  await check("landing: no clipboard API still reveals and selects, says Select & copy, no page error", async () => {
    const { ctx, page, errors } = await open({}, () => { Object.defineProperty(navigator, "clipboard", { value: undefined }); });
    try {
      const s = sel(".bench", "copy-prompt", BD);
      await page.click(s);
      assert(!(await page.$eval(sel(".bench", "agent-prompt", BD), (e) => e.hidden)), "prompt revealed");
      await page.waitForFunction((q) => document.querySelector(q).textContent === "Select & copy", s, { timeout: 3000 });
      const picked = await page.evaluate(() => String(window.getSelection()));
      assert(picked.includes("without writing a solver"), "prompt text selected for a hand copy");
      assert(errors.length === 0, "page errors: " + errors.join("; "));
    } finally { await ctx.close(); }
  });

  await check("landing: 390px wide, revealed prompts do not scroll sideways", async () => {
    const { ctx, page } = await open({ viewport: { width: 390, height: 844 } });
    try {
      for (const b of benches) await page.click(sel(".bench", "copy-prompt", b.id));
      await page.click(sel("#agents", "copy-prompt", BD));
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      assert(w.sw <= w.iw, `scrollWidth ${w.sw} > ${w.iw}`);
    } finally { await ctx.close(); }
  });
}
