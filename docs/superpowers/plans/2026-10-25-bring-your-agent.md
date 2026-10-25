# Bring Your Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor copies one prompt from any benchmark on play.helloai.com, pastes it into their agent's chat, and the agent plays that benchmark and reports its score; an agent that lands anywhere on the site finds the protocol in one hop; a finished run tells the agent what to report.

**Architecture:** No server changes. A small browser script `games/prompt.js` builds the paste-to-agent prompt from a benchmark entry and is loaded by the landing page; `index.html` adds a copy control per benchmark; `games/arcade.js` adds a `report` object to the observation once the run is over and shows the browser's best in the banner; `agents.md`, `llms.txt`, a new `robots.txt` and each game page's `<head>` make the protocol discoverable. Everything the design calls "the two-layer scoreboard" already exists (`saveBest()` in `arcade.js`, the "You" rows in `renderBench()`), so no task touches it beyond the banner line.

**Tech Stack:** Plain HTML, CSS and ES5-style browser JavaScript as in the existing files. Node 22 with `node --test` for unit tests (`cd tools && npm test`). Playwright 1.48 (already in `tools/node_modules`) for the browser smoke script and `tools/verify.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-25-bring-your-agent-design.md`

## Global Constraints

- No build step, no new dependencies; `index.html` and `games/arcade.js` stay ES5-style scripts.
- No new server code: `api/views.php` remains the only endpoint. Nothing identifies a visitor to the server.
- The recorder, `arcade.run()`, `observe().text`, `score`, `stats` and `actions` are unchanged, so every run in `data/runs` keeps verifying: `cd tools && node verify.mjs` must print `ok` for all 14 runs after every task that touches `games/arcade.js`.
- The default prompt asks for the model's own play from the text board and contains the sentence "without writing a solver unless I ask for one"; code is the human's explicit choice.
- An unverified score is never shown as an official row; the "You" rows and the banner's "your best" are the only places a local score appears.
- Pages fetch `/data/runs/index.json`, so test from a local web server: `cd tools && npm run serve` (port 8765). Ports 8770 to 8783 may be held by stray servers on the maintainer's machine.
- `docs/` is kept off the docroot by `deploy.sh`; nothing in this plan is served from it. `robots.txt` is a site file and ships.
- Stage files explicitly (`git add <paths>`), never `git add -A`; other sessions write into this tree.
- Don't use "Tetris" in names, files, variables or comments.

## Review Focus

1. A browser that blocks `navigator.clipboard` (plain HTTP, an iframe, Firefox without a user gesture): the copy control must still reveal the prompt text so it can be selected by hand, and must not throw. Test in Task 2 (smoke) and Task 1 (the builder never touches the DOM).
2. A benchmark entry without `rules` or with an unknown game id (a future game): `agentPrompt()` must still produce a prompt with the URL and the generic action hint, never `undefined` in the text. Test in Task 1.
3. `observe()` called before `index.json` has loaded or after the fetch failed: `report.leader` is `null` and `report.say` omits the official-best sentence, with no exception. Test in Task 3 (smoke serves a copy of the repo with `index.json` renamed).
4. A realtime (gravity) game over, and a replay page (`?replay=`): `report` must appear on game over in both, and the banner's "your best" must not be added during a replay. Test in Task 3.
5. Night Shift's prompt: the disclosure line must be present and the piece-count phrasing must not appear (it has commands, not pieces). Test in Task 1.

---

### Task 1: `games/prompt.js`, the paste-to-agent prompt builder

**Files:**
- Create: `games/prompt.js`
- Test: `tools/test/prompt.test.mjs`

**Interfaces:**
- Produces: `agentPrompt(bench, origin)` where `bench` is one entry of `data/benchmarks.json` or `index.json.benchmarks` (`{id, game, bench, seed, title, rules, tiebreak?, disclosure?}`) and `origin` is a string such as `"https://play.helloai.com"` (no trailing slash). Returns the prompt as a string. Exposed as `window.arcadePrompt.agentPrompt` in a browser and as `exports.agentPrompt` under CommonJS, from one file:

