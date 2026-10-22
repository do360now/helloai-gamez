// Night Shift tools: the solver that proves the benchmark invariants, the world checker, a Node
// replay verifier for recorded runs, and a REPL to play from the terminal.
//   node night-shift.mjs check            validate world.json and the seed invariants (CI)
//   node night-shift.mjs solve [seed]     print the optimal command list and par
//   node night-shift.mjs par              print par for the benchmark seed
//   node night-shift.mjs verify <run.json ...>   replay recorded runs through the engine
//   node night-shift.mjs play [seed]      play in the terminal (prints the run JSON at the end)
import { readFile } from "node:fs/promises";
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

export async function loadWorld(file = WORLD) {
  return JSON.parse(await readFile(file, "utf8"));
}

function nounOf(world, id, params) {
  const o = world.objects[id];
  const n = (o.nouns && o.nouns[0]) || o.name;
  return String(n).replace(/\$\{(\w+)\}/g, (m, k) => params[k] || m);
}

// The commands worth trying from a state: exits, takes, every rule phrased from its `when`, and
// every topic of every person in the room. Everything else cannot change the state.
function candidates(world, game) {
  const s = game.state();
  const here = new Set(s.objects.map((o) => o.id).concat(s.inventory.map((o) => o.id)));
  const verbs = Object.fromEntries(world.verbs.map((v) => [v.verb, v]));
  const out = [];
  for (const e of s.exits) out.push(e.dir);
  for (const o of s.objects) if (world.objects[o.id].takeable) out.push("take " + o.noun);
  for (const r of world.rules || []) {
    const w = r.when;
    if (!w || !w.verb || w.turn) continue;
    const v = verbs[w.verb];
    if (!v) continue;
    const obj = w.object && typeof w.object === "object" ? game.params[w.object.param] : w.object;
    const tgt = w.target && typeof w.target === "object" ? game.params[w.target.param] : w.target;
    if (obj && !here.has(obj)) continue;
    if (tgt && !here.has(tgt)) continue;
    let cmd = w.verb;
    if (obj) cmd += " " + nounOf(world, obj, game.params);
    if (w.topic) cmd += " " + (v.preps[0] || "about") + " " + w.topic;
    else if (tgt) cmd += " " + (v.preps[0] || "with") + " " + nounOf(world, tgt, game.params);
    if (!out.includes(cmd)) out.push(cmd);
  }
  for (const o of s.objects) {
    const def = world.objects[o.id];
    if (!def.person) continue;
    for (const topic of Object.keys(def.topics || {})) out.push("ask " + o.noun + " about " + topic);
  }
  return out;
}

function keyOf(snap) {
  const flags = Object.entries(snap.flags).filter(([, v]) => v).map(([k]) => k).sort();
  return JSON.stringify([snap.room, flags, snap.inv.slice().sort(), snap.placed, Object.keys(snap.revealed).sort(), Object.keys(snap.scored).sort(), snap.addedExits]);
}

// Breadth-first search over engine snapshots for the shortest command list that wins with the full
// score. Commands that kill are pruned. Returns {par, actions, scored, score, states} or null.
export function solve(world, seed, bench = BENCH) {
  const game = createGame(world, { random: mulberry32(seed), bench });
  const max = game.maxScore;
  const start = game.snapshot();
  const seen = new Set([keyOf(start)]);
  let frontier = [{ snap: start, path: [] }];
  let states = 1;
  while (frontier.length) {
    const next = [];
    for (const { snap, path } of frontier) {
      game.restore(snap);
      for (const cmd of candidates(world, game)) {
        game.restore(snap);
        const r = game.command(cmd);
        if (r.events.some((e) => e.type === "died")) continue;
        const after = game.snapshot();
        if (after.over) {
          if (after.reason === "win" && after.score === max) {
            const actions = path.concat(cmd);
            return { par: actions.length, actions, scored: Object.keys(after.scored).sort(), score: after.score, states };
          }
          continue;
        }
        const k = keyOf(after);
        if (seen.has(k)) continue;
        seen.add(k);
        states++;
        if (states > MAX_STATES) return null;
        next.push({ snap: after, path: path.concat(cmd) });
      }
    }
    frontier = next;
  }
  return null;
}

