import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, solve, verify, replay, loadWorld } from "../night-shift.mjs";
import { createGame, mulberry32 } from "../../games/night-shift/engine.js";

const SEED = 20261022;
const world = await loadWorld();
const SCORED = ["find-token", "notice-board", "open-safe", "read-ledger", "service-mode", "unlock-office"];

test("solve finds the slice path at or under the hand-written length", () => {
  const s = solve(world, SEED);
  assert.ok(s, "no solution");
  assert.ok(s.par <= 13, `par ${s.par}`);
  assert.equal(s.score, 45);
  assert.deepEqual(s.scored, SCORED);
  const g = createGame(world, { random: mulberry32(SEED), bench: "case-150" });
  for (const a of s.actions) g.command(a);
  assert.equal(g.reason, "win");
  assert.equal(g.state().score, 45);
});

test("check passes on world.json across five seeds and reports par", () => {
  const r = check(world, [SEED, 1, 2, 3, 4]);
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.equal(r.maxScore, 45);
  assert.deepEqual(r.scored, SCORED);
  assert.ok(r.par >= 10 && r.par <= 13);
});

test("check reports a declared maxScore that differs from the rules", () => {
  const w = structuredClone(world);
  w.maxScore = 44;
  const r = check(w, [SEED]);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /maxScore/.test(p)), r.problems.join("; "));
});

test("check reports a hidden object no rule reveals and a reference to a missing object", () => {
  const w = structuredClone(world);
  w.objects.ghost = { name: "ghost", nouns: ["ghost"], text: "Boo.", hidden: true };
  w.rooms.floor.objects.push("ghost");
  w.rules.push({ id: "poke", when: { verb: "push", object: "nothing" }, do: [{ reply: "x" }] });
  const r = check(w, [SEED]);
  assert.ok(r.problems.some((p) => /ghost/.test(p)), r.problems.join("; "));
  assert.ok(r.problems.some((p) => /nothing/.test(p)), r.problems.join("; "));
});

test("check reports a seed whose par or score differs", () => {
  const w = structuredClone(world);
  // The safe needs an extra command on some seeds only: a seeded rule that jams the safe once.
  const seeds = [SEED, 1, 2, 3, 4];
  const combos = seeds.map((s) => createGame(world, { random: mulberry32(s) }).params.combo);
  const combo = combos.find((c) => combos.filter((x) => x === c).length < seeds.length);
  assert.ok(combo, "all five seeds share a combination; pick other seeds");
  for (const verb of ["open", "turn"]) {
    w.rules.push({ id: "jam-" + verb, when: { verb, object: "safe" }, require: { param: { combo }, flags: { safeJammed: false } }, do: [{ flag: "safeJammed", value: true }, { reply: "The handle sticks. Try again." }] });
  }
  const r = check(w, seeds);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /par/.test(p)), r.problems.join("; "));
});

test("check reports a malformed draw list", () => {
  const w = structuredClone(world);
  w.rooms.floor.draw = [["line", 0, 0, 1.5, 1, 15]];
  const r = check(w, [SEED]);
  assert.ok(r.problems.some((p) => /draw/.test(p)), r.problems.join("; "));
});

async function runFile(run) {
  const dir = await mkdtemp(path.join(tmpdir(), "night-shift-"));
  const file = path.join(dir, "run.json");
  await writeFile(file, JSON.stringify(run));
  return file;
}

function solvedRun(seed = SEED) {
  const s = solve(world, seed);
  const g = createGame(world, { random: mulberry32(seed), bench: "case-150" });
  for (const a of s.actions) g.command(a);
  return { protocol: "arcade/0.1", game: "night-shift", bench: "case-150", seed, mode: "turn", actions: s.actions, score: g.score, over: true, stats: g.stats };
}

test("replay reproduces a run through the engine", () => {
  const run = solvedRun();
  const r = replay(world, run);
  assert.equal(r.score, 45);
  assert.equal(r.applied, run.actions.length);
  assert.deepEqual(r.stats, { maxScore: 45, commands: run.actions.length, moves: run.actions.length, deaths: 0, won: 1 });
});

test("verify passes a run produced by the solver", async () => {
  const r = await verify(await runFile(solvedRun()));
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
});

test("verify fails when the recorded score is off by one", async () => {
  const run = solvedRun();
  run.score = 44;
  const r = await verify(await runFile(run));
  assert.equal(r.ok, false);
  assert.match(r.problems.join("; "), /score 45, recorded 44/);
});

test("verify fails on the wrong seed and on a stat that differs", async () => {
  const run = solvedRun(7);
  const r = await verify(await runFile(run));
  assert.match(r.problems.join("; "), /seed 7 is not the benchmark seed 20261022/);
  const run2 = solvedRun();
  run2.stats.deaths = 1;
  const r2 = await verify(await runFile(run2));
  assert.match(r2.problems.join("; "), /deaths 0, recorded 1/);
});

test("verify fails when actions continue after the game is over", async () => {
  const run = solvedRun();
  run.actions = run.actions.concat(["look"]);
  const r = await verify(await runFile(run));
  assert.match(r.problems.join("; "), /actions applied/);
});

test("the benchmark is registered", async () => {
  const benchmarks = JSON.parse(await readFile(new URL("../../data/benchmarks.json", import.meta.url), "utf8"));
  const b = benchmarks.find((x) => x.id === "night-shift/case-150");
  assert.ok(b);
  assert.equal(b.seed, SEED);
});
