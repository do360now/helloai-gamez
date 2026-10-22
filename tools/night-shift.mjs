// Night Shift tools: the solver that proves the benchmark invariants, the world checker, a Node
// replay verifier for recorded runs, and a REPL to play from the terminal.
//   node night-shift.mjs check            validate world.json and prove the invariants over every parameter combination (CI)
//   node night-shift.mjs solve [seed]     print the optimal command list and par
//   node night-shift.mjs par              print par for the benchmark seed
//   node night-shift.mjs verify <run.json ...>   replay recorded runs through the engine
//   node night-shift.mjs play [seed] [--seed N] [--out run.json]   play in the terminal; stdin may be piped
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGame, arcadeAdapter, mulberry32, maxScoreOf } from "../games/night-shift/engine.js";
import { normalize } from "../games/night-shift/parser.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORLD = path.join(root, "games/night-shift/world.json");
const BENCH = "case-150";
const MAX_STATES = 300000;
const render = await import("../games/night-shift/render.js").catch((e) => { console.error("warning: render.js not imported, draw lists not checked: " + e.message); return null; });
const DRAW_VALIDATOR = render && typeof render.validate === "function" ? render.validate : null;

// The schema the checker enforces. Unknown keys are content bugs that would otherwise be silent no-ops.
const WHEN_KEYS = new Set(["verb", "object", "target", "topic", "code", "dir", "turn"]);
const REQUIRE_KEYS = new Set(["room", "has", "visible", "flags", "param", "minTurn"]);
const EFFECT_KEYS = new Set(["reply", "flag", "value", "score", "id", "move", "to", "reveal", "exit", "die", "win"]);
const RULE_KEYS = new Set(["id", "when", "require", "fail", "do"]);
const TOPIC_KEYS = new Set(["reply", "points", "require", "fail", "synonyms"]);

export async function loadWorld(file = WORLD) {
  return JSON.parse(await readFile(file, "utf8"));
}

function nounOf(world, id, params) {
  const o = world.objects[id];
  const n = (o.nouns && o.nouns[0]) || o.name;
  return String(n).replace(/\$\{(\w+)\}/g, (m, k) => params[k] || m);
}

const pidOf = (params) => (v) => (v && typeof v === "object" && v.param ? params[v.param] : v);
const isRef = (v) => !!(v && typeof v === "object" && v.param);

// The commands worth trying from a state: exits, takes, every rule phrased from its `when`, and
// every topic of every person in the room. Everything else cannot change the state.
function candidates(world, game, learned) {
  const s = game.state();
  const pid = pidOf(game.params);
  const here = new Set(s.objects.map((o) => o.id).concat(s.inventory.map((o) => o.id)));
  const verbs = Object.fromEntries(world.verbs.map((v) => [v.verb, v]));
  const out = [];
  const add = (c) => { if (!out.includes(c)) out.push(c); };
  for (const e of s.exits) add(e.dir);
  for (const o of s.objects) if (world.objects[o.id].takeable) add("take " + o.noun);
  for (const r of world.rules || []) {
    const w = r.when;
    if (!w || !w.verb || w.turn) continue;
    const v = verbs[w.verb];
    if (!v) continue;
    const obj = pid(w.object);
    const tgt = pid(w.target);
    if (obj && !here.has(obj)) continue;
    if (tgt && !here.has(tgt)) continue;
    let cmd = w.verb;
    if (obj) cmd += " " + nounOf(world, obj, game.params);
    if (w.topic) cmd += " " + (v.preps[0] || "about") + " " + w.topic;
    else if (tgt) cmd += " " + (v.preps[0] || "with") + " " + nounOf(world, tgt, game.params);
    else if (w.code !== undefined) {
      if (learned && isRef(w.code) && !learned.has(w.code.param)) continue;   // a blind player has not seen it yet
      cmd += " with " + pid(w.code);
    }
    add(cmd);
  }
  for (const o of s.objects) {
    const def = world.objects[o.id];
    if (!def.person) continue;
    for (const topic of Object.keys(def.topics || {})) add("ask " + o.noun + " about " + topic);
  }
  return out;
}

function keyOf(snap) {
  const flags = Object.entries(snap.flags).filter(([, v]) => v).map(([k]) => k).sort();
  return JSON.stringify([snap.room, flags, snap.inv.slice().sort(), snap.placed, Object.keys(snap.revealed).sort(), Object.keys(snap.scored).sort(), snap.addedExits]);
}