function words(text) {
  return new Set(normalize(text).split(" ").filter(Boolean));
}

// Validates world.json and proves the benchmark invariants over several seeds.
export function check(world, seeds, bench = BENCH, validateDraw = DRAW_VALIDATOR) {
  const problems = [];
  const objects = world.objects || {};
  const rooms = world.rooms || {};
  const params = world.params || {};
  const idOf = (v) => (v && typeof v === "object" ? (params[v.param] ? "<param " + v.param + ">" : null) : v);
  const needObject = (v, where) => {
    const id = idOf(v);
    if (id === null) problems.push(where + ": unknown param " + JSON.stringify(v));
    else if (!id.startsWith("<param") && !objects[id]) problems.push(where + ": unknown object " + id);
  };
  const needRoom = (id, where) => { if (!rooms[id]) problems.push(where + ": unknown room " + id); };

  if (!rooms[world.start]) problems.push("start room " + world.start + " does not exist");
  for (const [name, p] of Object.entries(params)) {
    if (!Array.isArray(p.choices) || !p.choices.length) problems.push("param " + name + " has no choices");
  }
  const placed = new Set(world.inventory || []);
  for (const [rid, room] of Object.entries(rooms)) {
    for (const oid of room.objects || []) { needObject(oid, "room " + rid); placed.add(typeof oid === "object" ? "<param>" : oid); }
    for (const e of room.exits || []) needRoom(idOf(e.to), "room " + rid + " exit " + e.dir);
  }
  for (const [oid, o] of Object.entries(objects)) {
    if (o.in) { needRoom(idOf(o.in), "object " + oid); placed.add(oid); }
    for (const [tid, t] of Object.entries(o.topics || {})) {
      if (typeof t.reply !== "string") problems.push("object " + oid + " topic " + tid + " has no reply");
    }
  }
  for (const name of Object.keys(params)) {
    for (const choice of params[name].choices) {
      const used = JSON.stringify(world.rules || []).includes('{"param":"' + name + '"}') || JSON.stringify(rooms).includes('{"param":"' + name + '"}');
      if (used && !objects[choice] && !rooms[choice]) problems.push("param " + name + " choice " + choice + " is not an object or room");
    }
  }
  const revealed = new Set();
  const moved = new Set();
  const verbs = new Set((world.verbs || []).map((v) => v.verb));
  const ids = new Set();
  for (const r of world.rules || []) {
    const where = "rule " + r.id;
    if (!r.id) problems.push("a rule has no id");
    if (ids.has(r.id)) problems.push(where + ": duplicate id");
    ids.add(r.id);
    if (!r.when) { problems.push(where + ": no when"); continue; }
    if (r.when.verb && !verbs.has(r.when.verb)) problems.push(where + ": unknown verb " + r.when.verb);
    if (r.when.object) needObject(r.when.object, where);
    if (r.when.target) needObject(r.when.target, where);
    for (const e of r.do || []) {
      if (e.reveal !== undefined) { needObject(e.reveal, where); revealed.add(idOf(e.reveal)); }
      if (e.move !== undefined) { needObject(e.move, where); moved.add(idOf(e.move)); if (e.to && e.to !== "inventory") needRoom(idOf(e.to), where); }
      if (e.exit) { needRoom(e.exit.room, where); needRoom(idOf(e.exit.to), where); }
    }
    for (const id of (r.require && r.require.has) || []) needObject(id, where);
    for (const id of (r.require && r.require.visible) || []) needObject(id, where);
  }
  for (const [oid, o] of Object.entries(objects)) {
    if (!placed.has(oid) && !moved.has(oid) && !placed.has("<param>")) problems.push("object " + oid + " is never placed in a room");
    if (o.hidden && !revealed.has(oid) && !revealed.has("<param " + "keyLocker>")) {
      const anyParamReveal = [...revealed].some((x) => x && x.startsWith("<param"));
      if (!anyParamReveal) problems.push("object " + oid + " is hidden and no rule reveals it");
    }
    if (o.hotspot && !placed.has(oid) && !moved.has(oid)) problems.push("object " + oid + " has a hotspot but is never in a room");
  }
  if (typeof world.maxScore === "number" && world.maxScore !== maxScoreOf(world)) {
    problems.push("maxScore is declared as " + world.maxScore + " but the rules sum to " + maxScoreOf(world));
  }

  // Everything scorable must be discoverable from the text: every scoring topic is named somewhere
  // the player can read.
  const corpus = new Set();
  const addText = (t) => { if (typeof t === "string") for (const w of words(t)) corpus.add(w); };
  for (const room of Object.values(rooms)) { addText(room.text); for (const x of room.extra || []) addText(x.text); }
  for (const o of Object.values(objects)) {
    addText(o.text); addText(o.name);
    for (const t of Object.values(o.topics || {})) addText(t.reply);
  }
  for (const r of world.rules || []) for (const e of r.do || []) { addText(e.reply); addText(e.win); }
  for (const [oid, o] of Object.entries(objects)) {
    for (const [tid, t] of Object.entries(o.topics || {})) {
      if (typeof t.points !== "number") continue;
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
  let maxScore = maxScoreOf(world);
  let scored = null;
  if (!problems.length) {
    const results = [];
    for (const seed of seeds) {
      const s = solve(world, seed, bench);
      if (!s) { problems.push("seed " + seed + ": no path to the full score (or the search gave up)"); continue; }
      results.push({ seed, ...s });
    }
    if (results.length) {
      const first = results[0];
      par = first.par; scored = first.scored;
      for (const r of results.slice(1)) {
        if (r.par !== first.par) problems.push("seed " + r.seed + ": par " + r.par + " differs from seed " + first.seed + " (" + first.par + ")");
        if (r.score !== first.score) problems.push("seed " + r.seed + ": score " + r.score + " differs from seed " + first.seed + " (" + first.score + ")");
        if (JSON.stringify(r.scored) !== JSON.stringify(first.scored)) problems.push("seed " + r.seed + ": scorable events differ from seed " + first.seed);
      }
    }
  }
  return { ok: !problems.length, problems, par, maxScore, scored };
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
  if (!problems.length) {
    const got = replay(world, run);
    if (got.applied !== run.actions.length) problems.push("only " + got.applied + "/" + run.actions.length + " actions applied");
    if (got.score !== run.score) problems.push("score " + got.score + ", recorded " + run.score);
    for (const [k, v] of Object.entries(run.stats || {})) {
      if (got.stats[k] !== v) problems.push(k + " " + got.stats[k] + ", recorded " + v);
    }
    if (!got.over) problems.push("replay did not finish the game");
  }
  return { ok: !problems.length, problems, run };
}

async function play(seed) {
  const readline = await import("node:readline/promises");
  const world = await loadWorld();
  const adapter = arcadeAdapter({ world, random: mulberry32(seed), bench: () => BENCH, seed: () => seed });
  adapter.start();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const actions = [];
  console.log(adapter.text());
  while (!adapter.over()) {
    const line = (await rl.question("> ")).trim();
    if (!line) continue;
    if (line === "quit") break;
    await adapter.apply(line);
    actions.push(line);
    console.log("\n" + adapter.text());
  }
  rl.close();
  const run = { protocol: "arcade/0.1", game: world.id, bench: BENCH, seed, mode: "turn", actions, score: adapter.score(), over: adapter.over(), stats: adapter.stats() };
  console.log("\nrun:\n" + JSON.stringify(run));
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const benchmarks = JSON.parse(await readFile(path.join(root, "data/benchmarks.json"), "utf8"));
  const bench = benchmarks.find((b) => b.game === "night-shift" && b.bench === BENCH);
  const seed = bench ? bench.seed : 20261022;
  if (cmd === "check") {
    const world = await loadWorld();
    const r = check(world, [seed, 1, 2, 3, 4]);
    for (const p of r.problems) console.log("PROBLEM " + p);
    console.log((r.ok ? "ok" : "FAIL") + ": " + world.id + " maxScore " + r.maxScore + (r.par ? " par " + r.par : "") + (r.scored ? " scorable " + r.scored.join(",") : ""));
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
    await play(rest[0] ? Number(rest[0]) : seed);
  } else {
    console.log("usage: node night-shift.mjs check | solve [seed] | par | verify <run.json ...> | play [seed]");
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
