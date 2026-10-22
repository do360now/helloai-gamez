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