// Breadth-first search over engine snapshots for the shortest command list that wins with the full
// score. Commands that kill are pruned. `random` may be a seed number or a random function.
// Blind (the default): a seeded value may only be typed once some text the player has read showed
// it, so par is the shortest path a player can take from the text alone. {blind: false} is omniscient.
export function solve(world, random, bench = BENCH, opts = {}) {
  const blind = opts.blind !== false;
  const rng = typeof random === "function" ? random : mulberry32(random);
  const game = createGame(world, { random: rng, bench });
  const max = game.maxScore;
  const paramNames = Object.keys(world.params || {});
  const slim = (snap) => { snap.transcript = []; snap.reply = ""; return snap; };
  const learnFrom = (learned, text) => {
    let out = learned;
    for (const n of paramNames) if (!out.has(n) && text.includes(String(game.params[n]))) { out = new Set(out); out.add(n); }
    return out;
  };
  const start = slim(game.snapshot());
  const learned0 = learnFrom(new Set(), game.state().room.text);
  const keyWith = (snap, learned) => keyOf(snap) + (blind ? "|" + [...learned].sort().join(",") : "");
  const seen = new Set([keyWith(start, learned0)]);
  let frontier = [{ snap: start, path: [], learned: learned0 }];
  let states = 1;
  while (frontier.length) {
    const next = [];
    for (const { snap, path, learned } of frontier) {
      game.restore(snap);
      for (const cmd of candidates(world, game, blind ? learned : null)) {
        game.restore(snap);
        const r = game.command(cmd);
        if (r.events.some((e) => e.type === "died")) continue;
        const after = slim(game.snapshot());
        const learnedAfter = blind ? learnFrom(learned, r.reply + "\n" + game.state().room.text) : learned;
        if (after.over) {
          if (after.reason === "win" && after.score === max) {
            const actions = path.concat(cmd);
            return { par: actions.length, actions, scored: Object.keys(after.scored).sort(), score: after.score, states, params: game.params };
          }
          continue;
        }
        const k = keyWith(after, learnedAfter);
        if (seen.has(k)) continue;
        seen.add(k);
        states++;
        if (states > MAX_STATES) return null;
        next.push({ snap: after, path: path.concat(cmd), learned: learnedAfter });
      }
    }
    frontier = next;
  }
  return null;
}

function words(text) {
  return new Set(normalize(text).split(" ").filter(Boolean));
}

// Every combination of the world's seeded parameters, each as a random() that picks it.
export function paramCombos(world) {
  const names = Object.keys(world.params || {});
  let combos = [{}];
  for (const name of names) {
    const next = [];
    for (const c of combos) for (const choice of world.params[name].choices) next.push({ ...c, [name]: choice });
    combos = next;
  }
  return combos.map((pick) => {
    const indices = names.map((n) => world.params[n].choices.indexOf(pick[n]));
    let i = 0;
    const random = () => { const k = i++ % names.length; return (indices[k] + 0.5) / world.params[names[k]].choices.length; };
    return { pick, random };
  });
}

