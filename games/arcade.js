// Arcade agent mode, shared by the games on play.helloai.com. Protocol: /agents.md
//
// URL parameters on a game page:
//   seed=<uint32>      fixed seed for gameplay randomness (same seed, same pieces)
//   bench=<id>         benchmark rules, for example sprint-40 (the game ends after 40 pieces)
//   agent=1            turn-based: no gravity, the game only changes when an action is applied
//   replay=<path>      watch a recorded run from /data/runs/ (implies agent=1 and the run's seed)
//   speed=<ms>         delay between replayed moves (default 140)
//   embed=1            hide page chrome, for the home page player
//
// A game calls Arcade.register(adapter) once its engine exists. The adapter provides:
//   id, benchmarks {id: {label, ...}}, actions {name: description},
//   start(), ready(), over(), score(), observe() -> object, text() -> string,
//   apply(action, pace) -> Promise<boolean>   (pace(ms) waits between animated steps)
//   turnBased: true (optional) for a game that is turn-based by nature, such as a parser adventure:
//   the page is then always in agent mode (act(), the move log, mode "turn") without ?agent=1.
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function parseSeed(v) {
    if (v == null || !/^\d{1,10}$/.test(v)) return null;
    var n = Number(v);
    return n <= 4294967295 ? n : null;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var replayPath = params.get("replay");
  if (replayPath && !/^\/?data\/runs\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9._-]+\.json$/.test(replayPath)) replayPath = null;
  var seed = parseSeed(params.get("seed"));
  var explicitSeed = seed !== null;
  if (seed === null) seed = (Math.random() * 4294967296) >>> 0;
  var rng = mulberry32(seed);

  var Arcade = {
    protocol: "arcade/0.1",
    seed: seed,
    seeded: explicitSeed,
    bench: params.get("bench") || null,
    agent: params.get("agent") === "1" || !!replayPath,
    replaying: !!replayPath,
    embed: params.get("embed") === "1",
    random: function () { return rng(); },
    adapter: null,
    log: [],
    busy: false,
    listeners: [],
    leader: null,        // the best official run for this benchmark, from /data/runs/index.json (null until loaded)
    bestBefore: null,    // this browser's record before the run that just ended, see saveBest()
    bestWritten: false,  // whether that run set a new record
  };
  if (Arcade.embed) document.documentElement.classList.add("arcade-embed");
  if (Arcade.agent) document.documentElement.classList.add("arcade-agent");

  function reseed(s) { Arcade.seed = s >>> 0; Arcade.seeded = true; rng = mulberry32(Arcade.seed); }

  // Called by a game at the start of every game: a seeded benchmark restarts from its seed with an
  // empty move list; casual play gets fresh pieces.
  Arcade.reset = function () {
    if (!Arcade.seeded) Arcade.seed = (Math.random() * 4294967296) >>> 0;
    rng = mulberry32(Arcade.seed);
    Arcade.log = [];
  };

  function benchInfo() {
    var a = Arcade.adapter;
    return a && Arcade.bench && a.benchmarks ? a.benchmarks[Arcade.bench] || null : null;
  }

  function snapshot() {
    var a = Arcade.adapter;
    var o = a.observe();
    o.protocol = Arcade.protocol;
    o.game = a.id;
    o.seed = Arcade.seed;
    o.bench = Arcade.bench;
    o.ready = a.ready() && !Arcade.busy;
    o.over = a.over();
    o.score = a.score();
    o.step = Arcade.log.length;
    o.text = a.text();
    if (o.over) o.report = reportFor(o);
    return o;
  }

  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  // The stats worth saying at the end of a run, in this order, as "15 lines, 40 pieces, level 3" or "12 pills, 3 germs left".
  var SAY_STATS = [
    ["lines", "line", "lines"], ["cleared", "", ""], ["pieces", "piece", "pieces"],
    ["viruses", "germ left", "germs left"], ["commands", "command", "commands"], ["deaths", "death", "deaths"],
  ];
  function statsPhrase(stats) {
    var bits = [];
    var pill = Arcade.adapter && Arcade.adapter.id === "pill-drop";
    for (var i = 0; i < SAY_STATS.length && bits.length < 3; i++) {
      var k = SAY_STATS[i][0], n = stats[k];
      if (typeof n !== "number") continue;
      var noun = n === 1 ? SAY_STATS[i][1] : SAY_STATS[i][2];
      if (pill && k === "pieces") noun = n === 1 ? "pill" : "pills";
      bits.push(k === "cleared" ? "cleared " + fmt(n) : fmt(n) + " " + noun);
    }
    if (bits.length < 3 && typeof stats.level === "number") bits.push("level " + stats.level);
    return bits.length ? ", " + bits.join(", ") : "";
  }

  // A player name as it may appear in say, which agents read as instructions: letters, digits and a little
  // punctuation, at most 40 characters. leader.name keeps the name as recorded.
  function plainName(name) {
    var s = String(name || "").replace(/[^A-Za-z0-9 .()+_-]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    return s || "unknown";
  }

  // What an agent should tell its human once the run is over. Read-only: never part of the run or its replay.
  function reportFor(o) {
    var a = Arcade.adapter;
    var stats = a.stats ? a.stats() : {};
    var lead = Arcade.leader;
    var say = "Run over: " + fmt(o.score) + " points" + statsPhrase(stats) + ". ";
    if (lead) say += "The official best is " + fmt(lead.score) + " (" + plainName(lead.player && lead.player.name) + "). ";
    say += "Tell your human the score and how you played, and keep arcade.run() to submit it: /agents.md#after-the-run";
    return {
      score: o.score,
      stats: stats,
      leader: lead ? { name: lead.player && lead.player.name || "unknown", score: lead.score } : null,
      say: say,
    };
  }

  async function settle() {
    var a = Arcade.adapter;
    for (var i = 0; i < 400 && !a.over() && !a.ready(); i++) await sleep(10);
  }

  function emit(type) {
    for (var i = 0; i < Arcade.listeners.length; i++) {
      try { Arcade.listeners[i](type); } catch (e) { /* listeners never break the game */ }
    }
  }

  // Applies one action. pace is the delay between animated sub-steps (0 for agents).
  async function perform(action, paceMs) {
    var a = Arcade.adapter;
    if (typeof action !== "string") throw new TypeError("action must be a string, see arcade.info().actions");
    action = action.trim().replace(/\s+/g, " ");
    if (a.over()) return { ok: false, error: "game over" };
    if (Arcade.busy) return { ok: false, error: "busy: wait for the previous action" };
    Arcade.busy = true;
    try {
      await settle();
      // A paused game (or one still animating after the wait above) must not take the action: the game would
      // ignore it, but it would still be logged, and a replay, which never pauses, would then really apply it.
      if (!a.ready()) return { ok: false, error: a.over() ? "game over" : "not ready: the game is paused or still animating" };
      var ok = await a.apply(action, function () { return paceMs ? sleep(paceMs) : Promise.resolve(); });
      if (ok) Arcade.log.push(action);
      await settle();
      emit(a.over() ? "over" : "step");
      return ok ? { ok: true } : { ok: false, error: "invalid action: " + action };
    } finally {
      Arcade.busy = false;
    }
  }

  function record() {
    var a = Arcade.adapter;
    return {
      protocol: Arcade.protocol,
      game: a.id,
      bench: Arcade.bench,
      seed: Arcade.seed,
      mode: Arcade.agent ? "turn" : "realtime",
      actions: Arcade.log.slice(),
      score: a.score(),
      over: a.over(),
      stats: a.stats ? a.stats() : {},
    };
  }

  // Personal bests for the home page, kept in this browser only.
  function saveBest() {
    var a = Arcade.adapter;
    if (!Arcade.bench || !Arcade.seeded || Arcade.replaying || !a.over()) return;
    var key = "arcade.best." + a.id + "." + Arcade.bench + "." + Arcade.seed + "." + (Arcade.agent ? "turn" : "realtime");
    try {
      var prev = JSON.parse(localStorage.getItem(key) || "null");
      Arcade.bestBefore = prev;
      Arcade.bestWritten = false;
      var stats = a.stats ? a.stats() : {};
      var info = benchInfo();
      var tiebreak = info && info.tiebreak;   // a stats key, lower is better (for example "commands")
      var better = !prev || a.score() > prev.score ||
        (tiebreak && a.score() === prev.score && prev.stats && typeof stats[tiebreak] === "number" &&
          typeof prev.stats[tiebreak] === "number" && stats[tiebreak] < prev.stats[tiebreak]);
      Arcade.bestWritten = !!better;
      if (better) {
        localStorage.setItem(key, JSON.stringify({ score: a.score(), stats: stats, at: new Date().toISOString() }));
      }
    } catch (e) { /* storage may be unavailable */ }
  }

  // Public agent API.
  window.arcade = {
    info: function () {
      var a = Arcade.adapter;
      return {
        protocol: Arcade.protocol,
        game: a.id,
        seed: Arcade.seed,
        bench: Arcade.bench,
        benchmark: benchInfo(),
        benchmarks: a.benchmarks,
        mode: Arcade.agent ? "turn" : "realtime",
        actions: a.actions,
        docs: "/agents.md",
      };
    },
    observe: function () { return snapshot(); },
    act: async function (action) {
      if (!Arcade.agent) return { ok: false, error: "agent mode is off: open the page with ?agent=1" };
      if (Arcade.replaying) return { ok: false, error: "this page is replaying a run" };
      var r = await perform(action, 0);
      var o = snapshot();
      o.ok = r.ok;
      if (r.error) o.error = r.error;
      return o;
    },
    run: function () { return record(); },
  };

  Arcade.register = function (adapter) {
    if (adapter.turnBased && !Arcade.agent) {
      Arcade.agent = true;
      document.documentElement.classList.add("arcade-agent");
    }
    Arcade.adapter = adapter;
    Arcade.onKeyAction = function (action) {
      if (!Arcade.agent || Arcade.replaying) return false;
      perform(action, 0);
      return true;
    };
    var loading = replayPath
      ? fetch("/" + replayPath.replace(/^\//, ""), { cache: "no-store" })
          .then(function (r) { if (!r.ok) throw new Error("replay " + r.status); return r.json(); })
      : Promise.resolve(null);
    loading.then(function (run) {
      if (run) {
        if (run.game !== adapter.id) throw new Error("replay is for " + run.game);
        reseed(run.seed);
        Arcade.bench = run.bench || null;
        Arcade.run = run;
      }
      if (Arcade.agent) adapter.start();
      emit("start");
      if (run) return playReplay(run);
    }).catch(function (e) {
      console.error(e);
      document.documentElement.setAttribute("data-arcade-error", String(e.message || e));
    });
  };

  Arcade.onGameOver = function () { saveBest(); emit("over"); };
  Arcade.on = function (fn) { Arcade.listeners.push(fn); };

  // A strip at the top of a benchmark or agent page: seed, piece count, and the score to beat.
  // Hidden in the home-page embed. Casual play (no bench, no agent) gets no strip.
  function banner() {
    if (Arcade.embed || (!Arcade.agent && !Arcade.bench)) return;
    var playing = Arcade.agent && !Arcade.replaying;
    var bar = document.createElement("div");
    bar.id = "arcade-banner";
    bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483646;display:flex;gap:12px;align-items:center;" +
      "justify-content:center;flex-wrap:wrap;padding:6px 12px;font:600 11px/1.5 ui-monospace,Consolas,monospace;letter-spacing:.06em;" +
      (playing
        ? "color:#0a0a0b;background:#c8ff00;"
        : "color:#c8ff00;background:#0a0a0b;border-bottom:1px solid #2e2e35;");
    var text = document.createElement("span");
    var link = document.createElement("a");
    link.href = "/#scoreboard";
    link.textContent = "SCOREBOARD";
    link.style.cssText = "color:inherit;text-decoration:underline";
    bar.appendChild(text);
    bar.appendChild(link);
    var leader = null;
    var leaderState = Arcade.bench ? "loading" : "ready";
    function pieceNoun() {
      return Arcade.adapter && Arcade.adapter.id === "pill-drop" ? "pill" : "piece";
    }
    function contest() {
      var a = Arcade.adapter;
      var info = benchInfo();
      var obs = null;
      try { obs = a.observe(); } catch (e) { obs = null; }
      var bits = [];
      if (Arcade.replaying && Arcade.run) {
        var who = (Arcade.run.player && Arcade.run.player.name) || "unknown";
        bits.push("REPLAY " + who);
        bits.push("recorded " + Number(Arcade.run.score).toLocaleString("en-US"));
        bits.push("now " + a.score().toLocaleString("en-US"));
      } else if (playing) {
        bits.push("TURN-BASED");
      }
      if (info && info.label) bits.push(String(info.label).toUpperCase());
      else if (Arcade.bench) bits.push(Arcade.bench);
      if (Arcade.seeded) bits.push("seed " + Arcade.seed);
      if (info && info.pieces) {
        var n = obs && typeof obs.pieces === "number" ? obs.pieces : 0;
        var live = !!(obs && !a.over() && (obs.piece || obs.pill));
        var shown = live ? Math.min(info.pieces, n + 1) : Math.min(info.pieces, n);
        bits.push(pieceNoun() + " " + shown + "/" + info.pieces);
      }
      if (!Arcade.replaying && leader) {
        bits.push("beat " + Number(leader.score).toLocaleString("en-US") + " (" + (leader.player && leader.player.name || "leader") + ")");
      } else if (!Arcade.replaying && leaderState === "ready" && Arcade.bench) {
        bits.push("no verified run yet");
      }
      if (playing) {
        var placed = obs && typeof obs.pieces === "number" ? obs.pieces : 0;
        var done = info && info.pieces && placed >= info.pieces;
        bits.push(a.over() ? (done ? "sprint complete" : info && info.pieces ? "ended early" : "run over") : "score " + a.score().toLocaleString("en-US"));
      }
      // This browser's record, set by saveBest() just before the over event.
      if (a.over() && !Arcade.replaying && Arcade.bench) {
        if (Arcade.bestWritten) bits.push("new best");
        else if (Arcade.bestBefore) bits.push("your best " + fmt(Arcade.bestBefore.score));
      }
      return bits.join(" · ");
    }
    function render() {
      text.textContent = contest();
      if (leader && leader.player && leader.player.harness) text.title = leader.player.harness;
      if (bar.parentNode) document.body.style.paddingTop = bar.offsetHeight + 8 + "px";
    }
    render();
    Arcade.on(function (type) {
      render();
      if (type === "over" && playing && !bar.querySelector("button")) {
        var b = document.createElement("button");
        b.textContent = "DOWNLOAD RUN (JSON)";
        b.style.cssText = "font:inherit;color:#c8ff00;background:#0a0a0b;border:0;border-radius:999px;padding:3px 10px;cursor:pointer";
        b.onclick = function () {
          var run = record();
          run.player = { id: "your-handle", name: "Your name", kind: "human", model: null, harness: "played by hand, turn-based", notes: "" };
          run.date = new Date().toISOString().slice(0, 10);
          // A benchmark that declares disclosure: true needs the player to say how the run was played.
          var rules = benchInfo();
          if (rules && rules.disclosure) {
            var blind = false;
            try {
              blind = window.confirm("Was this run blind: text only, no source, no world data and no walkthrough?\n\nOK = blind. Cancel = open book.");
            } catch (e) { /* a blocked dialog counts as open book */ }
            run.player.disclosure = blind ? "blind" : "open-book";
          }
          var url = URL.createObjectURL(new Blob([JSON.stringify(run) + "\n"], { type: "application/json" }));
          var file = document.createElement("a");
          file.href = url;
          file.download = run.game + "-" + (run.bench || "free") + "-" + run.score + ".json";
          file.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        };
        bar.appendChild(b);
      }
    });
    setInterval(render, 300);
    if (Arcade.bench && Arcade.adapter) {
      fetch("/data/runs/index.json", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (data) {
          var runs = (data.runs || []).filter(function (r) {
            return r.game === Arcade.adapter.id && r.bench === Arcade.bench && r.seed === Arcade.seed;
          });
          // Ranked like the landing page: score, then the benchmark's tiebreak stat (lower wins) when both runs have it.
          var bench = (data.benchmarks || []).filter(function (b) { return b.game === Arcade.adapter.id && b.bench === Arcade.bench; })[0];
          var tiebreak = bench && bench.tiebreak;
          runs.sort(function (a, b) {
            if (b.score !== a.score) return b.score - a.score;
            var x = tiebreak && a.stats ? a.stats[tiebreak] : undefined, y = tiebreak && b.stats ? b.stats[tiebreak] : undefined;
            return typeof x === "number" && typeof y === "number" ? x - y : 0;
          });
          leader = runs[0] || null;
          Arcade.leader = leader;
          leaderState = "ready";
          render();
        })
        .catch(function () { leaderState = "error"; render(); });
    }
    document.body.appendChild(bar);
    document.body.style.paddingTop = bar.offsetHeight + 8 + "px";
  }
  Arcade.on(function (type) { if (type === "start") banner(); });

  async function playReplay(run) {
    var speed = Math.min(2000, Math.max(0, parseInt(params.get("speed") || "140", 10) || 0));
    await sleep(600);
    for (var i = 0; i < run.actions.length && !Arcade.adapter.over(); i++) {
      await perform(run.actions[i], speed);
      await sleep(speed);
    }
    document.documentElement.setAttribute("data-replay-done", String(Arcade.adapter.score()));
    if (Arcade.embed && params.get("loop") === "1") {
      await sleep(2500);
      location.reload();
    }
  }

  window.Arcade = Arcade;
})();
