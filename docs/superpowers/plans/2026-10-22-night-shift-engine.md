# Night Shift Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The engine side of Night Shift: a pure ES-module adventure engine, its parser, the `world.json` schema with a 3-room slice, the solver that proves the benchmark invariants, and a Node verifier for recorded runs.

**Architecture:** `engine.js` is a pure module (no DOM, no timers, injected randomness) that interprets a declarative `world.json` of rooms, objects, verbs and rules. The renderer and UI (owned by 4a) read `game.state()` and never write. The same engine file is imported by the browser page, by the Node solver that computes par and asserts the seed invariants, and by the Node verifier that replays runs in seconds.

**Tech Stack:** Vanilla ES modules, Node 22 (`node --test`), no dependencies. Browser replay stays in `tools/verify.mjs` (Playwright).

**Spec:** `docs/superpowers/specs/2026-10-22-night-shift-design.md`

## Global Constraints

- Open track, no build step: `games/night-shift/` is served as-is; relative imports only.
- `engine.js` and `parser.js` never touch `window`, `document`, `setTimeout` or `Math.random`.
- Benchmark `case-150`: seed 20261022, budget 150 commands. The run ends on the win or when the budget is spent.
- Unrecognised commands count as a turn, score nothing, and are logged (adapter returns ok: true).
- Deaths: the full death message, a fixed penalty of 5 points, rewind to the state before the fatal command, `deaths` stat +1. Never ends the run.
- Every benchmark seed: same `maxScore`, same set of scorable rule ids, same par. The solver asserts all three.
- Everything scorable is discoverable from text: the engine lists visible objects and exits in every room text; the solver checks that every object a rule needs is listed or revealed, and that every scoring topic appears in some text the player can read.
- Humans and agents see the same verb list: `state().verbs`, `observe().verbs`, and one `verbs:` line in `text()`.
- `text()` never includes the transcript.
- Stage files explicitly (`git add <paths>`), never `git add -A`; other sessions write into this tree.

## Review Focus

1. A noun that matches two visible objects ("key" when a locker key and a safe key are both present): the parser must ask "Which key?" rather than pick one, and that turn still counts. Test in Task 2.
2. A command that would both score and kill: the rewind must undo the score too. Test in Task 4.
3. Replaying a run whose seed differs from the benchmark seed, or whose `stats.maxScore` differs from the world's: the verifier must FAIL, not pass by coincidence. Test in Task 7.
4. The budget boundary: command 150 is applied and ends the run; command 151 is refused by the protocol (`over`). Test in Task 4.
5. The seeded parameter pick must consume `random()` in a fixed order so a replay reproduces it regardless of object insertion order. Test in Task 3.

---

### Task 1: `turnBased` adapters in `games/arcade.js`

**Files:**
- Modify: `games/arcade.js` (the `Arcade.register` function and the `arcade-agent` class line)

**Interfaces:**
- Produces: an adapter may set `turnBased: true`; the page is then always in agent mode (`act()`, `onKeyAction`, log, `mode: "turn"`, Download Run button) without `?agent=1`.

- [ ] **Step 1:** At the top of `Arcade.register`, before `Arcade.onKeyAction` is defined: `if (adapter.turnBased && !Arcade.agent) { Arcade.agent = true; document.documentElement.classList.add("arcade-agent"); }`. Add `turnBased` to the adapter comment at the top of the file.
- [ ] **Step 2:** Verify: `grep -n "turnBased" games/arcade.js` shows both places; `node --check` is not applicable (IIFE script), so open `games/block-drop/?seed=1&bench=sprint-40` logic unchanged: `grep -c "Arcade.agent" games/arcade.js` is unchanged except the new line.
- [ ] **Step 3:** Commit: `git add games/arcade.js && git commit -m "Let an adapter declare itself turn-based"`.

### Task 2: Parser

**Files:**
- Create: `games/night-shift/parser.js`
- Test: `tools/test/night-shift-parser.test.mjs`

**Interfaces:**
- Produces: `parse(text, verbs, nouns) -> {verb, object, target, topic, dir, error, word}`.
  - `verbs`: `[{verb, synonyms: [..], args: 0|1|2, preps: [..], usage}]`. A direction word (`north`, `n`, `up`, `out`, ...) parses to `{verb: "go", dir}` with or without a leading `go`/`walk`.
  - `nouns`: `[{id, nouns: [..]}]` for everything the player can refer to right now (visible objects, inventory, people, exits by name, topics).
  - `object`/`target` are resolved ids. `topic` is the raw topic phrase for `ask`. `error` is one of `"verb"`, `"noun"` (with `word`), `"ambiguous"` (with `word` and `ids`), `"missing"` (verb needs an object).
