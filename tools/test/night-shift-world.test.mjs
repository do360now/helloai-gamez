import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createGame, mulberry32 } from "../../games/night-shift/engine.js";

const world = JSON.parse(await readFile(new URL("../../games/night-shift/world.json", import.meta.url), "utf8"));
const LOCKER = { locker1: "first locker", locker2: "second locker", locker3: "third locker" };

// The intended path through the slice. Returns the score after every scoring step.
function playSlice(g) {
  const scores = [];
  const step = (cmd, expectPoints) => {
    const before = g.state().score;
    const r = g.command(cmd);
    assert.equal(g.state().score - before, expectPoints, `${cmd}: ${r.reply}`);
    scores.push(g.state().score);
    return r;
  };
  step("look at high score board", 5);
  step("look under cabinet", 5);
  step("take token", 0);
  step("put token in cabinet", 10);
  step("east", 0);
  step("read ledger", 5);
  step("open " + LOCKER[g.params.keyLocker], 0);
  step("take key", 0);
  step("west", 0);
  step("unlock door with key", 10);
  step("north", 0);
  step("turn photo", 0);
  const r = step("open safe with " + g.params.combo, 10);
  return { scores, last: r };
}

test("the slice plays through on the benchmark seed to the safe", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  assert.equal(g.params.keyLocker, "locker1");
  const { last } = playSlice(g);
  assert.equal(g.state().score, 45);
  assert.equal(g.state().maxScore, 100);
  assert.equal(g.state().over, false);
  assert.match(last.reply, /missing from it/);
  assert.equal(g.state().turn, 13);
});

test("the same path scores the same on another seed", () => {
  const seeds = [1, 2, 3];
  for (const seed of seeds) {
    const g = createGame(world, { random: mulberry32(seed), bench: "case-150" });
    const { scores } = playSlice(g);
    assert.deepEqual(scores, [5, 10, 10, 20, 20, 25, 25, 25, 25, 35, 35, 35, 45], `seed ${seed}`);
  }
});

test("the wrong locker is empty, the office is locked without the key, and the safe needs the photo", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  assert.equal(g.command("open second locker").reply.includes("key"), false);
  assert.equal(g.command("north").reply, "The office door is locked.");
  assert.equal(g.command("open door").reply, "It's locked.");
  g.command("east"); g.command("open first locker"); g.command("take key"); g.command("west");
  g.command("unlock door with key"); g.command("north");
  assert.match(g.command("open safe").reply, /combination/);
  assert.match(g.command("open safe with 9999").reply, /not it|guess|stops|will not/i);
  assert.match(g.command("open safe with " + g.params.combo).reply, /guess/i);
  assert.equal(g.state().over, false);
  assert.equal(g.state().score, 10);
  g.command("turn photo over");
  assert.match(g.command("turn dial to " + g.params.combo).reply, /missing from it/);
  assert.equal(g.state().score, 20);
  assert.equal(g.state().over, false);
});

test("deaths rewind with the penalty and the game goes on", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  g.command("look at board");
  const r = g.command("pull cord");
  assert.match(r.reply, /a little wiser\.$/);
  assert.equal(g.state().deaths, 1);
  assert.equal(g.state().score, 0);
  g.command("east");
  g.command("drink slush");
  assert.equal(g.state().deaths, 2);
  assert.equal(g.state().room.id, "counter");
  assert.equal(g.state().over, false);
});

test("Marge drops the seeded witness name", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  g.command("east"); g.command("open first locker"); g.command("take key"); g.command("west");
  g.command("unlock door with key"); g.command("north");
  assert.match(g.command("ask marge about the cabinet").reply, new RegExp(g.params.witness));
});

test("named exits can be looked at and walked through, and never crash", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  assert.equal(g.command("look at prize counter").reply, "That way lies the prize counter.");
  assert.equal(g.command("look at office door").reply.startsWith("A plain door"), true);
  assert.equal(g.command("go office door").reply, "The office door is locked.");
  assert.equal(g.command("go prize counter").reply, g.state().room.text);
  assert.equal(g.state().room.id, "counter");
  assert.equal(g.command("enter arcade floor").reply, g.state().room.text);
  assert.equal(g.state().room.id, "floor");
  assert.equal(g.command("take prize counter").reply, "That is a way out, not a thing.");
  assert.deepEqual([g.state().commands, g.state().turn, g.state().transcript.length], [6, 6, 6]);
});

