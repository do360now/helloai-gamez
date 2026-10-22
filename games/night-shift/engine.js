// Night Shift engine: a pure ES module that interprets world.json. No DOM, no timers, no Math.random.
// The same file runs in the browser page, in the solver and in the verifier (tools/night-shift.mjs).
// Design: ../../docs/superpowers/specs/2026-10-22-night-shift-design.md
//
//   const game = createGame(world, { random, bench });
//   game.state()          the seam the renderer and UI read (see state() below)
//   game.command(text)    => { reply, events }
//   game.snapshot() / game.restore(s)   plain-object state, used by the rewind and the solver
//   arcadeAdapter({...})  the object for Arcade.register (games/arcade.js)
//   mulberry32(seed)      the arcade.js generator, so Node reproduces the browser's parameter picks

import { parse, normalize, DIRECTIONS } from "./parser.js";

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UNKNOWN_VERB = "I don't understand that. Type 'help' for the verbs.";
const REWIND = "...and then you are back where you were, a little wiser.";
const OVER = "The night is over.";

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// "a mat", "an owl", "Bob" (proper names keep no article).
export function withArticle(name) {
  if (/^[A-Z]/.test(name)) return name;
  return (/^[aeiou]/i.test(name) ? "an " : "a ") + name;
}

function listNames(names) {
  return names.join(", ");
}

// maxScore is the sum of every score effect across rules (each rule once) and every topic's points.
export function maxScoreOf(world) {
  let total = 0;
  const seen = new Set();
  for (const r of world.rules || []) {
    for (const e of r.do || []) {
      const sid = e.id || r.id;
      if (typeof e.score === "number" && !seen.has(sid)) { seen.add(sid); total += e.score; }
    }
  }
  for (const [oid, o] of Object.entries(world.objects || {})) {
    for (const [tid, t] of Object.entries(o.topics || {})) {
      if (typeof t.points === "number" && !seen.has(oid + ":" + tid)) { seen.add(oid + ":" + tid); total += t.points; }
    }
  }
  return total;
}