- Produces: `normalize(text) -> string`: lowercase, punctuation stripped, articles (`a`, `an`, `the`) removed, spaces collapsed.
- Produces: `DIRECTIONS`: map of direction synonyms to canonical dirs (`n`→`north`, `u`→`up`, `exit`/`leave`→`out`).

- [ ] **Step 1:** Write failing tests: `parses bare verb`, `parses verb synonym with object` ("pick up the mop" → take/mop), `parses two-argument verb with preposition` ("use key on door", "put token in cabinet"), `parses ask about` ("ask marge about the cabinet" → object marge, topic "cabinet"), `parses directions` ("n", "go north", "walk out"), `multi-word nouns` ("look at high score board"), `unknown verb error`, `unknown noun error carries the word`, `ambiguous noun error carries both ids`, `missing object error`.
- [ ] **Step 2:** Run `cd tools && node --test test/night-shift-parser.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `parser.js`. Verb match: longest synonym (by word count) that prefixes the normalized words. Two-argument verbs split the remainder at the first word in the verb's `preps`; a missing preposition with two noun phrases is `error: "missing"`. Noun resolution: longest matching noun phrase from `nouns`; several ids matching the same phrase is `"ambiguous"`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `git add games/night-shift/parser.js tools/test/night-shift-parser.test.mjs tools/package.json`.

### Task 3: Engine core: world loading, params, state, default verbs

**Files:**
- Create: `games/night-shift/engine.js`
- Test: `tools/test/night-shift-engine.test.mjs` (uses a small inline test world, not `world.json`)

**Interfaces:**
- Consumes: `parse`, `normalize` from Task 2.
- Produces: `createGame(world, {random, bench}) -> game`, `mulberry32(seed) -> () => number` (identical to `games/arcade.js`), `game.state()`, `game.command(text) -> {reply, events}`, `game.params` (the picked values, for tests and the solver), `game.snapshot()` / `game.restore(s)` (plain-object state, used by rewind and the solver).
- World schema (`world.json`):
  - `id`, `title`, `start` (room id), `deathPenalty` (5), `benchmarks: {"case-150": {label, budget}}`.
  - `params: {name: {choices: [..]}}`: picked in key order with `Math.floor(random() * choices.length)`. `${name}` in any string is replaced by the picked value; `{"param": "name"}` where an id is expected resolves to the picked value.
  - `verbs: [{verb, synonyms, args, preps, usage}]` (Task 2 shape).
  - `rooms: {id: {name, text, extra: [{require, text}], exits: [{dir, to, name, require, fail}], objects: [id], draw: [...]}}`. `draw` is ignored by the engine.
  - `objects: {id: {name, nouns, text, takeable, hidden, person, hotspot, topics: {topic: {reply, points, require, fail}}}}`. `hidden` objects are not listed until a rule `reveal`s them. `person: true` objects answer `ask`/`talk`.
  - `rules: [{id, when: {verb, object, target, topic, turn}, require, fail, do: [effect]}]`.
  - `require`: `{room, has: [id], flags: {name: bool}, param: {name: value}, visible: [id]}`; all listed must hold. `fail` is the reply when the rule matches `when` but not `require`.
  - Effects: `{reply}`, `{flag, value}`, `{score, id?}` (points; once per rule id), `{move: id, to: roomId | "inventory" | null}`, `{reveal: id}`, `{die: text}`, `{win: text}`, `{exit: {room, dir, to}}` (opens a new exit), `{text: {room|object, append}}`.
- `state()` is the seam from the spec. `room.text` is the room description plus `extra` lines whose `require` holds, then `You see: a mop, a key.` for visible non-hidden objects, then `Exits: north (the office door), east (the prize counter).`
- Default verbs (no rule needed): `look`, `look <object>`, `inventory`, `go <dir>` (and exits with `require`/`fail`), `take <object>` (takeable only), `drop <object>`, `ask <person> about <topic>` via `topics`, `talk <person>` (lists topics the person will talk about), `help` (the verb list with usage), `score`, `wait`. Every other verb with no matching rule replies `Nothing happens.`; unknown verb replies `I don't understand that.`; unknown noun `You don't see any <word> here.`; ambiguous `Which <word>: the locker key or the safe key?`

- [ ] **Step 1:** Write failing tests: `params are picked in key order from random`, `${param} substitution in room text`, `look lists visible objects and exits`, `hidden objects are not listed`, `go moves and emits moved`, `exit require blocks with fail text`, `take and drop update inventory and emit item events`, `inventory lists items`, `ask person about topic replies and scores once`, `talk lists topics`, `unknown verb and noun replies count as a turn`, `ambiguous noun asks which`, `text substitution of ${param} in object text`.
- [ ] **Step 2:** Run tests, expected FAIL.
- [ ] **Step 3:** Implement `engine.js` with the functions above. Keep the world immutable; all mutable state lives in the snapshot object `{room, flags, inv, placed, revealed, scored, score, turn, deaths, over, reason, reply, transcript}`.
- [ ] **Step 4:** Run tests, expected PASS.
- [ ] **Step 5:** Commit.

### Task 4: Rules, scoring, death rewind, win, budget, turn triggers

**Files:**
- Modify: `games/night-shift/engine.js`
- Test: `tools/test/night-shift-engine.test.mjs`

**Interfaces:**
- Produces: `command()` runs matching rules before default verbs. Events: `scored {points, id}`, `died {id, penalty}`, `rewound {}`, `over {reason: "win" | "budget"}`, `moved`, `item`, `said {npc, topic}`, `unknown {text}`.
- `maxScore` = sum of every `score` effect's points across rules and topics, each rule id counted once; the engine computes it and `state().maxScore` reports it.
- Rules with `when: {turn: true}` run after every command (turn timers); their `require` gates them and a `{flag}` effect makes them one-shot.

- [ ] **Step 1:** Write failing tests: `rule with require fails with fail text`, `rule effects apply and score once`, `score never exceeds maxScore and maxScore is the sum of rule points`, `death replies with the full message, costs 5, increments deaths, rewinds inventory and flags`, `death on a scoring command undoes the score`, `score cannot go below 0`, `win sets over with reason win`, `budget: command 150 applies and sets over with reason budget`, `command after over is refused (reply, no turn)`, `turn rule fires when its require holds and once only`, `reveal makes a hidden object visible and listed`, `exit effect opens a new exit`.
- [ ] **Step 2:** Run, expected FAIL.
- [ ] **Step 3:** Implement. Rewind: take `snapshot()` before the command; on a `die` effect, restore it, then apply `score = max(0, score - deathPenalty)`, `deaths += 1`, `turn` keeps the increment, the transcript gets the death message followed by the rewind line `...and then you are back where you were, a little wiser.` (exact copy).
- [ ] **Step 4:** Run, expected PASS.
- [ ] **Step 5:** Commit.

### Task 5: Arcade adapter and agent text

**Files:**
- Modify: `games/night-shift/engine.js`
- Test: `tools/test/night-shift-adapter.test.mjs`

**Interfaces:**
- Produces: `arcadeAdapter({world, random, bench, reset, onStart, onChange}) -> adapter` for `Arcade.register`. Fields: `id: world.id`, `turnBased: true`, `benchmarks: world.benchmarks`, `actions: {verb: usage}` plus directions, `start()` (calls `reset()` if given, creates the game with `random` and `bench()`, calls `onStart(game)`), `ready() -> true`, `over()`, `score()`, `stats() -> {maxScore, turns, deaths, won: 0|1}`, `observe() -> state() without transcript`, `text() -> string`, `apply(action) -> Promise<boolean>` (false only for an empty string or when no game exists; otherwise runs `command` and `onChange(events)`), `game` (the current game).
- `text()` format, exact:
  ```
  night-shift case-150 seed 20261022 turn 3/150
  score 5 of 100  deaths 0
  == Arcade floor ==
  <room.text, including the You see / Exits lines>
  inventory: a token
  verbs: look, take, drop, ... (help for usage)
  > look at board
  <reply>
  ```
  The `> cmd` and reply lines are the last command only; before any command the two lines are omitted.

- [ ] **Step 1:** Write failing tests: `start creates the game after reset`, `apply logs through command and calls onChange`, `apply of empty string returns false`, `text has the header, room, inventory, verbs and last reply`, `text has no transcript`, `observe has verbs and no transcript`, `stats report won after the win`, `mulberry32 matches the arcade.js generator for seed 20261022` (first three values hard-coded from running the arcade.js function).
- [ ] **Step 2:** Run, FAIL. **Step 3:** Implement. **Step 4:** Run, PASS. **Step 5:** Commit.

### Task 6: The 3-room slice in `world.json`

**Files:**
- Create: `games/night-shift/world.json`
- Test: `tools/test/night-shift-world.test.mjs`

**Interfaces:**
- Consumes: the schema from Task 3. `draw` lists and `hotspot` values are 4a's; leave `draw: []` and `hotspot: null` placeholders that 4a fills.
- Content (slice, 45 points; the rest of the 100 comes on days 2 and 3, so the slice's `win` is temporary and marked `"todo"`):
  - Rooms: `floor` (Arcade floor, start), `counter` (Prize counter), `office` (Back office; door locked).
  - Objects: `blockdrop` cabinet with `board` (high-score board), `token` (hidden under the cabinet), `mop`, `bucket`, `grille`, `ledger`, three `locker1..3` (the office key is in `${keyLocker}`), `officekey`, `officedoor`, `safe`, `photo` (combination `${combo}` on the back), `cord` (frayed; `pull cord` dies), `slush` (drinking it dies), `marge` (owner, in the office after it opens; person).
  - Params: `keyLocker: ["locker1","locker2","locker3"]`, `combo: ["1989","0451","2600"]`, `witness: ["driver","tech","regular"]` (the name Marge drops when asked about the cabinet).
  - Points: look at board 5; search/look under cabinet reveals token 5; insert token in cabinet (service mode shows the board was edited from the office key switch) 10; read ledger 5; unlock office door with the key 10; open safe with `${combo}` 10. Total 45; `win` fires on opening the safe with text ending `(To be continued: the slice ends here.)`
  - Deaths: pull cord (electrocution), drink slush.
- [ ] **Step 1:** Write failing tests that load `world.json` with `createGame` and play the intended path with seed 20261022, asserting the score after each scoring command, `deaths` after `pull cord`, and `over` with reason `win` at the end; and that the same path with the parameters swapped to a different seed scores identically.
- [ ] **Step 2:** Run, FAIL (file missing). **Step 3:** Write the world. All text is original. **Step 4:** Run, PASS. **Step 5:** Commit.

### Task 7: Solver, checker, verifier and REPL: `tools/night-shift.mjs`

**Files:**
- Create: `tools/night-shift.mjs`
- Test: `tools/test/night-shift-tool.test.mjs`
- Modify: `tools/package.json` (scripts `test`, `night-shift`), `data/benchmarks.json` (add `night-shift/case-150`, seed 20261022)

**Interfaces:**
- Produces, as exports and as subcommands:
  - `check(world, seeds) -> {ok, problems: [string], par, maxScore, scored: [id]}`: schema references resolve; sum of points equals `maxScore`; for every seed in `seeds` (default: the benchmark seed plus 1..4): solve, assert same `maxScore`, same sorted scored ids, same par; textual discoverability: every object a rule or topic needs is listed in a room or revealed by another rule or in the start inventory; every scoring topic word appears in some room, object, extra or topic reply text; every object with a hotspot is listed in its room.
  - `solve(world, seed) -> {par, actions: [string], scored: [id]} | null`: breadth-first search over snapshots (hash of room, flags, inv, placed, revealed, scored). Candidate commands per state: every exit dir, `take <obj>` for visible takeables, every rule whose `when` object/target is visible or held phrased from its `when` (`verb object [prep target]` using the verb's first prep), `ask <person> about <topic>` for every topic of a visible person. Commands that die are pruned. Goal: `over` with reason `win` and `score == maxScore`. Result `par = actions.length`.
  - `verify(runPath) -> {ok, problems}`: loads the run and `data/benchmarks.json`; seed must equal the benchmark seed; replays actions through `createGame` with `mulberry32(run.seed)`; compares `score`, every key in `run.stats`, `over`, and that every action was applied (count).
  - `play(seed)`: a readline REPL printing `adapter.text()` after each command, `quit` to exit, prints the run JSON at the end.
  - CLI: `node night-shift.mjs check | par | solve | verify <run.json...> | play [seed]`.
- [ ] **Step 1:** Write failing tests: `solve finds the slice path and par equals the hand-written path length` (par ≤ the Task 6 path), `check passes on world.json across 5 seeds`, `check reports a rule whose points make the sum differ from maxScore` (mutated world), `check reports a hidden object no rule reveals`, `verify passes on a run produced by replaying the solver's actions`, `verify fails when the recorded score is off by one`, `verify fails on the wrong seed`.
- [ ] **Step 2:** Run, FAIL. **Step 3:** Implement. **Step 4:** Run, PASS; also run `node night-shift.mjs check` and paste its output in the commit message body. **Step 5:** Commit (tool, tests, package.json, benchmarks.json).

### Task 8: Game README and index

**Files:**
- Create: `games/night-shift/README.md`
- Verify: `node tools/build-index.mjs` still runs (it reads benchmarks generically).

- [ ] **Step 1:** Write the README: what the game is, which model built which part (engine/parser/world/solver: Claude Fable 5.1, session c1; renderer/UI: Claude, session 4a), no build step and the folder is the source, size of the folder (`du -sh`), how to run the tests, the solver and the verifier, the benchmark and its par, and the disclosure categories.
- [ ] **Step 2:** `cd tools && npm test && node build-index.mjs && git status --short` shows only intended files.
- [ ] **Step 3:** Commit, then post in the hub room that the engine has landed, with the par and the command to run the REPL.