// Validates world.json and proves the benchmark invariants over every parameter combination.
export function check(world, seeds = [], bench = BENCH, validateDraw = DRAW_VALIDATOR) {
  const problems = [];
  const objects = world.objects || {};
  const rooms = world.rooms || {};
  const params = world.params || {};
  const verbs = new Set((world.verbs || []).map((v) => v.verb));
  const combos = paramCombos(world);
  const isRef = (v) => v && typeof v === "object" && v.param;
  const refOk = (v, where) => { if (isRef(v) && !params[v.param]) problems.push(where + ": unknown param " + v.param); };
  const unknownKeys = (obj, allowed, where) => { for (const k of Object.keys(obj || {})) if (!allowed.has(k)) problems.push(where + ": unknown key " + k); };

  if (!rooms[world.start]) problems.push("start room " + world.start + " does not exist");
  for (const [name, p] of Object.entries(params)) {
    if (!Array.isArray(p.choices) || !p.choices.length) problems.push("param " + name + " has no choices");
  }
  for (const [rid, room] of Object.entries(rooms)) {
    for (const oid of room.objects || []) refOk(oid, "room " + rid);
    for (const e of room.exits || []) { refOk(e.to, "room " + rid + " exit " + e.dir); unknownKeys(e.require, REQUIRE_KEYS, "room " + rid + " exit " + e.dir + " require"); }
    for (const x of room.extra || []) unknownKeys(x.require, REQUIRE_KEYS, "room " + rid + " extra require");
  }
  for (const [oid, o] of Object.entries(objects)) {
    for (const [tid, t] of Object.entries(o.topics || {})) {
      if (typeof t.reply !== "string") problems.push("object " + oid + " topic " + tid + " has no reply");
      unknownKeys(t, TOPIC_KEYS, "object " + oid + " topic " + tid);
      unknownKeys(t.require, REQUIRE_KEYS, "object " + oid + " topic " + tid + " require");
    }
  }
  const ids = new Set();
  const pointsById = new Map();
  for (const r of world.rules || []) {
    const where = "rule " + (r.id || "?");
    if (!r.id) problems.push("a rule has no id");
    if (ids.has(r.id)) problems.push(where + ": duplicate id");
    ids.add(r.id);
    unknownKeys(r, RULE_KEYS, where);
    if (!r.when) { problems.push(where + ": no when"); continue; }
    unknownKeys(r.when, WHEN_KEYS, where + " when");
    unknownKeys(r.require, REQUIRE_KEYS, where + " require");
    if (r.when.verb && !verbs.has(r.when.verb)) problems.push(where + ": unknown verb " + r.when.verb);
    for (const k of ["object", "target", "code"]) refOk(r.when[k], where);
    for (const e of r.do || []) {
      unknownKeys(e, EFFECT_KEYS, where + " do");
      for (const k of ["reveal", "move", "to"]) refOk(e[k], where);
      if (e.exit) { if (!rooms[e.exit.room]) problems.push(where + ": unknown room " + e.exit.room); refOk(e.exit.to, where); }
      if (typeof e.score === "number") {
        const sid = e.id || r.id;
        if (pointsById.has(sid) && pointsById.get(sid) !== e.score) problems.push(where + ": score id " + sid + " is worth " + pointsById.get(sid) + " elsewhere but " + e.score + " here");
        pointsById.set(sid, e.score);
      }
    }
  }
  if (typeof world.maxScore === "number" && world.maxScore !== maxScoreOf(world)) {
    problems.push("maxScore is declared as " + world.maxScore + " but the rules sum to " + maxScoreOf(world));
  }

  // Concrete checks, per parameter combination: every reference resolves, every object is placed or
  // moved somewhere, every hidden object is revealed by some rule, hotspot objects are in a room.
  for (const { pick } of combos) {
    const pid = pidOf(pick);
    const tag = combos.length > 1 ? " [" + Object.values(pick).join(",") + "]" : "";
    const seenProblems = new Set();
    const problem = (p) => { if (!seenProblems.has(p)) { seenProblems.add(p); problems.push(p + tag); } };
    const needObject = (v, where) => { const id = pid(v); if (!objects[id]) problem(where + ": unknown object " + id); };
    const needRoom = (v, where) => { const id = pid(v); if (!rooms[id]) problem(where + ": unknown room " + id); };
    const placed = new Set(world.inventory || []);
    const revealed = new Set();
    const moved = new Set();
    for (const [rid, room] of Object.entries(rooms)) {
      for (const oid of room.objects || []) { needObject(oid, "room " + rid); placed.add(pid(oid)); }
      for (const e of room.exits || []) needRoom(e.to, "room " + rid + " exit " + e.dir);
    }
    for (const [oid, o] of Object.entries(objects)) if (o.in) { needRoom(o.in, "object " + oid); placed.add(oid); }
    for (const r of world.rules || []) {
      const where = "rule " + r.id;
      if (!r.when) continue;
      if (r.when.object) needObject(r.when.object, where);
      if (r.when.target) needObject(r.when.target, where);
      for (const e of r.do || []) {
        if (e.reveal !== undefined) { needObject(e.reveal, where); revealed.add(pid(e.reveal)); }
        if (e.move !== undefined) { needObject(e.move, where); moved.add(pid(e.move)); if (e.to && e.to !== "inventory") needRoom(e.to, where); }
        if (e.exit) needRoom(e.exit.to, where);
      }
      for (const id of (r.require && r.require.has) || []) needObject(id, where);
      for (const id of (r.require && r.require.visible) || []) needObject(id, where);
    }
    for (const [oid, o] of Object.entries(objects)) {
      if (!placed.has(oid) && !moved.has(oid)) problem("object " + oid + " is never placed in a room");
      if (o.hidden && !revealed.has(oid)) problem("object " + oid + " is hidden and no rule reveals it");
      if (o.hotspot && !placed.has(oid) && !moved.has(oid)) problem("object " + oid + " has a hotspot but is never in a room");
    }
  }

  // Everything scorable must be discoverable from the text: every scoring topic is named somewhere
  // the player can read other than its own reply, and every code parameter appears in some text.
  const corpusOf = (skip) => {
    const c = new Set();
    const addText = (t) => { if (typeof t === "string") for (const w of words(t)) c.add(w); };
    for (const room of Object.values(rooms)) { addText(room.text); for (const x of room.extra || []) addText(x.text); }
    for (const [oid, o] of Object.entries(objects)) {
      addText(o.text); addText(o.name);
      for (const [tid, t] of Object.entries(o.topics || {})) if (oid + ":" + tid !== skip) addText(t.reply);
    }
    for (const r of world.rules || []) for (const e of r.do || []) { addText(e.reply); addText(e.win); }
    return c;
  };
  for (const [oid, o] of Object.entries(objects)) {
    for (const [tid, t] of Object.entries(o.topics || {})) {
      if (typeof t.points !== "number") continue;
      const corpus = corpusOf(oid + ":" + tid);
      const names = [tid].concat(t.synonyms || []);
      if (!names.some((n) => [...words(n)].every((w) => corpus.has(w)))) problems.push("topic " + oid + ":" + tid + " scores but no text mentions it");
    }
  }

  if (validateDraw) {
    for (const [rid, room] of Object.entries(rooms)) {
      for (const p of validateDraw(room.draw || [])) problems.push("room " + rid + " draw: " + p);
    }
  }

  let par = null;
  const maxScore = maxScoreOf(world);
  let scored = null;
  if (!problems.length) {
    const results = [];
    const runs = combos.map((c) => ({ label: "params " + JSON.stringify(c.pick), random: c.random })).concat(seeds.map((s) => ({ label: "seed " + s, random: mulberry32(s) })));
    for (const { label, random } of runs) {
      const s = solve(world, random, bench);
      if (!s) {
        const codes = (world.rules || []).filter((r) => r.when && isRef(r.when.code)).map((r) => r.when.code.param);
        problems.push(label + ": no blind path to the full score" + (codes.length ? " (a seeded value such as ${" + codes[0] + "} may never be shown in text before it is needed)" : "") + ", or the search gave up");
        continue;
      }
      results.push({ label, ...s });
    }
    // Any seeded value must be learned in-world before the action that uses it can succeed: an
    // omniscient player must not beat the blind par.
    if (results.length) {
      const open = solve(world, combos.length ? combos[0].random : mulberry32(seeds[0] || 0), bench, { blind: false });
      if (open && open.par < results[0].par) {
        const codes = [...new Set((world.rules || []).filter((r) => r.when && isRef(r.when.code)).map((r) => r.when.code.param))];
        problems.push("a seeded value (" + (codes.join(", ") || "parameter") + ") can be used before any text shows it: omniscient par " + open.par + " beats blind par " + results[0].par);
      }
    }
    if (results.length) {
      const first = results[0];
      par = first.par; scored = first.scored;
      for (const r of results.slice(1)) {
        if (r.par !== first.par) problems.push(r.label + ": par " + r.par + " differs from " + first.label + " (" + first.par + ")");
        if (r.score !== first.score) problems.push(r.label + ": score " + r.score + " differs from " + first.label + " (" + first.score + ")");
        if (JSON.stringify(r.scored) !== JSON.stringify(first.scored)) problems.push(r.label + ": scorable events differ from " + first.label);
      }
    }
  }
  return { ok: !problems.length, problems, par, maxScore, scored, combos: combos.length };
}