// Every verb against every noun in every room, including two-slot verbs with the second slot
// empty and with every pair: nothing may throw, and every command must be logged exactly once.
test("fuzz: no command throws and every command is logged once", () => {
  const base = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  const verbs = world.verbs;
  let count = 0;
  for (const rid of Object.keys(world.rooms)) {
    const g = createGame(world, { random: mulberry32(20261022) });
    const s = g.snapshot();
    s.room = rid;
    for (const oid of Object.keys(world.objects)) if (world.objects[oid].hidden) s.revealed[oid] = true;
    s.inv = ["mop", "token", "officekey"];
    for (const id of s.inv) s.placed[id] = "inventory";
    g.restore(s);
    const st = g.state();
    const nouns = st.objects.map((o) => o.noun).concat(st.inventory.map((o) => o.noun), st.exits.map((e) => e.name), ["banana", "locker", "key"]);
    const cmds = [];
    for (const v of verbs) {
      cmds.push(v.verb);
      for (const n of nouns) {
        cmds.push(v.verb + " " + n);
        if (v.args === 2) {
          cmds.push(v.verb + " " + n + " " + (v.preps[0] || "with"));
          for (const m of nouns) cmds.push(v.verb + " " + n + " " + (v.preps[0] || "with") + " " + m);
        }
      }
    }
    for (const cmd of cmds) {
      g.restore(s);
      let r;
      try { r = g.command(cmd); } catch (e) { assert.fail(`${rid}: "${cmd}" threw ${e.message}`); }
      assert.equal(typeof r.reply, "string", cmd);
      assert.ok(!r.events.some((e) => e.type === "error"), `${rid}: "${cmd}" hit the engine's error path`);
      const after = g.state();
      assert.equal(after.commands, 1, `${rid}: "${cmd}" commands`);
      assert.equal(after.transcript.length, 1, `${rid}: "${cmd}" transcript`);
      assert.equal(after.transcript[0].cmd, cmd);
      count++;
    }
  }
  assert.ok(count > 3000, String(count));
  assert.equal(base.state().commands, 0);
});

test("unlocking the door does not move you, and the door then opens or is already open", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  g.command("east"); g.command("open first locker"); g.command("take key"); g.command("west");
  const r = g.command("unlock office door with brass key");
  assert.doesNotMatch(r.reply, /swings in|you step|inside/i);
  assert.match(r.reply, /unlock/i);
  assert.equal(g.state().room.id, "floor");
  assert.equal(g.command("open office door").reply, "It is already open.");
  g.command("north");
  assert.equal(g.state().room.id, "office");
});

test("read and search fall back to examining, and read still scores the board", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  const r = g.command("read high score board");
  assert.match(r.reply, /ZZZ/);
  assert.equal(g.state().score, 5);
  g.command("east"); g.command("open first locker"); g.command("take key"); g.command("west");
  g.command("unlock door with key"); g.command("north");
  assert.match(g.command("search desk").reply, /invoices/);
  assert.match(g.command("read panel").reply, /EDIT/);
  assert.equal(g.command("leave").reply.includes("Drop"), false);
  assert.equal(g.command("go in").reply.includes("Enter"), false);
});

test("Marge answers every name and thing the texts mention, and has a flavour reply otherwise", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  g.command("east"); g.command("open first locker"); g.command("take key"); g.command("west");
  g.command("unlock door with key"); g.command("north");
  for (const t of ["galaxy patrol", "pickup", "ledger", "rudy", "dale", "priya", "walt", "token", "key", "lockers", "mop", "slush", "grille", "register"]) {
    const r = g.command("ask marge about " + t);
    assert.doesNotMatch(r.reply, /nothing to say/, t);
  }
  const r = g.command("ask marge about the weather");
  assert.doesNotMatch(r.reply, /nothing to say about that/);
  assert.ok(r.reply.length > 20);
});

test("the token is hinted in the text before it is found", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  assert.match(g.command("look at cabinet").reply, /under/i);
});

// Post-playtest batch (Player1's full blind run).
const PAIRS = [["are shut", "stand open"], ["rolled down", "rolled up"], ["is locked", "stands open"], ["catches the light", "nothing under"]];
const DRAWER = { drawer1: "top drawer", drawer2: "middle drawer", drawer3: "bottom drawer" };
function noContradiction(text, where) {
  for (const [a, b] of PAIRS) assert.ok(!(text.includes(a) && text.includes(b)), `${where}: both "${a}" and "${b}"`);
}

