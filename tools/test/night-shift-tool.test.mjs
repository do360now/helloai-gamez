import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { check, solve, verify, replay, loadWorld } from "../night-shift.mjs";
import { createGame, mulberry32 } from "../../games/night-shift/engine.js";

const SEED = 20261022;
const world = await loadWorld();
const SCORED = ["accuse", "back-panel", "find-token", "lou:dale", "lou:rudy", "notice-board", "open-safe", "panel-key", "phone", "read-clipboard", "read-ledger", "see-label", "service-mode", "unlock-office"];
const ROUTE = 48;
const EACH = { combos: "each" };
const checkEach = (w, seeds) => check(w, seeds, "case-150", undefined, EACH);

test("solve finds the full reference route, and only types a code it has seen", () => {
  const s = solve(world, SEED);
  assert.ok(s, "no solution");
  assert.equal(s.route, ROUTE);
  assert.ok(s.actions.some((a) => /photo/.test(a)), s.actions.join(" | "));
  assert.equal(s.score, 100);
  assert.deepEqual(s.scored, SCORED);
  const g = createGame(world, { random: mulberry32(SEED), bench: "case-150" });
  for (const a of s.actions) g.command(a);
  assert.equal(g.reason, "win");
  assert.equal(g.state().score, 100);
});

test("check passes on world.json across five seeds and reports the reference route", () => {
  const r = checkEach(world, [SEED, 1, 2, 3, 4]);
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  assert.equal(r.maxScore, 100);
  assert.deepEqual(r.scored, SCORED);
  assert.equal(r.route, ROUTE);
});

test("check reports a declared maxScore that differs from the rules", () => {
  const w = structuredClone(world);
  w.maxScore = 99;
  const r = checkEach(w, [SEED]);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /maxScore/.test(p)), r.problems.join("; "));
});

test("check reports a hidden object no rule reveals and a reference to a missing object", () => {
  const w = structuredClone(world);
  w.objects.ghost = { name: "ghost", nouns: ["ghost"], text: "Boo.", hidden: true };
  w.rooms.floor.objects.push("ghost");
  w.rules.push({ id: "poke", when: { verb: "push", object: "nothing" }, do: [{ reply: "x" }] });
  const r = checkEach(w, [SEED]);
  assert.ok(r.problems.some((p) => /ghost/.test(p)), r.problems.join("; "));
  assert.ok(r.problems.some((p) => /nothing/.test(p)), r.problems.join("; "));
});

test("check reports a seed whose route or score differs", () => {
  const w = structuredClone(world);
  // The safe needs an extra command on some seeds only: a seeded rule that jams the safe once.
  // (reported as a route difference)
  const seeds = [SEED, 1, 2, 3, 4];
  const combos = seeds.map((s) => createGame(world, { random: mulberry32(s) }).params.combo);
  const combo = combos.find((c) => combos.filter((x) => x === c).length < seeds.length);
  assert.ok(combo, "all five seeds share a combination; pick other seeds");
  for (const verb of ["open", "turn", "unlock"]) {
    w.rules.push({ id: "jam-" + verb, when: { verb, object: "safe", code: { param: "combo" } }, require: { param: { combo }, flags: { safeJammed: false, readPhoto: true } }, do: [{ flag: "safeJammed", value: true }, { reply: "The handle sticks. Try again." }] });
  }
  const r = checkEach(w, seeds);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /route/.test(p)), r.problems.join("; "));
});

