import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, mulberry32 } from "../../games/night-shift/engine.js";

// A small world for the engine tests. Not the real game.
function world() {
  return {
    id: "test-world",
    title: "Test",
    start: "hall",
    deathPenalty: 5,
    benchmarks: { "case-150": { label: "Case 150", budget: 150 } },
    params: {
      combo: { choices: ["1111", "2222", "3333"] },
      keyLocker: { choices: ["locker1", "locker2"] },
    },
    verbs: [
      { verb: "look", synonyms: ["l", "look at", "examine", "x"], args: 1, preps: [], usage: "look | look at <object>", optional: true },
      { verb: "take", synonyms: ["get", "pick up"], args: 1, preps: [], usage: "take <object>" },
      { verb: "drop", synonyms: [], args: 1, preps: [], usage: "drop <object>" },
      { verb: "open", synonyms: [], args: 1, preps: [], usage: "open <object>" },
      { verb: "search", synonyms: ["look under"], args: 1, preps: [], usage: "search <object>" },
      { verb: "use", synonyms: [], args: 2, preps: ["on", "with"], usage: "use <object> on <object>" },
      { verb: "ask", synonyms: [], args: 2, preps: ["about"], usage: "ask <person> about <topic>", topic: true },
      { verb: "talk", synonyms: ["talk to"], args: 1, preps: [], usage: "talk to <person>" },
      { verb: "pull", synonyms: [], args: 1, preps: [], usage: "pull <object>" },
      { verb: "inventory", synonyms: ["i"], args: 0, preps: [], usage: "inventory" },
      { verb: "go", synonyms: ["walk"], args: 1, preps: [], usage: "go <direction>" },
      { verb: "help", synonyms: ["verbs"], args: 0, preps: [], usage: "help" },
      { verb: "score", synonyms: [], args: 0, preps: [], usage: "score" },
      { verb: "wait", synonyms: ["z"], args: 0, preps: [], usage: "wait" },
    ],
    rooms: {
      hall: {
        name: "Hall",
        text: "A hall. The safe's combination is ${combo}.",
        extra: [{ require: { flags: { doorOpen: true } }, text: "The door stands open." }],
        exits: [
          { dir: "north", to: "office", name: "the office door", require: { flags: { doorOpen: true } }, fail: "The door is locked." },
          { dir: "east", to: "closet", name: "the closet" },
        ],
        objects: ["mat", "key", "door", "bob", "cord"],
        draw: [],
      },
      office: { name: "Office", text: "An office.", exits: [{ dir: "south", to: "hall", name: "the hall" }], objects: ["safe"] },
      closet: { name: "Closet", text: "A closet.", exits: [{ dir: "west", to: "hall", name: "the hall" }], objects: ["locker1", "locker2"] },
    },
    objects: {
      mat: { name: "mat", nouns: ["mat", "doormat"], text: "A doormat." },
      key: { name: "brass key", nouns: ["brass key", "key"], text: "A small brass key.", takeable: true, hidden: true },
      door: { name: "door", nouns: ["door", "office door"], text: "A heavy door." },
      cord: { name: "cord", nouns: ["cord", "frayed cord"], text: "A frayed cord." },
      safe: { name: "safe", nouns: ["safe"], text: "A safe with a dial." },
      locker1: { name: "first locker", nouns: ["first locker", "locker 1"], text: "A locker." },
      locker2: { name: "second locker", nouns: ["second locker", "locker 2"], text: "A locker." },
      bob: {
        name: "Bob", nouns: ["bob", "man"], text: "Bob, the night man.", person: true,
        topics: {
          weather: { reply: "Bob shrugs. \"Cold.\"" },
          safe: { reply: "\"Combination? Try ${combo}.\"", points: 5 },
          door: { reply: "\"Locked. Key's under the mat.\"", require: { flags: { askedWeather: true } }, fail: "Bob is not in the mood." },
        },
      },
    },
    rules: [
      { id: "find-key", when: { verb: "search", object: "mat" }, do: [{ reveal: "key" }, { flag: "foundKey", value: true }, { score: 5 }, { reply: "A brass key was under the mat." }] },
      { id: "find-key-again", when: { verb: "search", object: "mat" }, require: { flags: { foundKey: true } }, do: [{ reply: "Nothing else under there." }] },
      { id: "unlock", when: { verb: "use", object: "key", target: "door" }, require: { has: ["key"], flags: { doorOpen: false } }, fail: "You need the key in hand.", do: [{ flag: "doorOpen", value: true }, { score: 10 }, { reply: "The door unlocks." }] },
      { id: "open-safe", when: { verb: "open", object: "safe" }, do: [{ score: 10 }, { win: "The safe swings open. You win." }] },
      { id: "pull-cord", when: { verb: "pull", object: "cord" }, do: [{ score: 1 }, { die: "Zap. You are dead." }] },
      { id: "asked-weather", when: { verb: "ask", object: "bob", topic: "weather" }, do: [{ flag: "askedWeather", value: true }] },
      { id: "bell", when: { turn: true }, require: { flags: { doorOpen: true, bellRang: false } }, do: [{ flag: "bellRang", value: true }, { reply: "Somewhere a bell rings." }] },
      { id: "shortcut", when: { verb: "open", object: "mat" }, do: [{ exit: { room: "hall", dir: "down", to: "closet", name: "a trapdoor" } }, { reply: "A trapdoor." }] },
    ],
  };
}