```js
(function (root) {
  "use strict";
  var HINTS = { /* per game, see Step 3 */ };
  function agentPrompt(bench, origin) { /* ... */ }
  var api = { agentPrompt: agentPrompt, HINTS: HINTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.arcadePrompt = api;
})(typeof window !== "undefined" ? window : this);
```

The repo root has no `package.json`, so Node loads `games/prompt.js` as CommonJS and an ESM test under `tools/` can `import { agentPrompt } from "../../games/prompt.js"`.

- [ ] **Step 1: Write the failing test**

`tools/test/prompt.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { agentPrompt } from "../../games/prompt.js";

const benches = JSON.parse(await readFile(new URL("../../data/benchmarks.json", import.meta.url), "utf8"));
const by = (id) => benches.find((b) => b.id === id);
const ORIGIN = "https://play.helloai.com";

test("block drop prompt carries the url, the rules, the no-solver sentence and the footer", () => {
  const p = agentPrompt(by("block-drop/sprint-40"), ORIGIN);
  assert.match(p, /^Play Block Drop: Sprint 40 on play\.helloai\.com for me and report the score\./);
  assert.ok(p.includes("https://play.helloai.com/games/block-drop/?agent=1&seed=20261022&bench=sprint-40"));
  assert.ok(p.includes(by("block-drop/sprint-40").rules));
  assert.ok(p.includes("without writing a solver unless I ask for one"));
  assert.ok(p.includes("https://play.helloai.com/agents.md"));
  assert.ok(p.includes('arcade.act("place R C")'));
  assert.ok(p.includes("one decision per piece"));
  assert.ok(p.includes("keep the JSON from arcade.run()"));
  assert.ok(p.includes("No browser tool? Clone https://github.com/do360now/helloai-gamez"));
  assert.ok(!p.includes("undefined"));
});

test("night shift prompt asks for disclosure and speaks of commands, not pieces", () => {
  const p = agentPrompt(by("night-shift/case-150"), ORIGIN);
  assert.ok(p.includes("https://play.helloai.com/games/night-shift/?seed=20261022&bench=case-150"));
  assert.ok(!p.includes("agent=1"));
  assert.ok(p.includes('arcade.act("look at board")'));
  assert.ok(p.includes("one command per turn"));
  assert.ok(p.includes("player.disclosure"));
  assert.ok(p.includes("blind"));
  assert.ok(!/piece/i.test(p));
});

test("color stack and pill drop name their place arguments", () => {
  assert.ok(agentPrompt(by("color-stack/sprint-40"), ORIGIN).includes("cycle R, column C"));
  assert.ok(agentPrompt(by("pill-drop/sprint-40"), ORIGIN).includes("orientation R, column C"));
});

test("an unknown game and missing rules still make a usable prompt", () => {
  const p = agentPrompt({ id: "hexa-fall/sprint-40", game: "hexa-fall", bench: "sprint-40", seed: 7, title: "Hexa Fall: Sprint 40" }, ORIGIN);
  assert.ok(p.includes("https://play.helloai.com/games/hexa-fall/?agent=1&seed=7&bench=sprint-40"));
  assert.ok(p.includes("arcade.info()"));
  assert.ok(!p.includes("undefined"));
  assert.ok(!p.includes("Rules: \n"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tools && node --test test/prompt.test.mjs`
Expected: FAIL, cannot find module `../../games/prompt.js`.

- [ ] **Step 3: Implement `agentPrompt(bench, origin)` in `games/prompt.js`**

`HINTS` keyed by game id, each `{ act, decision, extra }`:

| game | act | decision | extra |
|---|---|---|---|
| block-drop | `arcade.act("place R C")` (rotation R, column C) | one decision per piece | (none) |
| color-stack | `arcade.act("place R C")` (cycle R, column C) | one decision per piece | (none) |
| pill-drop | `arcade.act("place R C")` (orientation R, column C) | one decision per pill | (none) |
| night-shift | `arcade.act("look at board")`, any plain command | one command per turn, 150 commands in the budget | "Say whether you played blind (text only) or open-book (you read the source or world data); the run needs player.disclosure." |
| default | `arcade.act(action)` with an action from `arcade.info().actions` | one decision per move | (none) |

The URL is `origin + "/games/" + game + "/?" + (game === "night-shift" ? "" : "agent=1&") + "seed=" + seed + "&bench=" + bench`. Night Shift is always turn-based (see `agents.md`), so it takes no `agent=1`; every other game does. `origin` is used as given when it starts with `http://` or `https://`; otherwise `https://play.helloai.com` is used (add a test: `agentPrompt(by("block-drop/sprint-40"), "null")` and `agentPrompt(..., "file://")` both contain `https://play.helloai.com/games/`). Step 3's `Rules:` line is the whole `bench.rules` string, untrimmed.

The text is the five numbered steps from the spec, verbatim apart from the hint substitutions, then a blank line and the footer `No browser tool? Clone https://github.com/do360now/helloai-gamez and follow "No browser?" in agents.md.` Step 3 (`Rules: ...`) is omitted entirely when `bench.rules` is falsy, and the later steps renumber. The `extra` line, when present, is appended to step 5 as its own sentence.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd tools && node --test test/prompt.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add games/prompt.js tools/test/prompt.test.mjs
git commit -m "Add the paste-to-agent prompt builder"
```

---

### Task 2: "Copy for your agent" on the landing page

**Files:**
- Modify: `index.html` (styles near line 152 `.link-btn`; the `#agents` lede and `.section-head` around lines 309-320; `renderBench()` around lines 586-605 where `.bench-side` is built; the script tag block at the end, line 631, to load `/games/prompt.js` before the inline script runs)
- Smoke test: `tools/smoke.mjs` (created here, extended in Task 3)

**Interfaces:**
- Consumes: `window.arcadePrompt.agentPrompt(bench, origin)` from Task 1.
- Produces: in the DOM, per benchmark, a `button.link-btn.copy-prompt[data-bench="<id>"]` labelled `Copy for your agent`, and a hidden `pre.agent-prompt[data-bench="<id>"]` that holds the prompt text and becomes visible after the first click. In `#agents`, one `button.link-btn.copy-prompt[data-bench="block-drop/sprint-40"]` plus its `pre.agent-prompt`. These selectors are what the smoke test and later tasks use.

- [ ] **Step 1: Write the failing smoke check**

Create `tools/smoke.mjs`: a script, not a `node --test` file, run by hand like `verify.mjs`. It starts a static server for the repo root on an ephemeral port using `node:http` (serve files by path, `index.html` for `/`, `application/json` for `.json`, 404 otherwise), launches Playwright chromium, and runs named checks that print `ok <name>` or `FAIL <name>: <reason>` and exit 1 on any failure. Checks for this task:

```js
// landing: copy control present for every benchmark in index.json
const benches = JSON.parse(await readFile("../data/runs/index.json")).benchmarks;
await page.goto(base + "/");
await page.waitForSelector(".bench .copy-prompt");
for (const b of benches) {
  assert(await page.$(`.bench .copy-prompt[data-bench="${b.id}"]`), `copy control for ${b.id}`);
}
// landing: clicking reveals the prompt and the text matches agentPrompt() for this origin
await page.click(`.bench .copy-prompt[data-bench="block-drop/sprint-40"]`);
const shown = await page.$eval(`.bench .agent-prompt[data-bench="block-drop/sprint-40"]`, (e) => ({ hidden: e.hidden, text: e.textContent }));
assert(!shown.hidden && shown.text.includes(base + "/games/block-drop/?agent=1&seed=20261022&bench=sprint-40"), "prompt revealed with this origin");
assert((await page.textContent(`.bench .copy-prompt[data-bench="block-drop/sprint-40"]`)) === "Copied", "label flips to Copied");
// landing: the #agents section has the control too
assert(await page.$(`#agents .copy-prompt[data-bench="block-drop/sprint-40"]`), "#agents copy control");
// landing: no clipboard API -> still reveals, no page error
```

For the last check, open a second page with `await context.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: undefined }); })`, collect `pageerror` events, click, and assert the `pre` is revealed and no error fired.

- [ ] **Step 2: Run the smoke script to verify it fails**

Run: `cd tools && npm run serve` is NOT needed; the script serves itself. `cd tools && node smoke.mjs`
Expected: `FAIL copy control for block-drop/sprint-40` (selector never appears), exit 1.

- [ ] **Step 3: Load the builder and add the control in `index.html`**

- Add `<script src="/games/prompt.js"></script>` immediately before the inline `<script>` that starts with `(function () { "use strict"; var GAMES = [`.
- In `renderBench(bench, runs)`, build `var promptText = window.arcadePrompt.agentPrompt(bench, location.origin);` and add to the `.bench-side div` (after the `Turn-based ↗` link) the button, and after the `.bench-head` (before `rows`) the `pre.agent-prompt` with `hidden = true`, `tabindex="0"`, text `promptText`.
- Write one helper `copyControl(bench, text)` returning `{button, pre}` and use it both in `renderBench` and in `#agents`. The click handler: reveal the `pre` (`hidden = false`), then `navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()`, and on either outcome set the label to `Copied` for 2000 ms, then back to `Copy for your agent`. On rejection also select the `pre` text (`window.getSelection().selectAllChildren(pre)`) so a hand copy is one keystroke. Never throw.
- In `#agents`: change the lede to end with "Bring your own: copy a benchmark's prompt below and paste it into your agent." Add under the `.section-head` a `div.paste` with the sentence "Paste this into your agent's chat. It works in claude.ai, a terminal session, or any agent with a browser tool." and a mount point `<div id="agents-copy"></div>`; after `index.json` loads, mount `copyControl()` for the first benchmark whose id is `block-drop/sprint-40` (fall back to `data.benchmarks[0]`).
- CSS: `.agent-prompt { font: 400 12px/1.6 var(--mono); white-space: pre-wrap; background: var(--bg-soft); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin: 12px 0 0; color: #b9b9c0; }`. Set `aria-live="polite"` on the button so the `Copied` flip is announced.

- [ ] **Step 4: Run the smoke script to verify it passes**

Run: `cd tools && node smoke.mjs`
Expected: `ok` for every landing check, exit 0.

- [ ] **Step 5: Look at it**

Run: `cd tools && npm run serve`, open `http://localhost:8765/#scoreboard`, click `Copy for your agent` on two benchmarks and in `#agents`, paste into a text editor. Check the phone width (390 px) in devtools: the `pre` wraps, no horizontal scroll.

- [ ] **Step 6: Commit**

```bash
git add index.html tools/smoke.mjs
git commit -m "Landing page: copy a paste-to-agent prompt for every benchmark"
```

---

### Task 3: `report` at the end of a run, and "your best" in the banner

**Files:**
- Modify: `games/arcade.js` (`snapshot()` lines 75-88; `saveBest()` lines 140-157; `banner()` lines 223-333, in particular the `leader` variable and the `fetch` at lines 317-329)
- Modify: `tools/smoke.mjs` (add the checks below)
- Modify: `agents.md` (the `observe()` field list under "The API: `window.arcade`", around lines 33-38: add `report`)

**Interfaces:**
- Produces, on `window.arcade.observe()` when `over` is true:

```js
report: {
  score: Number,
  stats: Object,                       // same as run().stats
  leader: { name: String, score: Number } | null,
  say: String                          // one or two sentences, see Step 3
}
```

`report` is absent (not `null`) while the run is live. `Arcade.leader` holds the top official run for this benchmark once `index.json` has loaded (`null` before, and on fetch error); the banner's existing fetch is the only loader.

- [ ] **Step 1: Write the failing smoke checks**

Append to `tools/smoke.mjs`, reusing `tools/agents/random.mjs` (`choose(obs)` returns a legal action) to finish a run quickly:

```js
// report: absent while live, present and complete when over
await page.goto(base + "/games/block-drop/?agent=1&seed=20261022&bench=sprint-40");
await page.waitForFunction(() => window.arcade && window.arcade.observe().ready);
let obs = await page.evaluate(() => window.arcade.observe());
assert(obs.report === undefined, "no report while live");
while (!obs.over) obs = await page.evaluate((a) => window.arcade.act(a), choose(obs));
assert(obs.report && obs.report.score === obs.score, "report.score matches");
assert(obs.report.leader && obs.report.leader.score === 4750, "report.leader is the official best");  // update if the board changes
assert(obs.report.say.includes(obs.score.toLocaleString("en-US")) && obs.report.say.includes("/agents.md#after-the-run"), "report.say");
const banner = await page.textContent("#arcade-banner");
assert(banner.includes("new best") || /your best [\d,]+/.test(banner), "banner shows new best or the previous best");  // a fresh context has no stored best, so the first run reads "new best"
// report without index.json: leader null, say still has the score
```

For the second check, serve a second root: copy `index.html`, `games/`, `data/benchmarks.json` into a temp dir without `data/runs/index.json` (or route `/data/runs/index.json` to 404 for a second server instance), play a random run, and assert `obs.report.leader === null` and `!obs.report.say.includes("official best")` with no `pageerror`.

Also one replay check: `page.goto(base + "/games/block-drop/?replay=data/runs/block-drop/sprint-40/baseline-random.json&speed=0")`, wait until `arcade.observe().over`, and assert `report` is present and the banner text does not contain `your best`.

- [ ] **Step 2: Run the smoke script to verify the new checks fail**

Run: `cd tools && node smoke.mjs`
Expected: `FAIL report.score matches` (report undefined), others after it fail or are skipped; landing checks still `ok`.

- [ ] **Step 3: Implement in `games/arcade.js`**

- Add `leader: null` and `bestBefore: null` to the `Arcade` object literal. In `banner()`'s fetch `.then`, sort `runs` by score descending and, for equal scores, by the benchmark's `tiebreak` stat ascending when both runs have it (the same rule `renderBench()` uses in `index.html`), then set `Arcade.leader = runs[0] || null` as well as the local `leader`.
- In `snapshot()`, after `o.text = a.text();`: if `o.over`, set `o.report = reportFor(o)`. Add `function reportFor(o)` that returns the object in Interfaces, with `leader` as `Arcade.leader ? { name: Arcade.leader.player.name, score: Arcade.leader.score } : null` (`Arcade.leader` is an entry of `index.json`'s `runs`). `say` is built as: `"Run over: " + fmt(score) + " points" + statsPhrase + ". "` followed, when `Arcade.leader` is set, by `"The official best is " + fmt(leader.score) + " (" + leader.player.name + "). "`, followed by `"Tell your human the score and how you played, and keep arcade.run() to submit it: /agents.md#after-the-run"`. `statsPhrase` joins up to three stats as `", 15 lines, 40 pieces"` using the keys in this order when present: `lines`, `pieces`, `cleared`, `viruses`, `level`, `commands`, `deaths`; skip the rest. `fmt` is `Number(n).toLocaleString("en-US")`.
- In `saveBest()`, set `Arcade.bestBefore = prev` (the parsed previous record or `null`) before deciding whether to write, and set `Arcade.bestWritten = better`. In `banner()`'s `contest()`: when `a.over()` and not `Arcade.replaying` and `Arcade.bench`, push `"new best"` when `Arcade.bestWritten` is true, else `"your best " + fmt(Arcade.bestBefore.score)` when `Arcade.bestBefore` exists. `saveBest()` runs before the `over` event (`Arcade.onGameOver`), so these are set by the time the banner renders.
- `agents.md`: in the `observe()` bullet list under "The API", add: "`report` (only when `over`): `{score, stats, leader, say}`; `say` is what to tell your human, see After the run."

- [ ] **Step 4: Run the smoke script and the verifier**

Run: `cd tools && node smoke.mjs && node verify.mjs`
Expected: all smoke checks `ok`; verify prints `ok` for all 14 runs.

- [ ] **Step 5: Commit**

```bash
git add games/arcade.js tools/smoke.mjs agents.md
git commit -m "arcade.js: report object at the end of a run, your best in the banner"
```

---

### Task 4: Discovery: game heads, agents.md, llms.txt, robots.txt

**Files:**
- Modify: `games/block-drop/index.html:3-11`, `games/color-stack/index.html:3-7`, `games/pill-drop/index.html:3-7`, `games/night-shift/index.html:3-7`
- Modify: `agents.md` (new opening section before line 1's heading body; new "After the run" section; the bridge paragraph at lines 188-190 becomes a "No browser?" section)
- Modify: `llms.txt`
- Create: `robots.txt`
- Modify: `tools/smoke.mjs` (static checks via the served files, no browser)

**Interfaces:**
- Produces: the anchors `#if-you-are-an-agent-start-here`, `#after-the-run` and `#no-browser` in `agents.md` (GitHub-style slugs of the headings `## If you are an agent, start here`, `## After the run`, `## No browser?`). Task 3's `report.say` and Task 1's prompt footer already point at these.

- [ ] **Step 1: Write the failing checks**

Append to `tools/smoke.mjs` (plain `fetch` against the served root):

```js
for (const g of ["block-drop", "color-stack", "pill-drop", "night-shift"]) {
  const html = await (await fetch(`${base}/games/${g}/`)).text();
  assert(html.includes('<link rel="alternate" type="text/markdown" href="/agents.md" title="Agent protocol">'), `${g}: alternate link`);
  assert(/<meta name="description" content="[^"]*agents\.md[^"]*">/.test(html), `${g}: description names agents.md`);
}
const md = await (await fetch(`${base}/agents.md`)).text();
assert(md.indexOf("## If you are an agent, start here") < md.indexOf("## Open a game in agent mode"), "agents.md opens with the agent section");
assert(md.includes("## After the run") && md.includes("## No browser?"), "agents.md sections");
assert((md.match(/https:\/\/play\.helloai\.com\/games\/[a-z-]+\/\?[^ )\n]*bench=/g) || []).length >= 4, "agents.md lists the four agent urls");
const llms = await (await fetch(`${base}/llms.txt`)).text();
assert((llms.match(/https:\/\/play\.helloai\.com\/games\/[a-z-]+\/\?[^ )\n]*bench=/g) || []).length === 4, "llms.txt lists four agent urls");
const robots = await (await fetch(`${base}/robots.txt`)).text();
assert(/User-agent: \*\s+Allow: \//.test(robots) && robots.includes("/llms.txt") && robots.includes("/agents.md"), "robots.txt");
```

- [ ] **Step 2: Run the smoke script to verify the new checks fail**

Run: `cd tools && node smoke.mjs`
Expected: `FAIL block-drop: alternate link`, and the agents.md, llms.txt and robots.txt checks.

- [ ] **Step 3: Edit the files**

- Each game `<head>`, right after the `<title>` line: `<link rel="alternate" type="text/markdown" href="/agents.md" title="Agent protocol">` and `<meta name="description" content="<Title> on play.helloai.com: <one clause from the GAMES desc in index.html>. Agents: read /agents.md and open this page with ?agent=1 (Night Shift: it is always turn-based) to play the seeded benchmark.">`. Block Drop's head uses two-space indentation; the others none; match each file.
- `agents.md`: insert after the first paragraph (line 5) a `## If you are an agent, start here` section of at most eight lines: one line on what the site is; four lines, one per benchmark, `- Block Drop: Sprint 40 → https://play.helloai.com/games/block-drop/?agent=1&seed=20261022&bench=sprint-40` (Night Shift without `agent=1`); one line "Actions and the board format: the sections below. `arcade.info()` lists the actions in the page."; one line "When `observe().over` is true, read `observe().report.say` and see After the run."; one line "No browser tool? See No browser?". Add `## After the run` before `## Submit a run`: report the score and stats to your human in one line; say how you played (text board, code you wrote, screenshots) and how many attempts; keep `arcade.run()`'s JSON; the run reaches the official board by pull request (link to Submit a run); the landing page shows the browser's own best as "You" rows, unverified, and never mixes them with official rows. Turn the bridge paragraph into `## No browser?` with the steps: `git clone https://github.com/do360now/helloai-gamez`, `cd helloai-gamez/tools && npm install`, `npm run serve` (port 8765), in another shell `node agents/bridge.mjs block-drop/sprint-40 --id <your-id> --name "<your name>" --port 8799`, then `GET http://127.0.0.1:8799/` for the board and `POST /act` with the move as the body; the run is written to `data/runs/...` when the game ends.
- `llms.txt`: under `## Games`, give each game its full agent URL on its own line (the four URLs above), and add under `## For agents`: `- Every benchmark on https://play.helloai.com/#scoreboard has a "Copy for your agent" prompt to paste into an agent's chat.`
- `robots.txt`:

```
# play.helloai.com: humans vs agents. Agents start at /agents.md; a short index is /llms.txt.
User-agent: *
Allow: /
```

- [ ] **Step 4: Run the smoke script**

Run: `cd tools && node smoke.mjs`
Expected: all checks `ok`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add games/block-drop/index.html games/color-stack/index.html games/pill-drop/index.html games/night-shift/index.html agents.md llms.txt robots.txt tools/smoke.mjs
git commit -m "Discovery: agents.md start-here, after-the-run and no-browser sections; game heads, llms.txt and robots.txt point at the protocol"
```

---

### Task 5: Wire-up, full verification, and the hand-paste check

**Files:**
- Modify: `README.md` (the tools table at lines 76-82: add a `node smoke.mjs` row)
- Modify: `tools/package.json` (add `"smoke": "node smoke.mjs"` to `scripts`)

- [ ] **Step 1: Add the README row and the npm script**

Row: `| node smoke.mjs | Serves the repo on a free port and checks the landing page's copy-for-your-agent controls, the end-of-run report, and the discovery files in a headless browser |`.

- [ ] **Step 2: Run everything**

Run: `cd tools && npm test && node smoke.mjs && node verify.mjs`
Expected: all unit tests pass (the 8 Night Shift files plus `prompt.test.mjs`); smoke prints only `ok` lines; verify prints `ok` for all 14 runs.

- [ ] **Step 3: The hand-paste check (acceptance 2 in the spec)**

Serve locally, copy the Block Drop prompt from the landing page, and paste it unchanged into a fresh Claude Code session that has Playwright available (`tools/node_modules` works: `cd tools && node -e "import('playwright')"`). The target is the live site unless the maintainer substitutes the local origin. Record in the pull request: did the agent complete 40 pieces and report score and stats without a further instruction, and did it write a solver? If it wrote a solver unprompted, tighten the prompt's step 4 wording in `games/prompt.js` (keeping the required sentence) and re-run Task 1's test.

- [ ] **Step 4: Commit**

```bash
git add README.md tools/package.json
git commit -m "tools: smoke script in the README and npm scripts"
```

- [ ] **Step 5: Deploy**

`./deploy.sh` from the repo root mirrors HEAD and compares checksums; it refuses a dirty tree. `docs/` stays off the docroot. After deploying, `curl -s https://play.helloai.com/robots.txt` and `curl -s https://play.helloai.com/games/block-drop/ | grep agents.md` confirm the discovery files are live.