// Replays a run's actions through the engine. Stops applying once the game is over.
export function replay(world, run) {
  const game = createGame(world, { random: mulberry32(run.seed), bench: run.bench });
  let applied = 0;
  for (const a of run.actions) {
    if (game.over) break;
    game.command(a);
    applied++;
  }
  return { score: game.score, stats: game.stats, over: game.over, applied };
}

export async function verify(runPath, opts = {}) {
  const world = opts.world || (await loadWorld());
  const benchmarks = opts.benchmarks || JSON.parse(await readFile(path.join(root, "data/benchmarks.json"), "utf8"));
  const run = JSON.parse(await readFile(runPath, "utf8"));
  const problems = [];
  const bench = benchmarks.find((b) => b.game === run.game && b.bench === run.bench);
  if (run.game !== world.id) problems.push("run is for " + run.game);
  if (!bench) problems.push("no benchmark " + run.game + "/" + run.bench);
  else if (bench.seed !== run.seed) problems.push("seed " + run.seed + " is not the benchmark seed " + bench.seed);
  if (run.mode !== "turn") problems.push("only turn-based runs can be replayed");
  if (!Array.isArray(run.actions)) problems.push("actions is not a list");
  else if (run.actions.some((a) => typeof a !== "string")) problems.push("every action must be a string");
  if (!problems.length) {
    const got = replay(world, run);
    if (got.applied !== run.actions.length) problems.push("only " + got.applied + "/" + run.actions.length + " actions applied");
    if (got.score !== run.score) problems.push("score " + got.score + ", recorded " + run.score);
    const want = Object.keys(got.stats).sort().join(",");
    const have = Object.keys(run.stats || {}).sort().join(",");
    if (want !== have) problems.push("stats must have exactly " + want + ", recorded " + (have || "none"));
    for (const [k, v] of Object.entries(run.stats || {})) {
      if (got.stats[k] !== v) problems.push(k + " " + got.stats[k] + ", recorded " + v);
    }
    if (!got.over) problems.push("replay did not finish the game");
    if (run.over !== true) problems.push("over must be true, recorded " + run.over);
  }
  return { ok: !problems.length, problems, run };
}