const fixed = (values) => { let i = 0; return () => values[i++ % values.length]; };
function game(random = fixed([0.5, 0.5]), bench = "case-150") {
  return createGame(world(), { random, bench });
}

test("params are picked in key order from random", () => {
  const g = createGame(world(), { random: fixed([0.9, 0.1]), bench: "case-150" });
  assert.deepEqual(g.params, { combo: "3333", keyLocker: "locker1" });
});

test("${param} substitution in room text", () => {
  const g = game(fixed([0.5, 0.5]));
  assert.match(g.state().room.text, /combination is 2222\./);
});

test("look lists visible objects and exits and hides hidden objects", () => {
  const g = game();
  const t = g.state().room.text;
  assert.match(t, /You see: a mat, a door, Bob, a cord\./);
  assert.match(t, /Exits: north \(the office door\), east \(the closet\)\./);
  assert.doesNotMatch(t, /brass key/);
  assert.deepEqual(g.state().objects.map((o) => o.id), ["mat", "door", "bob", "cord"]);
  assert.equal(g.state().objects[2].person, true);
  const r = g.command("look");
  assert.equal(r.reply, t);
});

test("look at an object replies with its text", () => {
  const g = game();
  assert.equal(g.command("examine mat").reply, "A doormat.");
  assert.equal(g.command("x cord").reply, "A frayed cord.");
});

test("go moves and emits moved; exit require blocks with fail text", () => {
  const g = game();
  const blocked = g.command("north");
  assert.equal(blocked.reply, "The door is locked.");
  assert.equal(g.state().room.id, "hall");
  const r = g.command("go east");
  assert.equal(g.state().room.id, "closet");
  assert.deepEqual(r.events, [{ type: "moved", from: "hall", to: "closet" }]);
  assert.equal(r.reply, g.state().room.text);
  assert.equal(g.command("w").reply, g.state().room.text);
  assert.equal(g.state().room.id, "hall");
});

