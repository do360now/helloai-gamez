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
  const r = step("open safe", 10);
  return { scores, last: r };
}

test("the slice plays through on the benchmark seed and ends with the win", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  assert.equal(g.params.keyLocker, "locker1");
  const { last } = playSlice(g);
  assert.equal(g.state().score, 45);
  assert.equal(g.state().maxScore, 45);
  assert.equal(g.state().over, true);
  assert.equal(g.reason, "win");
  assert.match(last.reply, /To be continued/);
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
  assert.equal(g.state().score, 10);
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
