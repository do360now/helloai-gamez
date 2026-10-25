import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { agentPrompt, HINTS } from "../../games/prompt.js";

const benches = JSON.parse(await readFile(new URL("../../data/benchmarks.json", import.meta.url), "utf8"));
const by = (id) => benches.find((b) => b.id === id);
const ORIGIN = "https://play.helloai.com";
const FOOTER = 'No browser tool? Clone https://github.com/do360now/helloai-gamez and follow "No browser?" in agents.md.';
const steps = (prompt) => [...prompt.matchAll(/^(\d+)\. /gm)].map((match) => Number(match[1]));

test("block drop prompt includes the gameplay instructions and report back", () => {
  const p = agentPrompt(by("block-drop/sprint-40"), ORIGIN);
  assert.match(p, /^Play Block Drop: Sprint 40 on play\.helloai\.com for me and report the score\./);
  assert.ok(p.includes("https://play.helloai.com/games/block-drop/?agent=1&seed=20261022&bench=sprint-40"));
  assert.ok(p.includes("It is turn-based: nothing moves until you act."));
  assert.ok(p.includes("window.arcade"));
  assert.ok(p.includes("arcade.observe() returns the board as text plus the legal moves"));
  assert.ok(p.includes('arcade.act("place R C") (rotation R, column C)'));
  assert.ok(p.includes("when observe().over is true, arcade.run() returns the recorded run"));
  assert.ok(p.includes("Play from the text board, one decision per piece, without writing a solver unless I ask for one."));
  assert.ok(p.includes("https://play.helloai.com/agents.md"));
  assert.ok(p.includes("tell me the final score and stats"));
  assert.ok(p.includes("say in one line how you played (text board, code you wrote, or screenshots) and how many attempts it took"));
  assert.ok(p.includes("keep the JSON from arcade.run() so I can submit it to the scoreboard"));
});

test("every benchmark preserves all rules, five steps, the no-solver sentence and footer", () => {
  for (const bench of benches) {
    const p = agentPrompt(bench, ORIGIN);
    assert.ok(p.includes("3. Rules: " + bench.rules));
    assert.deepEqual(steps(p), [1, 2, 3, 4, 5]);
    assert.ok(p.includes("without writing a solver unless I ask for one"));
    assert.ok(p.endsWith("\n\n" + FOOTER));
    assert.ok(!p.includes("undefined"));
  }
});

test("night shift describes rooms and commands and asks for disclosure", () => {
  const p = agentPrompt(by("night-shift/case-150"), ORIGIN);
  assert.ok(p.includes("https://play.helloai.com/games/night-shift/?seed=20261022&bench=case-150"));
  assert.ok(!p.includes("agent=1"));
  assert.ok(p.includes("arcade.observe() returns the room as text"));
  assert.ok(p.includes('arcade.act("look at board")'));
  assert.ok(p.includes("one command per turn, 150 commands in the budget"));
  assert.ok(p.includes("Play from the room text"));
  assert.ok(p.includes("Say whether you played blind (text only) or open-book (you read the source or world data); the run needs player.disclosure."));
  assert.ok(!/piece|text board|board as text|new board|legal moves|placements/i.test(p));
});

test("color stack and pill drop describe the placement arguments and decision unit", () => {
  const color = agentPrompt(by("color-stack/sprint-40"), ORIGIN);
  const pill = agentPrompt(by("pill-drop/sprint-40"), ORIGIN);
  assert.ok(color.includes('arcade.act("place R C") (cycle R, column C)'));
  assert.ok(color.includes("one decision per piece"));
  assert.ok(pill.includes('arcade.act("place R C") (orientation R, column C)'));
  assert.ok(pill.includes("one decision per pill"));
});

test("unknown games without rules use generic actions and consecutive steps", () => {
  for (const game of ["hexa-fall", "toString"]) {
    const p = agentPrompt({ id: game + "/sprint-40", game, bench: "sprint-40", seed: 7, title: "Future Game: Sprint 40" }, ORIGIN);
    assert.ok(p.includes(ORIGIN + "/games/" + game + "/?agent=1&seed=7&bench=sprint-40"));
    assert.ok(p.includes("arcade.act(action) with an action from arcade.info().actions"));
    assert.ok(p.includes("one decision per move"));
    assert.ok(!p.includes("undefined"));
    assert.ok(!p.includes("Rules:"));
    assert.deepEqual(steps(p), [1, 2, 3, 4]);
    assert.match(p, /^3\. Play from /m);
    assert.match(p, /^4\. When the run is over,/m);
  }
});

test("falsy rules are omitted and nonempty rules retain their whitespace", () => {
  const bench = by("block-drop/sprint-40");
  for (const rules of [undefined, null, "", false]) {
    const p = agentPrompt({ ...bench, rules }, ORIGIN);
    assert.ok(!p.includes("Rules:"));
    assert.deepEqual(steps(p), [1, 2, 3, 4]);
  }
  const rules = "  First sentence.\nSecond sentence.  ";
  assert.ok(agentPrompt({ ...bench, rules }, ORIGIN).includes("3. Rules: " + rules + "\n4. "));
});

test("local HTTP and HTTPS origins are used for the game and protocol", () => {
  for (const origin of ["http://localhost:8765", "https://127.0.0.1:9443"]) {
    const p = agentPrompt(by("block-drop/sprint-40"), origin);
    assert.ok(p.includes(origin + "/games/block-drop/?agent=1&seed=20261022&bench=sprint-40"));
    assert.ok(p.includes(origin + "/agents.md"));
  }
});

test("non-HTTP origins fall back to the public game and protocol URLs", () => {
  for (const origin of ["null", "file://", "ftp://localhost", "", null, undefined]) {
    const p = agentPrompt(by("block-drop/sprint-40"), origin);
    assert.ok(p.includes(ORIGIN + "/games/block-drop/?agent=1&seed=20261022&bench=sprint-40"));
    assert.ok(p.includes(ORIGIN + "/agents.md"));
  }
});

test("browser API works without a DOM and matches the CommonJS named exports", async () => {
  const source = await readFile(new URL("../../games/prompt.js", import.meta.url), "utf8");
  const context = { window: {} };
  runInNewContext(source, context);
  assert.equal(typeof context.window.arcadePrompt.agentPrompt, "function");
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.arcadePrompt.HINTS)), HINTS);
  for (const bench of benches) {
    assert.equal(context.window.arcadePrompt.agentPrompt(bench, ORIGIN), agentPrompt(bench, ORIGIN));
  }
});