function parsePlayArgs(rest) {
  const opts = { seed: null, out: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--seed") opts.seed = rest[++i];
    else if (a === "--out") opts.out = rest[++i];
    else if (a.startsWith("--")) throw new Error("unknown option " + a);
    else opts.seed = a;
  }
  if (opts.seed !== null) {
    if (!/^\d{1,10}$/.test(String(opts.seed))) throw new Error("seed must be a whole number, got " + opts.seed);
    opts.seed = Number(opts.seed);
  }
  return opts;
}

// Plays from stdin. Lines are queued as they arrive, so a piped script works as well as a terminal.
async function play(seed, out) {
  const readline = await import("node:readline");
  const world = await loadWorld();
  const adapter = arcadeAdapter({ world, random: mulberry32(seed), bench: () => BENCH, seed: () => seed });
  adapter.start();
  const actions = [];
  const tty = process.stdin.isTTY;
  const prompt = () => { if (tty) process.stdout.write("> "); };
  console.log(adapter.text());
  prompt();
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) { prompt(); continue; }
    if (line === "quit") break;
    if (adapter.over()) break;
    await adapter.apply(line);
    actions.push(line);
    console.log((tty ? "" : "> " + line + "\n") + "\n" + adapter.text());
    if (adapter.over()) break;
    prompt();
  }
  rl.close();
  const run = { protocol: "arcade/0.1", game: world.id, bench: BENCH, seed, mode: "turn", actions, score: adapter.score(), over: adapter.over(), stats: adapter.stats() };
  if (out) {
    await writeFile(out, JSON.stringify(run) + "\n");
    console.log("\nrun written to " + out + " (score " + run.score + ", " + actions.length + " commands)");
  } else {
    console.log("\nscore " + run.score + " of " + adapter.stats().maxScore + " in " + actions.length + " commands. Pass --out run.json to save the run.");
  }
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const benchmarks = JSON.parse(await readFile(path.join(root, "data/benchmarks.json"), "utf8"));
  const bench = benchmarks.find((b) => b.game === "night-shift" && b.bench === BENCH);
  const seed = bench ? bench.seed : 20261022;
  if (cmd === "check") {
    const world = await loadWorld();
    const r = check(world, [seed]);
    for (const p of r.problems) console.log("PROBLEM " + p);
    console.log((r.ok ? "ok" : "FAIL") + ": " + world.id + " maxScore " + r.maxScore + (r.par ? " par " + r.par : "") + " over " + r.combos + " parameter combinations" + (r.scored ? "; scorable " + r.scored.join(",") : ""));
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === "solve" || cmd === "par") {
    const world = await loadWorld();
    const s = solve(world, rest[0] ? Number(rest[0]) : seed);
    if (!s) { console.log("no solution"); process.exit(1); }
    if (cmd === "par") console.log(s.par);
    else { console.log(s.actions.join("\n")); console.log("par " + s.par + ", score " + s.score + ", " + s.states + " states"); }
  } else if (cmd === "verify") {
    let failed = 0;
    for (const f of rest) {
      const r = await verify(path.resolve(f));
      if (r.ok) console.log("ok   " + f + ": score " + r.run.score);
      else { failed++; console.log("FAIL " + f + ": " + r.problems.join("; ")); }
    }
    process.exit(failed ? 1 : 0);
  } else if (cmd === "play") {
    let opts;
    try { opts = parsePlayArgs(rest); } catch (e) { console.error(e.message + "\nusage: play [seed] [--seed N] [--out run.json]"); process.exit(2); }
    await play(opts.seed === null ? seed : opts.seed, opts.out);
  } else {
    console.log("usage: node night-shift.mjs check | solve [seed] | par | verify <run.json ...> | play [seed] [--seed N] [--out run.json]");
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
