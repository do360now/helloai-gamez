// Night Shift tools: the world checker (structural proofs plus a planner-based consistency check),
// the planner that produces the reference route, a Node replay verifier for recorded runs, and a
// REPL to play from the terminal.
//   node night-shift.mjs check            validate world.json: exact structural checks, the reference route on every
//                                         parameter combination, and a sampled (not proven) winnability check (CI);
//                                         the structural checks are necessary, not a proof
//   node night-shift.mjs solve [seed]     print the planner's reference route (a good path, not a proven optimum)
//   node night-shift.mjs route            print the reference route's length for the benchmark seed
//   node night-shift.mjs verify <run.json ...>   replay recorded runs through the engine
//   node night-shift.mjs play [seed] [--seed N] [--out run.json --disclosure blind|open-book] [--name NAME] [--harness TEXT]
//                                         play in the terminal; stdin may be piped
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
const EFFECT_KEYS = new Set(["reply", "flag", "value", "score", "id", "move", "to", "reveal", "exit", "die", "win", "goto"]);
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
// A structural (parameter-independent) id: a param reference becomes "<param name>".
const idOf = (v) => (isRef(v) ? "<param " + v.param + ">" : v);

// The commands worth trying from a state: exits, takes, every rule phrased from its `when`, and
// every topic of every person in the room. Everything else cannot change the state.
function candidates(world, game, learned, neededItems = null) {
  const s = game.state();
  const pid = pidOf(game.params);
  const here = new Set(s.objects.map((o) => o.id).concat(s.inventory.map((o) => o.id), Object.keys(world.objects).filter((id) => world.objects[id].everywhere)));
  const verbs = Object.fromEntries(world.verbs.map((v) => [v.verb, v]));
  const out = [];
  const add = (c) => { if (!out.includes(c)) out.push(c); };
  for (const e of s.exits) add(e.dir);
  for (const o of s.objects) if (world.objects[o.id].takeable && (!neededItems || neededItems.has(o.id))) add("take " + o.noun);
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

// Flags that some require reads. Only these, plus scored events, items and revealed objects, count
// as progress; a flag nothing reads cannot change what the player can do next.
function requiredFlags(world) {
  const out = new Set();
  const add = (req) => { for (const k of Object.keys((req && req.flags) || {})) out.add(k); };
  for (const r of world.rules || []) add(r.require);
  for (const room of Object.values(world.rooms || {})) {
    for (const e of room.exits || []) add(e.require);
    for (const x of room.extra || []) add(x.require);
  }
  for (const o of Object.values(world.objects || {})) for (const t of Object.values(o.topics || {})) add(t.require);
  return out;
}

// Items some require.has reads. Taking anything else is not progress.
function neededItemsOf(world) {
  const out = new Set();
  const add = (req) => { for (const id of (req && req.has) || []) if (typeof id === "string") out.add(id); };
  for (const r of world.rules || []) add(r.require);
  for (const room of Object.values(world.rooms || {})) { for (const e of room.exits || []) add(e.require); for (const x of room.extra || []) add(x.require); }
  for (const o of Object.values(world.objects || {})) for (const t of Object.values(o.topics || {})) add(t.require);
  return out;
}

function progressOf(snap, flags, items) {
  const out = new Set();
  for (const id of Object.keys(snap.scored)) out.add("s:" + id);
  for (const id of snap.inv) if (items.has(id)) out.add("i:" + id);
  for (const id of Object.keys(snap.revealed)) out.add("r:" + id);
  for (const [k, v] of Object.entries(snap.flags)) if (v && flags.has(k)) out.add("f:" + k);
  return out;
}

// Plans a command list to the full score and the win: the reference route. Points are never lost
// and nothing is consumed except on the thing it is for (check proves that structurally), so the
// plan is greedy: from the current state, a breadth-first search finds the nearest state with new
// progress (a scored event, an item some rule needs, a revealed object, or a flag some rule reads),
// commits to it, and repeats. Commands that kill are pruned. The result is a good path, not a
// proven optimum: an exact search over ten rooms grows past millions of states. Blind (the
// default): a seeded value may only be typed once some text the player has read showed it, so the
// route is one a player can take from the text alone. {blind: false} is omniscient. {from: snapshot}
// plans from that state instead of the start. `random` may be a seed number or a random function.
export function solve(world, random, bench = BENCH, opts = {}) {
  const blind = opts.blind !== false;
  const goal = opts.goal || "max";   // "max": the full score and the ending; "win": any ending that is a win
  const rng = typeof random === "function" ? random : mulberry32(random);
  const game = createGame(world, { random: rng, bench });
  const max = game.maxScore;
  const flags = requiredFlags(world);
  const items = neededItemsOf(world);
  const paramNames = Object.keys(world.params || {});
  const slim = (snap) => { snap.transcript = []; snap.reply = ""; return snap; };
  const learnFrom = (learned, text) => {
    let out = learned;
    for (const n of paramNames) if (!out.has(n) && text.includes(String(game.params[n]))) { out = new Set(out); out.add(n); }
    return out;
  };
  const keyWith = (snap, learned) => keyOf(snap) + (blind ? "|" + [...learned].sort().join(",") : "");

  if (opts.from) game.restore(opts.from);
  let cur = slim(game.snapshot());
  let learned = learnFrom(new Set(), game.state().room.text);
  const path = [];
  let states = 1;
  for (let leg = 0; leg < 400; leg++) {
    const have = progressOf(cur, flags, items);
    const seen = new Set([keyWith(cur, learned)]);
    let frontier = [{ snap: cur, path: [], learned }];
    let found = null;
    while (frontier.length && !found) {
      const next = [];
      for (const node of frontier) {
        for (const cmd of (game.restore(node.snap), candidates(world, game, blind ? node.learned : null, items))) {
          game.restore(node.snap);
          const r = game.command(cmd);
          if (r.events.some((e) => e.type === "died")) continue;
          const after = slim(game.snapshot());
          const learnedAfter = blind ? learnFrom(node.learned, r.reply + "\n" + game.state().room.text) : node.learned;
          const p = node.path.concat(cmd);
          if (after.over) {
            if (after.reason === "win" && (goal === "win" || after.score === max)) {
              const actions = path.concat(p);
              return { route: actions.length, actions, scored: Object.keys(after.scored).sort(), score: after.score, states, params: game.params };
            }
            continue;
          }
          const k = keyWith(after, learnedAfter);
          if (seen.has(k)) continue;
          seen.add(k);
          states++;
          if (states > MAX_STATES) return null;
          const prog = progressOf(after, flags, items);
          let isNew = false;
          for (const x of prog) if (!have.has(x)) { isNew = true; break; }
          if (isNew) { found = { snap: after, path: p, learned: learnedAfter }; break; }
          next.push({ snap: after, path: p, learned: learnedAfter });
        }
        if (found) break;
      }
      frontier = next;
    }
    if (!found) {
      if (opts.trace) console.error("solve: stuck after " + path.length + " commands in " + cur.room + "; progress " + [...have].join(" ") + "; path: " + path.join(" | "));
      return null;
    }
    if (opts.trace) console.error("leg " + leg + ": " + found.path.join(" | "));
    cur = found.snap; learned = found.learned; path.push(...found.path);
  }
  return null;
}

// Random walks for the sampled winnability check: every verb against every visible or held noun,
// plus exits, drop and wait, and typed codes. Deaths are allowed (they rewind). Returns snapshots.
export function sampleStates(world, random, bench = BENCH, opts = {}) {
  const walks = opts.walks || 40;
  const length = opts.length || 30;
  const rng = mulberry32(opts.seed || 7);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const route = opts.route || [];   // the reference route; walks start part-way along it so every room is covered
  const deathRules = (world.rules || []).filter((r) => (r.do || []).some((e) => e.die !== undefined) && r.when && r.when.verb && r.when.object);
  const out = [];
  for (let n = 0; n < walks; n++) {
    const game = createGame(world, { random: typeof random === "function" ? random : mulberry32(random), bench });
    const codes = Object.values(game.params).filter((v) => /^\d+$/.test(String(v)));
    // Prefixes are spread evenly along the route and tails vary in length, so the end states cover
    // every room the route visits as well as the detours the random tail takes.
    const prefix = route.length ? Math.floor((n / walks) * (route.length + 1)) : 0;
    for (let i = 0; i < prefix && !game.over; i++) game.command(route[i]);
    const tail = n % 3 === 0 ? 0 : Math.floor(rng() * (length + 1));   // every third walk ends exactly on the route
    for (let i = 0; i < tail && !game.over; i++) {
      const s = game.state();
      const nouns = s.objects.map((o) => o.noun).concat(s.inventory.map((o) => o.noun));
      const kind = rng();
      let cmd;
      const here = new Set(s.objects.map((o) => o.id).concat(s.inventory.map((o) => o.id)));
      const deadly = deathRules.filter((r) => here.has(typeof r.when.object === "object" ? game.params[r.when.object.param] : r.when.object));
      if (kind < 0.05 && deadly.length) { const r = pick(deadly); const oid = typeof r.when.object === "object" ? game.params[r.when.object.param] : r.when.object; cmd = r.when.verb + " " + world.objects[oid].nouns[0]; }
      else if (kind < 0.3 && s.exits.length) cmd = pick(s.exits).dir;
      else if (kind < 0.35 && s.inventory.length) cmd = "drop " + pick(s.inventory).noun;
      else if (kind < 0.4) cmd = "wait";
      else if (kind < 0.5 && codes.length && nouns.length) cmd = pick(["open", "turn", "unlock"]) + " " + pick(nouns) + " with " + pick(codes);
      else if (nouns.length) {
        const v = pick(world.verbs);
        cmd = v.args === 2 ? v.verb + " " + pick(nouns) + " " + (v.preps[0] || "with") + " " + pick(nouns) : v.args === 1 ? v.verb + " " + pick(nouns) : v.verb;
      } else cmd = "wait";
      game.command(cmd);
    }
    if (!game.over) out.push(game.snapshot());
  }
  return out;
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

// Every choice of every parameter, varied one at a time with the others at their first choice.
export function paramCombosEach(world) {
  const names = Object.keys(world.params || {});
  const base = Object.fromEntries(names.map((n) => [n, world.params[n].choices[0]]));
  const picks = [base];
  for (const n of names) for (const c of world.params[n].choices.slice(1)) picks.push({ ...base, [n]: c });
  return paramCombos(world).filter((x) => picks.some((p) => names.every((n) => p[n] === x.pick[n])));
}

// Validates world.json: exact structural checks, the reference route on every parameter
// combination, and a sampled (not proven) winnability check.
// opts.combos: "all" (the Cartesian product of every parameter, the default and what CI runs) or
// "each" (every choice of every parameter, varied one at a time; faster, used by the tests).
export function check(world, seeds = [], bench = BENCH, validateDraw = DRAW_VALIDATOR, opts = {}) {
  const problems = [];
  const objects = world.objects || {};
  const rooms = world.rooms || {};
  const params = world.params || {};
  const verbs = new Set((world.verbs || []).map((v) => v.verb));
  const combos = opts.combos === "each" ? paramCombosEach(world) : paramCombos(world);
  const consumedBy = new Map();   // item id -> rule ids that move it to null
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
      for (const k of ["reveal", "move", "to", "goto"]) refOk(e[k], where);
      if (e.exit) { if (!rooms[e.exit.room]) problems.push(where + ": unknown room " + e.exit.room); refOk(e.exit.to, where); }
      if (e.flag !== undefined && e.value === false) problems.push(where + ": sets flag " + e.flag + " to false; flags must only ever go true, or a player could lock themselves out");
      if (e.move !== undefined && (e.to === undefined || e.to === null)) { const id = idOf(e.move); if (!consumedBy.has(id)) consumedBy.set(id, []); consumedBy.get(id).push(r.id); }
      if (typeof e.score === "number") {
        const sid = e.id || r.id;
        if (pointsById.has(sid) && pointsById.get(sid) !== e.score) problems.push(where + ": score id " + sid + " is worth " + pointsById.get(sid) + " elsewhere but " + e.score + " here");
        pointsById.set(sid, e.score);
      }
    }
  }
  // An item may only be consumed by a rule after which nothing else can need it: every other rule
  // that requires it must have fired already (its flag is set by the consuming rule) or score the
  // same event. Simplest sound rule: a consumed item is required only by its consuming rules.
  const requiresItem = (id) => (world.rules || []).filter((r) => ((r.require && r.require.has) || []).map(idOf).includes(id)).map((r) => r.id);
  for (const [id, rules] of consumedBy) {
    const others = requiresItem(id).filter((rid) => !rules.includes(rid));
    if (others.length) problems.push("rule " + rules[0] + ": consumes " + id + " but " + others.join(", ") + " still require it; a player could lose the item before using it");
  }
  // Every room must have a way back to the start: no one-way trips (exits and goto effects both count).
  {
    const edges = {};
    const link = (a, b) => { (edges[a] = edges[a] || new Set()).add(b); };
    // An exit or goto whose require names a flag counts only if some rule can set that flag, and
    // whose require names an item counts only if that item exists. This is a necessary check, not
    // a proof: it does not show the setter is reachable from the trapped side.
    const setters = new Set();
    for (const r of world.rules || []) for (const e of r.do || []) if (e.flag !== undefined && e.value !== false) setters.add(e.flag);
    const satisfiable = (req) => {
      if (!req) return true;
      for (const [k, v] of Object.entries(req.flags || {})) if (v && !setters.has(k)) return false;
      for (const id of req.has || []) if (!objects[idOf(id)]) return false;
      return true;
    };
    for (const [rid, room] of Object.entries(rooms)) for (const e of room.exits || []) if (rooms[idOf(e.to)] && satisfiable(e.require)) link(rid, idOf(e.to));
    // A goto fires where its object is: the rooms that hold it, or anywhere if it can be carried or
    // is an everywhere object.
    const sourcesOf = (r) => {
      const oid = r.when && idOf(r.when.object);
      const o = oid && objects[oid];
      if (!o || o.takeable || o.everywhere) return Object.keys(rooms);
      return Object.entries(rooms).filter(([, room]) => (room.objects || []).map(idOf).includes(oid)).map(([rid]) => rid);
    };
    for (const r of world.rules || []) {
      if (!satisfiable(r.require)) continue;
      for (const e of r.do || []) {
        if (e.goto !== undefined && rooms[idOf(e.goto)]) for (const rid of sourcesOf(r)) link(rid, idOf(e.goto));
        if (e.exit && rooms[e.exit.room] && rooms[idOf(e.exit.to)]) link(e.exit.room, idOf(e.exit.to));
      }
    }
    const reach = (from) => { const seen = new Set([from]); const q = [from]; while (q.length) { const x = q.shift(); for (const y of edges[x] || []) if (!seen.has(y)) { seen.add(y); q.push(y); } } return seen; };
    const fromStart = reach(world.start);
    for (const rid of fromStart) if (!reach(rid).has(world.start)) problems.push("room " + rid + " has no way back to " + world.start + "; a player who goes there is stuck");
  }
  // A rule that needs a typed seeded value must be gated on a flag that is only set by rules whose
  // text shows that value, so the value is always learned in-world before it can be used.
  for (const r of world.rules || []) {
    if (!r.when || !isRef(r.when.code)) continue;
    const name = r.when.code.param;
    const gates = Object.entries((r.require && r.require.flags) || {}).filter(([, v]) => v).map(([k]) => k);
    const shows = (rule) => (rule.do || []).some((e) => typeof e.reply === "string" && e.reply.includes("${" + name + "}"));
    const proven = gates.some((flag) => {
      const setters = (world.rules || []).filter((x) => (x.do || []).some((e) => e.flag === flag && e.value !== false));
      return setters.length && setters.every(shows);
    });
    if (!proven) problems.push("rule " + r.id + " needs ${" + name + "} but is not gated on a flag (" + (gates.join(", ") || "none") + ") that only rules showing ${" + name + "} set; a player could use the value before the text shows it");
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
        if (e.goto !== undefined) needRoom(e.goto, where);
      }
      for (const id of (r.require && r.require.has) || []) needObject(id, where);
      for (const id of (r.require && r.require.visible) || []) needObject(id, where);
    }
    for (const [oid, o] of Object.entries(objects)) {
      if (!placed.has(oid) && !moved.has(oid) && !o.everywhere) problem("object " + oid + " is never placed in a room");
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

  let route = null;
  const maxScore = maxScoreOf(world);
  let scored = null;
  let sampled = 0;
  let sampledDeaths = 0;
  let sampledRooms = 0;
  let budgetShort = 0;
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
    // Smoke test of the seeded-value rule (the proof is the structural check above): an omniscient
    // plan must not be shorter than the blind one.
    if (results.length) {
      const open = solve(world, combos.length ? combos[0].random : mulberry32(seeds[0] || 0), bench, { blind: false });
      if (open && open.route < results[0].route) {
        problems.push("an omniscient plan (" + open.route + ") beats the blind one (" + results[0].route + "): a seeded value is usable before the text shows it");
      }
    }
    // Sampled winnability: from states reached by random walks (which start part-way along the
    // reference route, so every room is covered, and which include deaths), the planner must still
    // reach an ending that is a win, with no budget. Outcomes: winnable, budget-short (a win exists
    // but not within the commands left; a player who wasted commands can run out, that is not a
    // soft-lock) or planner-failed, which fails the check. Sampled, not proven.
    if (!problems.length) {
      const rnd = combos.length ? combos[0].random : mulberry32(seeds[0] || 0);
      const states = sampleStates(world, rnd, bench, { walks: opts.walks || 60, length: opts.length || 30, route: results[0].actions });
      sampled = states.length;
      const roomsSeen = new Set();
      const budget = (world.benchmarks && world.benchmarks[bench] && world.benchmarks[bench].budget) || Infinity;
      for (const snap of states) {
        roomsSeen.add(snap.room);
        if (snap.deaths > 0) sampledDeaths++;
        const s = solve(world, rnd, null, { blind: false, from: snap, goal: "win" });
        if (!s) { problems.push("planner-failed: from a sampled state in " + snap.room + " after " + snap.commands + " commands (" + snap.deaths + " deaths) no route to an ending was found"); break; }
        if (snap.commands + s.route > budget) budgetShort++;
      }
      sampledRooms = roomsSeen.size;
      const allRooms = Object.keys(rooms).length;
      if (opts.walks !== 1 && opts.length !== 1) {
        if (sampledRooms < allRooms) problems.push("sampling coverage short: " + sampledRooms + " of " + allRooms + " rooms sampled; raise walks");
        if (!sampledDeaths) problems.push("sampling coverage short: no sampled state had a death; raise walks");
      }
    }
    if (results.length) {
      const first = results[0];
      route = first.route; scored = first.scored;
      for (const r of results.slice(1)) {
        if (r.route !== first.route) problems.push(r.label + ": route " + r.route + " differs from " + first.label + " (" + first.route + ")");
        if (r.score !== first.score) problems.push(r.label + ": score " + r.score + " differs from " + first.label + " (" + first.score + ")");
        if (JSON.stringify(r.scored) !== JSON.stringify(first.scored)) problems.push(r.label + ": scorable events differ from " + first.label);
      }
    }
  }
  const summary = (problems.length ? "FAIL" : "ok") + ": " + world.id + " maxScore " + maxScore + (route ? ", reference route " + route + " commands" : "") +
    " over " + combos.length + " parameter combinations; structural checks are necessary, not a proof; winnability sampled from " + sampled +
    " random states (" + sampledRooms + " rooms, " + sampledDeaths + " with deaths, " + budgetShort + " budget-short), not proven" + (scored ? "; scorable " + scored.join(",") : "");
  return { ok: !problems.length, problems, route, maxScore, scored, combos: combos.length, sampled, sampledDeaths, sampledRooms, budgetShort, summary };
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
  if (bench && bench.disclosure && !["blind", "open-book"].includes(run.player && run.player.disclosure)) problems.push('player.disclosure must be "blind" or "open-book"');
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

