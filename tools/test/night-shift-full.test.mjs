import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createGame, mulberry32 } from "../../games/night-shift/engine.js";

const world = JSON.parse(await readFile(new URL("../../games/night-shift/world.json", import.meta.url), "utf8"));
const LOCKER = { locker1: "first locker", locker2: "second locker", locker3: "third locker" };
const DRAWER = { drawer1: "top drawer", drawer2: "middle drawer", drawer3: "bottom drawer" };

// The intended full path. Each step asserts the points it earns.
function playFull(g) {
  const step = (cmd, pts) => {
    const before = g.state().score;
    const r = g.command(cmd);
    assert.equal(g.state().score - before, pts, `${cmd}: ${r.reply}`);
    return r;
  };
  step("look at board", 5);
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
  step("open safe with " + g.params.combo, 10);
  step("take ring", 0);
  step("south", 0); step("east", 0);
  step("unlock grille with ring", 0);
  step("in", 0);
  step("look at back panel", 5);
  step("out", 0); step("west", 0); step("west", 0);
  assert.equal(g.state().room.id, "hallway");
  step("north", 0);
  step("read clipboard", 5);
  step("search clipboard", 0);
  step("take fob", 0);
  step("out", 0);
  step("unlock van with fob", 0);
  step("enter van", 0);
  step("look at label", 5);
  step("out", 0);
  step("west", 0);
  assert.equal(g.state().room.id, "diner");
  step("ask lou about dale", 5);
  step("ask lou about rudy", 5);
  step("search stool", 0);
  step("take quarter", 0);
  step("east", 0);
  step("put quarter in payphone", 0);
  step("press redial", 10);
  step("in", 0); step("south", 0); step("down", 0);
  assert.equal(g.state().room.id, "workshop");
  step("look at drawers", 0);
  step("open " + DRAWER[g.params.drawer], 0);
  step("take panel key", 10);
  step("up", 0); step("east", 0); step("north", 0);
  return step("accuse rudy", 10);
}

test("the full case plays through to 100 and the win on the benchmark seed", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  const r = playFull(g);
  assert.equal(g.state().score, 100);
  assert.equal(g.state().maxScore, 100);
  assert.equal(g.reason, "win");
  assert.match(r.reply, /police|morning|sun/i);
});

test("the same path scores 100 on other seeds", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = createGame(world, { random: mulberry32(seed), bench: "case-150" });
    playFull(g);
    assert.equal(g.state().score, 100, `seed ${seed}`);
  }
});

test("the accusation needs the key and the call; the wrong suspect is refused", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  g.command("east"); g.command("open " + LOCKER[g.params.keyLocker]); g.command("take key"); g.command("west");
  g.command("unlock door with key"); g.command("north");
  assert.match(g.command("accuse rudy").reply, /more than|hunch|proof|evidence/i);
  assert.equal(g.state().over, false);
  assert.match(g.command("accuse dale").reply, /dale/i);
  assert.match(g.command("accuse marge").reply, /./);
  assert.equal(g.state().over, false);
  assert.equal(g.state().score, 10);
});

test("the three new deaths rewind", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  g.command("west"); g.command("north");
  g.command("pull lever");
  assert.equal(g.state().deaths, 1);
  assert.equal(g.state().room.id, "dock");
  g.command("out");
  g.command("climb into dumpster");
  assert.equal(g.state().deaths, 2);
  g.command("in"); g.command("south"); g.command("down");
  g.command("touch monitor");
  assert.equal(g.state().deaths, 3);
  assert.equal(g.state().over, false);
});

test("the van and the stockroom stay locked without their keys", () => {
  const g = createGame(world, { random: mulberry32(20261022), bench: "case-150" });
  g.command("east");
  assert.match(g.command("in").reply, /padlock|grille|locked/i);
  assert.equal(g.state().room.id, "counter");
  g.command("west"); g.command("west"); g.command("north"); g.command("out");
  assert.match(g.command("enter van").reply, /locked/i);
  assert.equal(g.state().room.id, "alley");
});

test("the drawer tag names the seeded drawer in text", () => {
  for (const seed of [20261022, 1, 2]) {
    const g = createGame(world, { random: mulberry32(seed), bench: "case-150" });
    g.command("west"); g.command("down");
    assert.match(g.command("look at drawers").reply, new RegExp(DRAWER[g.params.drawer]));
  }
});
