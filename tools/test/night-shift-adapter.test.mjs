import { test } from "node:test";
import assert from "node:assert/strict";
import { arcadeAdapter, mulberry32 } from "../../games/night-shift/engine.js";

const world = {
  id: "test-world",
  start: "hall",
  benchmarks: { "case-150": { label: "Case 150", budget: 150 } },
  verbs: [
    { verb: "look", synonyms: ["l", "look at"], args: 1, preps: [], usage: "look | look at <object>", optional: true },
    { verb: "take", synonyms: ["get"], args: 1, preps: [], usage: "take <object>" },
    { verb: "open", synonyms: [], args: 1, preps: [], usage: "open <object>" },
    { verb: "go", synonyms: [], args: 1, preps: [], usage: "go <direction>" },
  ],
  rooms: { hall: { name: "Hall", text: "A hall.", exits: [{ dir: "north", to: "hall", name: "a loop" }], objects: ["coin", "box"] } },
  objects: { coin: { name: "coin", nouns: ["coin"], text: "Shiny.", takeable: true }, box: { name: "box", nouns: ["box"], text: "A box." } },
  rules: [{ id: "open-box", when: { verb: "open", object: "box" }, do: [{ score: 7 }, { win: "Done." }] }],
};

function make(extra = {}) {
  const calls = [];
  const a = arcadeAdapter({
    world,
    random: () => { calls.push("random"); return 0.5; },
    bench: () => "case-150",
    seed: () => 20261022,
    reset: () => calls.push("reset"),
    onStart: (g) => calls.push("start:" + typeof g.command),
    onChange: (events) => calls.push("change:" + events.map((e) => e.type).join(",")),
    ...extra,
  });
  return { a, calls };
}

test("adapter shape for Arcade.register", () => {
  const { a } = make();
  assert.equal(a.id, "test-world");
  assert.equal(a.turnBased, true);
  assert.deepEqual(a.benchmarks, world.benchmarks);
  assert.equal(a.actions.take, "take <object>");
  assert.match(a.actions["<direction>"], /north/);
  assert.equal(a.ready(), true);
  assert.equal(a.over(), false);
  assert.equal(a.score(), 0);
  assert.equal(a.text(), "");
});

test("start resets, then creates the game, then calls onStart", async () => {
  const { a, calls } = make();
  a.start();
  assert.deepEqual(calls, ["reset", "start:function"]);
  assert.equal(typeof a.game.state, "function");
});

test("apply runs the command, calls onChange with the events, and logs ok", async () => {
  const { a, calls } = make();
  a.start();
  assert.equal(await a.apply("take coin"), true);
  assert.equal(calls[calls.length - 1], "change:item");
  assert.equal(await a.apply("dance"), true);
  assert.equal(calls[calls.length - 1], "change:unknown");
  assert.equal(await a.apply("   "), false);
  assert.equal(a.game.state().turn, 2);
});

test("text has the header, room, inventory, verbs and the last exchange only", async () => {
  const { a } = make();
  a.start();
  assert.equal(a.text(), [
    "test-world case-150 seed 20261022 turn 0/150",
    "score 0 of 7  deaths 0",
    "== Hall ==",
    "A hall.\nYou see: a coin, a box.\nExits: north (a loop).",
    "inventory: nothing",
    "verbs: look, take, open, go (help for usage)",
  ].join("\n"));
  await a.apply("look at box");
  await a.apply("take coin");
  const t = a.text();
  assert.match(t, /^test-world case-150 seed 20261022 turn 2\/150\n/);
  assert.match(t, /\ninventory: a coin\n/);
  assert.match(t, /\n> take coin\nTaken\.$/);
  assert.doesNotMatch(t, /look at box/);
  assert.doesNotMatch(t, /Shiny/);
});

test("observe has the seam fields and no transcript", async () => {
  const { a } = make();
  a.start();
  await a.apply("look");
  const o = a.observe();
  assert.equal(o.transcript, undefined);
  assert.equal(o.verbs.length, 4);
  assert.equal(o.room.id, "hall");
  assert.equal(o.reply, o.room.text);
});

test("stats report the win and over", async () => {
  const { a } = make();
  a.start();
  await a.apply("open box");
  assert.equal(a.over(), true);
  assert.equal(a.score(), 7);
  assert.deepEqual(a.stats(), { maxScore: 7, turns: 1, deaths: 0, won: 1 });
  assert.match(a.text(), /\nscore 7 of 7  deaths 0  OVER\n/);
});

test("the same seed gives the same parameters in Node and in the page", () => {
  const w = { ...world, params: { pick: { choices: ["a", "b", "c", "d"] } } };
  const a = arcadeAdapter({ world: w, random: mulberry32(20261022), bench: () => "case-150" });
  a.start();
  const b = arcadeAdapter({ world: w, random: mulberry32(20261022), bench: () => "case-150" });
  b.start();
  assert.deepEqual(a.game.params, b.game.params);
  assert.equal(a.game.params.pick, "c");
});