test("room and object texts never contradict themselves along the route", async () => {
  const { solve } = await import("../night-shift.mjs");
  const route = solve(world, 20261022).actions;
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  for (const cmd of route) {
    g.command(cmd);
    const s = g.state();
    noContradiction(s.room.text, `${cmd} / room ${s.room.id}`);
    for (const o of s.objects) noContradiction(g.command("look at " + o.noun).reply, `${cmd} / ${o.id}`);
  }
});

test("stale text: the van, the grille, the cabinet and the safe describe their current state", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  assert.match(g.command("look at cabinet").reply, /catches the light/);
  g.command("search cabinet"); g.command("take token");
  assert.doesNotMatch(g.command("look at cabinet").reply, /catches the light/);
  g.command("east"); g.command("open first locker"); g.command("take key"); g.command("west");
  g.command("unlock door with key"); g.command("north"); g.command("turn photo");
  assert.match(g.command("look in safe").reply, /shut/);
  g.command("open safe with " + g.params.combo); g.command("take ring");
  assert.match(g.command("look in safe").reply, /open|empty hook/i);
  g.command("south"); g.command("east"); g.command("open grille");
  assert.doesNotMatch(g.state().room.text, /rolled down/);
  assert.match(g.state().room.text, /rolled up/);
  g.command("west"); g.command("west"); g.command("north"); g.command("search clipboard"); g.command("take fob"); g.command("out");
  assert.match(g.state().room.text, /are shut/);
  g.command("unlock van with fob");
  assert.doesNotMatch(g.state().room.text, /are shut/);
  assert.match(g.command("open van").reply, /already open/i);
});

test("Player1's nouns and replies: man, read label, already open, hints, dead leads paid off", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  g.command("west"); g.command("north"); g.command("search clipboard"); g.command("take fob"); g.command("out");
  g.command("unlock van with fob"); g.command("enter van");
  assert.match(g.command("read label").reply, /HOLD FOR/);
  assert.equal(g.state().score, 5);
  assert.match(g.command("search bundle").reply, /GALAXY PATROL/);
  assert.match(g.command("pull blankets").reply, /GALAXY PATROL/);
  g.command("out"); g.command("west");
  assert.match(g.command("look at man").reply, /Dale/);
  assert.match(g.command("look at sleeper").reply, /Dale/);
  assert.match(g.command("give fob to lou").reply, /doesn't want/);
  g.command("east"); g.command("in");
  assert.match(g.command("search mat").reply, /envelope/i);
  assert.match(g.command("take envelope").reply, /Taken|counted|cash/i);
  assert.equal(g.state().maxScore, 100);
  g.command("south"); g.command("down");
  assert.match(g.command("open toolbox").reply, /already open/i);
  assert.match(g.command("move toolbox").reply, /budge|heavy|stays/i);
  assert.match(g.command("look at cabinet").reply, /drawers/i);
  assert.match(g.command("take small brass key").reply, /You don't see|Which|Taken/);
  g.command("open " + DRAWER[g.params.drawer]);
  assert.equal(g.command("take small brass key").reply, "Taken.");
  assert.equal(g.state().score, 15);
});

test("the accuse prompt names exactly what is missing", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  g.command("east"); g.command("open " + LOCKER[g.params.keyLocker]); g.command("take key"); g.command("west");
  g.command("unlock door with key"); g.command("north");
  assert.match(g.command("accuse rudy").reply, /key/i);
  assert.doesNotMatch(g.command("accuse rudy").reply, /who had it/i);
  g.command("south"); g.command("west"); g.command("down"); g.command("open " + DRAWER[g.params.drawer]); g.command("take panel key");
  g.command("up"); g.command("east"); g.command("north");
  const r = g.command("accuse rudy").reply;
  assert.match(r, /who had it|says who/i);
  assert.doesNotMatch(r, /bring me the key/i);
  assert.equal(g.state().over, false);
});

test("look at marge away from the office says she is not here", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  assert.equal(g.command("look at marge").reply, "Marge is not here.");
  assert.match(g.command("look at rudy").reply, /not here/);
});

test("a second unlock or fob press on the open van says it is already open", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  g.command("west"); g.command("north"); g.command("search clipboard"); g.command("take fob"); g.command("out");
  g.command("unlock van with fob");
  assert.match(g.command("unlock van with fob").reply, /already open/i);
  assert.match(g.command("use fob on van").reply, /already open/i);
  g.command("west");
  assert.equal(g.command("accuse marge").reply, "Marge is not here.");
  assert.equal(g.command("give fob to marge").reply, "Marge is not here.");
});