test("check reports a malformed draw list", () => {
  const w = structuredClone(world);
  w.rooms.floor.draw = [["line", 0, 0, 1.5, 1, 15]];
  const r = checkEach(w, [SEED]);
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
  return { protocol: "arcade/0.1", game: "night-shift", bench: "case-150", seed, mode: "turn", actions: s.actions, score: g.score, over: true, stats: g.stats, player: { id: "solver", name: "solver", kind: "agent", disclosure: "open-book" } };
}

test("verify requires player.disclosure to be blind or open-book for this benchmark", async () => {
  const run = solvedRun();
  delete run.player.disclosure;
  let r = await verify(await runFile(run));
  assert.match(r.problems.join("; "), /player\.disclosure must be "blind" or "open-book"/);
  run.player.disclosure = "sort of";
  r = await verify(await runFile(run));
  assert.match(r.problems.join("; "), /player\.disclosure/);
  run.player.disclosure = "blind";
  r = await verify(await runFile(run));
  assert.deepEqual(r.problems, []);
});

test("replay reproduces a run through the engine", () => {
  const run = solvedRun();
  const r = replay(world, run);
  assert.equal(r.score, 100);
  assert.equal(r.applied, run.actions.length);
  assert.deepEqual(r.stats, { maxScore: 100, commands: run.actions.length, moves: run.actions.length, deaths: 0, won: 1 });
});

test("verify passes a run produced by the solver", async () => {
  const r = await verify(await runFile(solvedRun()));
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
});

test("verify fails when the recorded score is off by one", async () => {
  const run = solvedRun();
  run.score = 99;
  const r = await verify(await runFile(run));
  assert.equal(r.ok, false);
  assert.match(r.problems.join("; "), /score 100, recorded 99/);
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

// Review fixes for the tools.
import { spawn } from "node:child_process";

function playPiped(args, input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL("../night-shift.mjs", import.meta.url).pathname, "play", ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out, err }));
    child.stdin.end(input);
  });
}

test("check enumerates every parameter combination, not just the seeds", () => {
  const w = structuredClone(world);
  const r3 = w.rules.find((r) => r.id === "open-locker3");
  r3.do = r3.do.filter((e) => e.reveal === undefined);
  const r = checkEach(w, [SEED]);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /locker3/.test(p)), r.problems.join("; "));
  assert.ok(r.combos >= 9, String(r.combos));
});

test("check reports a score id whose aliases carry different points", () => {
  const w = structuredClone(world);
  w.rules.find((r) => r.id === "read-ledger-look").do.find((e) => e.score !== undefined).score = 10;
  const r = checkEach(w, [SEED]);
  assert.ok(r.problems.some((p) => /read-ledger/.test(p) && /10/.test(p)), r.problems.join("; "));
});

test("check rejects unknown keys in when, require and do", () => {
  const w = structuredClone(world);
  w.rules.find((r) => r.id === "open-safe").require = { flag: { readPhoto: true } };
  w.rules.push({ id: "bad-do", when: { verb: "push", object: "mop" }, do: [{ text: { room: "floor", append: "x" } }] });
  w.rules.push({ id: "bad-when", when: { verb: "push", object: "mop", direction: "north" }, do: [{ reply: "x" }] });
  const r = checkEach(w, [SEED]);
  for (const key of ["flag", "text", "direction"]) assert.ok(r.problems.some((p) => p.includes("unknown key " + key)), key + ": " + r.problems.join("; "));
});

test("check: a scoring topic must be mentioned outside its own reply, and a code must appear in text", () => {
  const w = structuredClone(world);
  w.objects.marge.topics.zebra = { reply: "Zebra? Yes, the zebra.", points: 5 };
  w.maxScore = 105;
  let r = checkEach(w, [SEED]);
  assert.ok(r.problems.some((p) => /zebra/.test(p)), r.problems.join("; "));
  const w2 = structuredClone(world);
  for (const id of ["turn-photo", "read-photo", "search-photo"]) w2.rules.find((x) => x.id === id).do = [{ flag: "readPhoto", value: true }, { reply: "Nothing on the back." }];
  r = checkEach(w2, [SEED]);
  assert.ok(r.problems.some((p) => /combo/.test(p)), r.problems.join("; "));
  // A seeded value that can be used before any text shows it: drop the photo gate on the safe.
  const w3 = structuredClone(world);
  for (const id of ["open-safe", "turn-safe", "unlock-safe-code"]) { const x = w3.rules.find((y) => y.id === id); x.require = { flags: { safeOpen: false } }; delete x.fail; }
  r = checkEach(w3, [SEED]);
  assert.ok(r.problems.some((p) => /combo/.test(p) && /before/.test(p)), r.problems.join("; "));
});