export function createGame(world, opts = {}) {
  const random = opts.random || (() => 0);
  const bench = opts.bench || null;
  const benchmark = (world.benchmarks || {})[bench] || null;
  const budget = benchmark && benchmark.budget ? benchmark.budget : null;
  const deathPenalty = typeof world.deathPenalty === "number" ? world.deathPenalty : 5;
  const maxScore = maxScoreOf(world);

  // Seeded parameters, picked in key order so a replay reproduces them.
  const params = {};
  for (const [name, p] of Object.entries(world.params || {})) {
    const i = Math.floor(random() * p.choices.length);
    params[name] = p.choices[Math.min(i, p.choices.length - 1)];
  }
  const sub = (text) => String(text).replace(/\$\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
  const pid = (v) => (v && typeof v === "object" && v.param ? params[v.param] : v);

  let S = {
    room: world.start,
    flags: {},
    inv: (world.inventory || []).slice(),
    placed: {},
    revealed: {},
    scored: {},
    addedExits: {},
    score: 0,
    turn: 0,
    commands: 0,
    deaths: 0,
    over: false,
    reason: null,
    reply: "",
    transcript: [],
  };
  for (const [rid, room] of Object.entries(world.rooms)) for (const oid of room.objects || []) S.placed[pid(oid)] = rid;
  for (const [oid, o] of Object.entries(world.objects)) if (o.in) S.placed[oid] = pid(o.in);

  const obj = (id) => world.objects[id];
  const objName = (id) => sub(obj(id).name);
  const nounsOf = (id) => {
    const o = obj(id);
    const list = (o.nouns || []).map(sub);
    const n = normalize(objName(id));
    if (n && !list.includes(n)) list.push(n);
    return list;
  };
  const visible = (id) => S.placed[id] === S.room && !(obj(id).hidden && !S.revealed[id]);
  const held = (id) => S.inv.includes(id);
  const present = (id) => visible(id) || held(id);

  function visibleObjects() {
    const out = [];
    for (const oid of world.rooms[S.room].objects || []) { const id = pid(oid); if (visible(id)) out.push(id); }
    for (const id of Object.keys(world.objects)) if (visible(id) && !out.includes(id)) out.push(id);
    return out;
  }

  function exits() {
    const list = (world.rooms[S.room].exits || []).concat(S.addedExits[S.room] || []);
    return list.map((e) => ({ dir: e.dir, to: pid(e.to), name: e.name ? sub(e.name) : null, require: e.require, fail: e.fail }));
  }

  function holds(req) {
    if (!req) return true;
    if (req.room && req.room !== S.room) return false;
    for (const id of req.has || []) if (!held(pid(id))) return false;
    for (const id of req.visible || []) if (!visible(pid(id))) return false;
    for (const [k, v] of Object.entries(req.flags || {})) if (!!S.flags[k] !== !!v) return false;
    for (const [k, v] of Object.entries(req.param || {})) if (params[k] !== v) return false;
    if (typeof req.minTurn === "number" && S.turn < req.minTurn) return false;
    return true;
  }
  const reqCount = (req) => (req ? Object.keys(req).length : 0);

  function roomText() {
    const room = world.rooms[S.room];
    let t = sub(room.text);
    for (const x of room.extra || []) if (holds(x.require)) t += " " + sub(x.text);
    const seen = visibleObjects().map((id) => withArticle(objName(id)));
    if (seen.length) t += "\nYou see: " + listNames(seen) + ".";
    const ex = exits().map((e) => e.dir + (e.name ? " (" + e.name + ")" : ""));
    if (ex.length) t += "\nExits: " + listNames(ex) + ".";
    return t;
  }

  function nouns() {
    const list = [];
    for (const id of visibleObjects()) list.push({ id, nouns: nounsOf(id) });
    for (const id of S.inv) list.push({ id, nouns: nounsOf(id) });
    const taken = new Set(list.flatMap((n) => n.nouns));
    for (const e of exits()) {
      if (!e.name) continue;
      const n = normalize(e.name);
      if (!taken.has(n)) list.push({ id: "exit:" + e.dir, nouns: [n] });
    }
    return list;
  }

  function move(e, events) {
    if (e.require && !holds(e.require)) return e.fail ? sub(e.fail) : "You can't go that way.";
    const from = S.room;
    S.room = e.to;
    events.push({ type: "moved", from, to: e.to });
    return roomText();
  }

  function findTopic(person, topic) {
    const want = normalize(topic);
    for (const [tid, t] of Object.entries(person.topics || {})) {
      if (tid === want || (t.synonyms || []).map(normalize).includes(want)) return [tid, t];
    }
    return [null, null];
  }

  // Default handling for a parsed command when no rule replied. Returns the reply.
  function defaults(p, events) {
    if (p.object && p.object.startsWith("exit:")) {
      if (p.verb === "enter") p = { ...p, verb: "go" };
      else if (p.verb !== "look" && p.verb !== "go") return "That is a way out, not a thing.";
    }
    const isExit = !!p.object && p.object.startsWith("exit:");
    const name = p.object && !isExit ? objName(p.object) : null;
    switch (p.verb) {
      case "look":
        if (!p.object) return roomText();
        if (isExit) return "That way lies " + exits().find((e) => "exit:" + e.dir === p.object).name + ".";
        return sub(obj(p.object).text || "You see nothing special about the " + name + ".");
      case "inventory":
        return S.inv.length ? "You are carrying: " + listNames(S.inv.map((id) => withArticle(objName(id)))) + "." : "You are carrying nothing.";
      case "go": {
        let e = null;
        if (p.dir) e = exits().find((x) => x.dir === p.dir);
        else if (isExit) e = exits().find((x) => "exit:" + x.dir === p.object);
        else {
          const ns = nounsOf(p.object);
          e = exits().find((x) => x.name && ns.some((n) => normalize(x.name).split(" ").join(" ").includes(n)));
        }
        if (!e) return p.dir ? "You can't go " + p.dir + " from here." : "You can't go there.";
        return move(e, events);
      }
      case "take":
        if (held(p.object)) return "You already have that.";
        if (!obj(p.object).takeable) return "You can't take that.";
        S.placed[p.object] = "inventory";
        S.inv.push(p.object);
        events.push({ type: "item", id: p.object, action: "take" });
        return "Taken.";
      case "drop":
        if (!held(p.object)) return "You don't have that.";
        S.inv.splice(S.inv.indexOf(p.object), 1);
        S.placed[p.object] = S.room;
        events.push({ type: "item", id: p.object, action: "drop" });
        return "Dropped.";
      case "ask": {
        const o = obj(p.object);
        if (!o.person) return "The " + name + " has nothing to say.";
        const [tid, t] = findTopic(o, p.topic);
        if (!t) return name + " has nothing to say about that.";
        if (t.require && !holds(t.require)) return t.fail ? sub(t.fail) : name + " says nothing.";
        events.push({ type: "said", npc: p.object, topic: tid });
        const sid = p.object + ":" + tid;
        if (typeof t.points === "number" && !S.scored[sid]) {
          S.scored[sid] = true;
          S.score += t.points;
          events.push({ type: "scored", points: t.points, id: sid });
        }
        return sub(t.reply);
      }
      case "talk": {
        const o = obj(p.object);
        if (!o.person) return "The " + name + " has nothing to say.";
        const topics = Object.keys(o.topics || {});
        return topics.length ? name + " will talk about: " + listNames(topics) + "." : name + " has nothing to say.";
      }
      case "help":
        return world.verbs.map((v) => v.usage).join("\n");
      case "score":
        return "Score: " + S.score + " of " + maxScore + ", move " + S.turn + ", command " + S.commands + (budget ? " of " + budget : "") + ".";
      case "wait":
        return "Time passes.";
      default:
        return "Nothing happens.";
    }
  }

  function matches(when, p) {
    if (when.turn) return false;
    if (when.verb && when.verb !== p.verb) return false;
    if (when.object && pid(when.object) !== p.object) return false;
    if (when.target && pid(when.target) !== p.target) return false;
    if (when.dir && when.dir !== p.dir) return false;
    if (when.topic && normalize(when.topic) !== normalize(p.topic || "")) return false;
    if (when.object && !present(p.object)) return false;
    return true;
  }

  // Runs a rule's effects. Returns {reply, died, won}.
  function run(rule, events) {
    const out = { reply: [], died: null, won: null };
    for (const e of rule.do || []) {
      if (e.reply !== undefined) out.reply.push(sub(e.reply));
      if (e.flag !== undefined) S.flags[e.flag] = e.value === undefined ? true : e.value;
      if (typeof e.score === "number") {
        const sid = e.id || rule.id;
        if (!S.scored[sid]) { S.scored[sid] = true; S.score += e.score; events.push({ type: "scored", points: e.score, id: sid }); }
      }
      if (e.move !== undefined) {
        const id = pid(e.move);
        const to = e.to === undefined ? null : pid(e.to);
        if (held(id)) S.inv.splice(S.inv.indexOf(id), 1);
        if (to === "inventory") { S.inv.push(id); S.placed[id] = "inventory"; } else S.placed[id] = to;
        events.push({ type: "item", id, action: to === "inventory" ? "give" : "move" });
      }
      if (e.reveal !== undefined) S.revealed[pid(e.reveal)] = true;
      if (e.exit) { const x = e.exit; (S.addedExits[x.room] = S.addedExits[x.room] || []).push({ dir: x.dir, to: pid(x.to), name: x.name }); }
      if (e.die !== undefined) out.died = sub(e.die);
      if (e.win !== undefined) out.won = sub(e.win);
    }
    return out;
  }

  // Among the rules matching the command, the one with the most require conditions that hold wins
  // (ties go to the later rule), so a specific rule can override a general one.
  function fire(p, events) {
    const matched = (world.rules || []).filter((r) => r.when && matches(r.when, p));
    let best = null;
    for (const r of matched) if (holds(r.require) && (!best || reqCount(r.require) >= reqCount(best.require))) best = r;
    if (best) return { fired: true, ...run(best, events) };
    const failed = matched.find((r) => r.fail);
    if (failed) return { fired: true, reply: [sub(failed.fail)], died: null, won: null };
    return { fired: false, reply: [], died: null, won: null };
  }

  function turnRules(events) {
    const replies = [];
    for (const r of world.rules || []) {
      if (!r.when || !r.when.turn || !holds(r.require)) continue;
      const out = run(r, events);
      replies.push(...out.reply);
      if (out.died) return { replies, died: out.died };
      if (out.won) return { replies, won: out.won };
    }
    return { replies };
  }

  function finish(reply, events, before) {
    if (!S.over && budget && S.commands >= budget) {
      S.over = true; S.reason = "budget";
      events.push({ type: "over", reason: "budget" });
      reply += "\n" + OVER + " Final score: " + S.score + " of " + maxScore + ".";
    }
    S.reply = reply;
    S.transcript.push({ cmd: before.cmd, reply });
    return { reply, events };
  }

  function command(text) {
    const cmd = String(text).trim().replace(/\s+/g, " ");
    if (S.over) return { reply: OVER, events: [] };
    const before = snapshot();
    S.commands++;
    const events = [];
    const p = parse(cmd, world.verbs, nouns());
    let reply;
    let died = null;
    let won = null;
    const understood = !p.error;
    if (understood) S.turn++;
    if (p.error === "verb") {
      events.push({ type: "unknown", text: cmd });
      reply = UNKNOWN_VERB;
    } else if (p.error === "noun") {
      reply = "You don't see any " + p.word + " here.";
    } else if (p.error === "ambiguous") {
      reply = "Which " + p.word + ": " + p.ids.map((id) => "the " + (id.startsWith("exit:") ? id.slice(5) + " exit" : objName(id))).join(" or ") + "?";
    } else if (p.error === "missing") {
      const v = world.verbs.find((x) => x.verb === p.verb);
      const prep = ((v && v.usage) || "").match(/<[^>]+>\s+(\w+)\s+</);
      reply = p.object ? capitalize(p.verb) + " the " + objName(p.object) + " " + (prep ? prep[1] : "with") + " what?" : capitalize(p.verb) + " what?";
    } else {
      const r = fire(p, events);
      died = r.died; won = r.won;
      const text = r.reply.join("\n");
      reply = !r.fired || (!text && !died && !won) ? [text, defaults(p, events)].filter(Boolean).join("\n") : text;
    }
    if (understood && !died && !won) {
      const t = turnRules(events);
      if (t.replies.length) reply = [reply, ...t.replies].filter(Boolean).join("\n");
      died = t.died || null; won = t.won || null;
    }
    if (died) {
      const turn = S.turn;
      const commands = S.commands;
      const deaths = S.deaths + 1;
      const score = Math.max(0, before.score - deathPenalty);
      const transcript = S.transcript;
      restore(before);
      S.turn = turn; S.commands = commands; S.deaths = deaths; S.score = score; S.transcript = transcript;
      events.length = 0;
      events.push({ type: "died", penalty: deathPenalty }, { type: "rewound" });
      reply = died + "\n" + REWIND;
    } else if (won) {
      S.over = true; S.reason = "win";
      events.push({ type: "over", reason: "win" });
      reply = [reply, won].filter(Boolean).join("\n") + "\nFinal score: " + S.score + " of " + maxScore + " in " + S.commands + " commands.";
    }
    return finish(reply, events, { cmd });
  }

  function snapshot() { return structuredClone(S); }
  function restore(s) { S = structuredClone(s); }

  function state() {
    return {
      room: { id: S.room, name: sub(world.rooms[S.room].name), text: roomText() },
      objects: visibleObjects().map((id) => {
        const o = obj(id);
        const ns = nounsOf(id);
        return { id, name: objName(id), noun: ns[0], nouns: ns, hotspot: o.hotspot || null, person: !!o.person };
      }),
      exits: exits().map((e) => ({ dir: e.dir, to: e.to, name: e.name })),
      inventory: S.inv.map((id) => { const ns = nounsOf(id); return { id, name: objName(id), noun: ns[0], nouns: ns }; }),
      verbs: world.verbs.map((v) => ({ verb: v.verb, synonyms: v.synonyms || [], usage: v.usage, args: v.args || 0 })),
      score: S.score,
      maxScore,
      turn: S.turn,
      commands: S.commands,
      budget,
      deaths: S.deaths,
      over: S.over,
      reply: S.reply,
      transcript: S.transcript.slice(),
    };
  }

  return {
    world, params, bench, maxScore, budget,
    state, command, snapshot, restore,
    get reason() { return S.reason; },
    get over() { return S.over; },
    get score() { return S.score; },
    get stats() { return { maxScore, commands: S.commands, moves: S.turn, deaths: S.deaths, won: S.reason === "win" ? 1 : 0 }; },
  };
}

// The adapter for Arcade.register. The page passes Arcade.random, () => Arcade.bench, () => Arcade.reset(),
// and callbacks: onStart(game) once the game exists, onChange(events) after every applied command.
export function arcadeAdapter(opts) {
  const { world } = opts;
  const bench = typeof opts.bench === "function" ? opts.bench : () => opts.bench || null;
  const adapter = {
    id: world.id,
    turnBased: true,
    benchmarks: world.benchmarks || {},
    actions: Object.fromEntries(world.verbs.map((v) => [v.verb, v.usage]).concat([["<direction>", "north, south, east, west, up, down, in, out (or n, s, e, w, u, d)"]])),
    game: null,
    start() {
      if (opts.reset) opts.reset();
      adapter.game = createGame(world, { random: opts.random, bench: bench() });
      if (opts.onStart) opts.onStart(adapter.game);
    },
    ready() { return true; },
    over() { return adapter.game ? adapter.game.over : false; },
    score() { return adapter.game ? adapter.game.score : 0; },
    stats() { return adapter.game ? adapter.game.stats : {}; },
    observe() {
      if (!adapter.game) return {};
      const { transcript, ...rest } = adapter.game.state();
      return rest;
    },
    text() {
      const g = adapter.game;
      if (!g) return "";
      const s = g.state();
      const lines = [
        world.id + (g.bench ? " " + g.bench : "") + (typeof opts.seed === "function" ? " seed " + opts.seed() : "") + " command " + s.commands + (s.budget ? "/" + s.budget : "") + " move " + s.turn,
        "score " + s.score + " of " + s.maxScore + "  deaths " + s.deaths + (s.over ? "  OVER" : ""),
        "== " + s.room.name + " ==",
        s.room.text,
        "inventory: " + (s.inventory.length ? s.inventory.map((i) => withArticle(i.name)).join(", ") : "nothing"),
        "verbs: " + s.verbs.map((v) => v.verb).join(", ") + " (help for usage)",
      ];
      const last = s.transcript[s.transcript.length - 1];
      if (last) lines.push("> " + last.cmd, last.reply);
      return lines.join("\n");
    },
    apply(action) {
      if (!adapter.game || !String(action).trim()) return Promise.resolve(false);
      const r = adapter.game.command(action);
      if (opts.onChange) opts.onChange(r.events);
      return Promise.resolve(true);
    },
  };
  return adapter;
}

export { DIRECTIONS };