function parsePlayArgs(rest, needDisclosure) {
  const opts = { seed: null, out: null, disclosure: null, name: null, harness: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--seed") opts.seed = rest[++i];
    else if (a === "--out") opts.out = rest[++i];
    else if (a === "--disclosure") opts.disclosure = rest[++i];
    else if (a === "--name") opts.name = rest[++i];
    else if (a === "--harness") opts.harness = rest[++i];
    else if (a.startsWith("--")) throw new Error("unknown option " + a);
    else opts.seed = a;
  }
  if (opts.disclosure !== null && !["blind", "open-book"].includes(opts.disclosure)) throw new Error("--disclosure must be blind or open-book");
  if (opts.out && needDisclosure && !opts.disclosure) throw new Error("this benchmark requires --disclosure blind|open-book with --out, so the run can be verified");
  if (opts.seed !== null) {
    if (!/^\d{1,10}$/.test(String(opts.seed))) throw new Error("seed must be a whole number, got " + opts.seed);
    opts.seed = Number(opts.seed);
  }
  return opts;
}

// Plays from stdin. Lines are queued as they arrive, so a piped script works as well as a terminal.
async function play(seed, out, who = {}) {
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
    const id = (who.name || "your-handle").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "your-handle";
    run.player = { id, name: who.name || "Your name", kind: "human", model: null, harness: who.harness || "terminal play, turn-based", notes: "" };
    if (who.disclosure) run.player.disclosure = who.disclosure;
    run.date = new Date().toISOString().slice(0, 10);
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
    console.log(r.summary);
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === "solve" || cmd === "route") {
    const world = await loadWorld();
    const s = solve(world, rest[0] ? Number(rest[0]) : seed);
    if (!s) { console.log("no route found"); process.exit(1); }
    if (cmd !== "solve") console.log(s.route);
    else { console.log(s.actions.join("\n")); console.log("reference route " + s.route + " commands (a good path, not a proven optimum), score " + s.score + ", " + s.states + " states"); }
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
    try { opts = parsePlayArgs(rest, !!(bench && bench.disclosure)); } catch (e) { console.error(e.message + "\nusage: play [seed] [--seed N] [--out run.json --disclosure blind|open-book] [--name NAME] [--harness TEXT]"); process.exit(2); }
    await play(opts.seed === null ? seed : opts.seed, opts.out, opts);
  } else {
    console.log("usage: node night-shift.mjs check | solve [seed] | route | verify <run.json ...> | play [seed] [--seed N] [--out run.json --disclosure blind|open-book]");
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