test("verify is strict about stats, over and action types", async () => {
  const run = solvedRun();
  run.stats = {};
  let r = await verify(await runFile(run));
  assert.match(r.problems.join("; "), /stats/);
  const run2 = solvedRun();
  run2.over = false;
  r = await verify(await runFile(run2));
  assert.match(r.problems.join("; "), /over/);
  const run3 = solvedRun();
  run3.actions[0] = { cmd: run3.actions[0] };
  r = await verify(await runFile(run3));
  assert.match(r.problems.join("; "), /string/);
});

test("play reads piped input line by line, accepts --seed, and writes the run with --out", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "night-shift-play-"));
  const out = path.join(dir, "run.json");
  const noDisc = await playPiped(["--seed", "20261022", "--out", out], "quit\n");
  assert.equal(noDisc.code, 2);
  assert.match(noDisc.err, /--disclosure/);
  const r = await playPiped(["--seed", "20261022", "--out", out, "--disclosure", "blind", "--name", "Test Player"], "look at board\nwait\nquit\n");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /seed 20261022 command 2\/150/);
  assert.match(r.out, /> wait\nTime passes\./);
  assert.doesNotMatch(r.out, /"actions"/);
  const run = JSON.parse(await readFile(out, "utf8"));
  assert.deepEqual(run.actions, ["look at board", "wait"]);
  assert.equal(run.seed, 20261022);
  assert.equal(run.score, 5);
  assert.equal(run.player.disclosure, "blind");
  assert.equal(run.player.id, "test-player");
  assert.equal(typeof run.date, "string");
  const bad = await playPiped(["--frobnicate"], "quit\n");
  assert.notEqual(bad.code, 0);
  assert.match(bad.err, /unknown option --frobnicate/);
});

// Winnability: exact structural checks, and a sampled check that is labelled as such.
test("check reports a flag set to false and an item consumed while another rule still needs it", () => {
  const w = structuredClone(world);
  w.rules.push({ id: "relock", when: { verb: "close", object: "door" }, do: [{ flag: "officeOpen", value: false }, { reply: "Locked again." }] });
  w.rules.push({ id: "lose-ring", when: { verb: "throw", object: "ring", target: "slush" }, do: [{ move: "ring", to: null }, { reply: "Gone." }] });
  const r = checkEach(w, [SEED]);
  assert.ok(r.problems.some((p) => /relock/.test(p) && /false/.test(p)), r.problems.join("; "));
  assert.ok(r.problems.some((p) => /lose-ring/.test(p) && /ring/.test(p)), r.problems.join("; "));
});

test("check proves a code rule is gated on a flag whose setters show the value", () => {
  const w = structuredClone(world);
  for (const id of ["turn-photo", "read-photo", "search-photo"]) w.rules.find((x) => x.id === id).do = [{ flag: "readPhoto", value: true }, { reply: "Nothing on the back." }];
  const r = checkEach(w, [SEED]);
  assert.ok(r.problems.some((p) => /combo/.test(p) && /readPhoto/.test(p)), r.problems.join("; "));
});

test("the sampled winnability check finds a trap room and says it is sampled", () => {
  const w = structuredClone(world);
  w.rooms.pit = { name: "Pit", text: "A pit with no way out.", exits: [], objects: [], draw: [] };
  w.rules.push({ id: "fall", when: { verb: "search", object: "stain" }, do: [{ goto: "pit" }] });
  const r = checkEach(w, [SEED]);
  assert.ok(r.problems.some((p) => /pit|unwinnable|cannot reach/.test(p)), r.problems.join("; "));
  const ok = checkEach(world, [SEED]);
  assert.match(ok.summary, /sampled/);
  assert.ok(ok.sampled > 0);
});