test("take and drop update inventory and emit item events", () => {
  const g = game();
  assert.equal(g.command("take key").reply, "You don't see any key here.");
  g.command("search mat");
  const r = g.command("take key");
  assert.equal(r.reply, "Taken.");
  assert.deepEqual(r.events, [{ type: "item", id: "key", action: "take" }]);
  assert.deepEqual(g.state().inventory, [{ id: "key", name: "brass key", noun: "brass key", nouns: ["brass key", "key"] }]);
  assert.equal(g.command("take mat").reply, "You can't take that.");
  assert.equal(g.command("inventory").reply, "You are carrying: a brass key.");
  const d = g.command("drop key");
  assert.equal(d.reply, "Dropped.");
  assert.deepEqual(d.events, [{ type: "item", id: "key", action: "drop" }]);
  assert.deepEqual(g.state().inventory, []);
  assert.equal(g.command("i").reply, "You are carrying nothing.");
});

test("ask person about topic replies, scores once, and emits said", () => {
  const g = game();
  const r = g.command("ask bob about the safe");
  assert.equal(r.reply, "\"Combination? Try 2222.\"");
  assert.deepEqual(r.events, [{ type: "said", npc: "bob", topic: "safe" }, { type: "scored", points: 5, id: "bob:safe" }]);
  assert.equal(g.state().score, 5);
  g.command("ask bob about safe");
  assert.equal(g.state().score, 5);
  assert.equal(g.command("ask bob about pigeons").reply, "Bob has nothing to say about that.");
  assert.equal(g.command("ask mat about safe").reply, "The mat has nothing to say.");
});

test("topic require gates the reply with fail text", () => {
  const g = game();
  assert.equal(g.command("ask bob about door").reply, "Bob is not in the mood.");
  g.command("ask bob about weather");
  assert.equal(g.command("ask bob about door").reply, "\"Locked. Key's under the mat.\"");
});

test("talk lists topics", () => {
  const g = game();
  assert.equal(g.command("talk to bob").reply, "Bob will talk about: weather, safe, door.");
});

test("unknown verb, unknown noun and ambiguity reply and count as a turn", () => {
  const g = game();
  const r = g.command("frobnicate mat");
  assert.equal(r.reply, "I don't understand that. Type 'help' for the verbs.");
  assert.deepEqual(r.events, [{ type: "unknown", text: "frobnicate mat" }]);
  assert.equal(g.state().turn, 1);
  assert.equal(g.command("take banana").reply, "You don't see any banana here.");
  assert.equal(g.command("take").reply, "Take what?");
  assert.equal(g.state().turn, 3);
  g.command("search mat");
  g.command("take key");
  g.command("east");
  assert.equal(g.command("open locker").reply, "You don't see any locker here.");
  assert.equal(g.command("look at first locker").reply, "A locker.");
});

test("help, score and wait", () => {
  const g = game();
  assert.match(g.command("help").reply, /^look \| look at <object>\ntake <object>\n/);
  assert.equal(g.command("score").reply, "Score: 0 of 31, turn 2 of 150.");
  assert.equal(g.command("wait").reply, "Time passes.");
});

test("state has the seam fields", () => {
  const g = game();
  g.command("look");
  const s = g.state();
  assert.deepEqual(Object.keys(s).sort(), ["budget", "deaths", "exits", "inventory", "maxScore", "objects", "over", "reply", "room", "score", "transcript", "turn", "verbs"].sort());
  assert.deepEqual(s.exits, [{ dir: "north", to: "office", name: "the office door" }, { dir: "east", to: "closet", name: "the closet" }]);
  assert.deepEqual(s.verbs[0], { verb: "look", synonyms: ["l", "look at", "examine", "x"], usage: "look | look at <object>", args: 1 });
  assert.deepEqual(s.transcript, [{ cmd: "look", reply: s.room.text }]);
  assert.equal(s.budget, 150);
  assert.equal(s.maxScore, 31);
  assert.deepEqual(s.objects[0], { id: "mat", name: "mat", noun: "mat", nouns: ["mat", "doormat"], hotspot: null, person: false });
});

test("mulberry32 matches the arcade.js generator for seed 20261022", () => {
  const r = mulberry32(20261022);
  assert.deepEqual([r(), r(), r()].map((x) => x.toFixed(6)), ["0.559159", "0.218830", "0.558487"]);
});
