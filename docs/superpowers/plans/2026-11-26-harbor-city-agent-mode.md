# Harbor City Havoc agent mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `games/harbor-city/?agent=1` is a turn-based, seeded, replayable game with `window.arcade` and a
`city-240` benchmark, and it is listed as agent-ready.

**Architecture:** Port the agent-mode WIP from commit 8d69abf into the game's own page. It uses the shared
`games/arcade.js`, switches `Arcade.random()` in for gameplay randomness, lifts out `simStep(dt)`, and adds an
AGENT MODE block at the end of the IIFE. Human play without `?agent=1` keeps the real-time loop. The
baselines and the listing follow Rustwater's part 6c (commit a342676).

**Tech Stack:** a single-file HTML5 canvas game, `games/arcade.js` (protocol arcade/0.1), Node + Playwright
1.48 in `tools/`.

**Spec:** `docs/superpowers/specs/2026-11-26-harbor-city-agent-mode-design.md`

## Global Constraints

- Game id `harbor-city`, bench `city-240`, seed `20261022`, `agentOnly: true`, 240 s of game time; three busts or wipeouts end the run early.
- One unit = 0.25 s = 5 sim steps of 0.05 s; `n` is 1 to 40.
- Human play without `?agent=1` must not change (keyboard, pacing, best score, feel of v10).
- `v11.html` = v10 + agent mode; `index.html` = v11 + `<script src="../views.js" defer></script>`. The page title stays `Jackcity: Harbor City Havoc`.
- Work on branch `harbor-city`. Stage files by name, never `git add -A`. No commit, merge, deploy or push until the user says so.
- Serve on port 8799 (8770 to 8783 are held by strays). The Rustwater harness `tools/rustwater/lib.mjs` `serve({ hooks: false })` already serves the repo on 8799.
- Cosmetic randomness (smoke, sparks, sprite phase) stays on `Math.random()`.

## Review Focus

- **No parameters (human play):** the game starts, WASD/E drive a car, the best score is still saved, there is no arcade banner and no console errors. (Task 1, check `human`.)
- **`?bench=city-240` without `?agent=1`:** it plays in real time as normal and does not freeze. (Task 1, check `bench-human`.)
- **Bad actions:** `up 41`, `up+down`, `enter 2`, `fly` and an empty string come back `ok: false`, and the world does not move (`seconds` unchanged). (Task 1, check `reject`.)
- **Ending early on chances:** a run that loses all 3 chances ends with `over: true` before 240 s, and the overlay is GAME OVER, not TIME UP. Any action after the end is refused. (Task 1, check `end`.)
- **Replay:** a recorded run replayed with `?replay=...&speed=0` gives the same score, stats and action count. (Task 1, check `replay`; Task 2 runs `tools/verify.mjs` on the real baselines.)

---

### Task 1: Agent mode in the game page, with its check script

**Files:**
- Modify: `games/harbor-city/index.html` (port the diff `games/harbor-city/index.html` → `git show 8d69abf:games/harbor-city-agent/index.html`)
- Create: `games/harbor-city/v11.html` (= the new `index.html` without the `../views.js` line)
- Create: `tools/harbor/check.mjs`

**Interfaces:**
- Consumes: `serve`, `launch`, `watchErrors` from `tools/rustwater/lib.mjs`.
- Produces: `window.arcade` with adapter id `'harbor-city'`, the actions `up|down|left|right` (combined with `+`, and `handbrake`) `[n]`, `wait [n]`, `enter`, `punch`, `respawn`. It also produces `observe()` fields as in the WIP (`seconds`, `secondsLeft`, `status`, `at{x,y}`, `inCar`, `car`, `facing`, `health`, `chancesLeft`, `wanted`, `missionsDone`, `mission{number,secondsLeft,goal,marker{dx,dy,dist},mayhem,hiddenSeconds}`, `nextMission`, `payphones[{name,dx,dy,dist}]`, `can{enterCar,exitCar,usePayphone,respawn}`, `world{cars,police,officers,peds}`) plus the arcade fields (`ready`, `over`, `text`, `report`). `stats()` = `{ seconds, missions, chancesUsed }`.

- [ ] **Step 1: Branch.** `git checkout -b harbor-city`. Expect `git branch --show-current` to print `harbor-city`.
- [ ] **Step 2: Write `tools/harbor/check.mjs`** with numbered `ok(name, cond, extra)` lines and exit code 1 on any FAIL, modelled on `tools/rustwater/agent.mjs`. Checks:
  - `human`: open `/games/harbor-city/` with no parameters. Press Enter to start, then hold W for 1 s. The player position changes; `#arcade-banner` is absent; there are no page errors.
  - `bench-human`: open with `?bench=city-240` and no agent. After pressing Enter and waiting 1 s, the game is still running in real time (the position changes when W is held).
  - `info`: with `?agent=1&seed=20261022&bench=city-240`, `arcade.info()` has at least 8 actions and `benchmark.seconds === 240`.
  - `still`: with no action taken, two `observe()` calls 500 ms apart have the same `seconds` (0) and the same `at`.
  - `reject`: each of `['up 41','up+down','enter 2','fly','']` gives `ok === false` and `seconds` unchanged.
  - `unit`: `wait 4` moves `seconds` from s to s + 1.
  - `determinism`: the same fixed 60-action script in two fresh pages (same seed) ends with the same `JSON.stringify(observe())` minus `text`, and the same `arcade.run().score`.
  - `end`: a script that drives into police heat until `chancesLeft` hits 0 (or loops `wait 40` until 240 s) ends with `over === true`. A following `wait 1` gives `ok === false`. If it ended on chances, `seconds < 240`.
  - `text`: `observe().text` stays under 3000 chars, starts with `harbor-city city-240 seed 20261022`, and contains `payphones:`.
  - `replay`: write the determinism run to `data/runs/harbor-city/city-240/zz-check.json`, open `?replay=data/runs/harbor-city/city-240/zz-check.json&speed=0`, and wait for `data-replay-done`. The score, stats and action count must match. Remove the file in `finally`.
- [ ] **Step 3: Run it, and expect it to fail.** `cd tools && node harbor/check.mjs`. `human` passes; `info` fails (no `window.arcade`).
- [ ] **Step 4: Port the WIP into `index.html`.** Apply the 8d69abf diff, with two changes: the title stays `Jackcity: Harbor City Havoc`, and the adapter id and the first text line use `harbor-city` instead of `harbor-city-agent`. Keep the WIP's `rules` text for `city-240`.
- [ ] **Step 5: Run the check, and expect all `ok`.** `cd tools && node harbor/check.mjs` prints every line as `ok` and an empty `ERRORS` line.
- [ ] **Step 6: Version file.** `v11.html` = `index.html` minus the `../views.js` line. Check with `diff games/harbor-city/index.html games/harbor-city/v11.html`, which should show only that line.
- [ ] **Step 7: Existing tests.** `cd tools && npm test` passes.
- [ ] **Step 8: Commit (only once the user allows commits).** `git add games/harbor-city/index.html games/harbor-city/v11.html tools/harbor/check.mjs`, message `harbor-city: agent mode part 1 (seeded RNG, simStep, window.arcade behind ?agent=1, check script)`.

### Task 2: Benchmark and baselines

**Files:**
- Modify: `data/benchmarks.json` (append the entry after `rustwater-havoc/rust-240`)
- Create: `tools/agents/harbor-random.mjs`, `tools/agents/harbor-seeker.mjs`
- Modify: `tools/agents/run.mjs:3,19` (the agent list in the header comment and in the usage line)
- Create: `data/runs/harbor-city/city-240/baseline-random.json`, `baseline-seeker.json` (written by run.mjs)
- Modify: `data/runs/index.json` (regenerated)

**Interfaces:**
- Consumes: Task 1's `observe()` fields and action names.
- Produces: the benchmark id `harbor-city/city-240`; each agent module exports `player` and `choose(obs)`, the same shape as `tools/agents/rustwater-random.mjs`.

- [ ] **Step 1: Benchmark entry.** `{ id: "harbor-city/city-240", game: "harbor-city", bench: "city-240", seed: 20261022, title: "Harbor City Havoc: 240 s", rules: <the WIP rules sentence, plus "Agents play turn-based: the world waits between actions, and each action holds its keys for 1 to 40 steps of 0.25 s. Humans cannot play the benchmark yet.">, agentOnly: true }`.
- [ ] **Step 2: `harbor-random.mjs`.** `player.id` is `baseline-random`, with a seeded LCG as in `rustwater-random.mjs`. It returns `respawn` when `obs.can.respawn`; otherwise it picks from `["up 4","up 6","up+left 2","up+right 2","down 2","handbrake 1","up+left+handbrake 3","wait 2","enter","left 2","right 2","punch"]`.
- [ ] **Step 3: `harbor-seeker.mjs`.** `player.id` is `baseline-seeker`, name `Payphone seeker`. It reads only `observe()` and does the missions in order:
  - Walk to the nearest phone in `obs.payphones` and `enter` when `can.usePayphone` is true.
  - M1: get into a car (`can.enterCar`, nearest `world.cars` that isn't a wreck) and drive to `mission.marker`, with a shortest path over the parsed text map. Road and sidewalk can be crossed; `#` and `~` cannot. When the marker is outside the 31 × 19 window, aim at the window edge nearest to it.
  - M2: drive and `punch` near peds for mayhem.
  - M3: reach 2 stars, then drive away from `world.police`.
  - Respawn when `can.respawn` is true.
  - The details are the builder's call. The bar to meet: its score beats the random baseline's, and it finishes at least 1 mission. If it can't, report that and don't fake it.
- [ ] **Step 4: Wire into run.mjs.** Add `harbor-random and harbor-seeker (harbor-city/city-240)` to the header comment and to the usage list.
- [ ] **Step 5: Record the runs.** Serve the repo: `python3 -m http.server 8799 --bind 127.0.0.1` from the repo root. Then run `cd tools && node agents/run.mjs harbor-random harbor-city/city-240 --base http://127.0.0.1:8799` and the same command with `harbor-seeker`. Each prints `score N, {...} -> ../data/runs/harbor-city/city-240/<id>.json`. Check that the seeker's score is higher than the random one and that its `stats.missions >= 1`.
- [ ] **Step 6: Verify the replays.** `cd tools && node verify.mjs --base http://127.0.0.1:8799` reports both harbor-city runs as verified, with no failures for other games.
- [ ] **Step 7: Rebuild the index.** `cd tools && node build-index.mjs`; `data/runs/index.json` should now contain `harbor-city/city-240` with 2 rows.
- [ ] **Step 8: Commit (only once the user allows commits).** Stage the files above by name; message `harbor-city: agent mode part 2 (city-240 benchmark, seeker and random baselines)`.

### Task 3: Listing and docs

**Files:**
- Modify: `index.html:561-564` (the landing card), `index.html:~584` (`STAT`), and any series-strip text that says Harbor City is human-only (`grep -n -i "human-only\|agent mode soon" index.html`)
- Modify: `llms.txt:18`, `agents.md:9-11` and the per-game section (model it on the Rustwater section around `agents.md:204`), `agents.md:~21` (the benchmark link list), `games/prompt.js` (add a `"harbor-city"` entry next to `"rustwater-havoc"`), `README.md` if it lists agent-ready games (`grep -n -i harbor README.md`)
- Modify: `docs/harbor-city-agent-mode.md`, the memory note `harbor-city-human-only.md` plus its `MEMORY.md` line
- Test: `tools/test/prompt.test.mjs` (existing)

**Interfaces:**
- Consumes: the benchmark id and the baseline ids from Task 2.

- [ ] **Step 1: Landing card.** Change it to `agent: true, bench: "city-240", agentOnly: true`. Rewrite the comment above it in the Rustwater style. The `desc` mentions the agents' 31 × 19 text map and the 240 s benchmark. Add `"harbor-city": { label: "Missions", key: "missions", unit: "missions" }` to `STAT`.
- [ ] **Step 2: Text listings.**
  - `llms.txt` line 18: say it is agent-ready, with a `?agent=1&seed=20261022&bench=city-240` link.
  - `agents.md`: drop the "Not agent-ready yet" sentence, add harbor-city to the list of games and benchmarks, add the benchmark link, and add a short Harbor City section with the actions, the units, the `run.mjs harbor-seeker` / `harbor-random` commands and `&view=1` if the game supports it.
  - `games/prompt.js`: `act: 'arcade.act("up+left 2") (hold gas and left for 2 units of 0.25 s; also wait, handbrake, enter, punch, respawn)'`, `decision: "one move per call, 1 to 40 units of 0.25 s, 240 s of game time in all"`, `extra: ""`.
- [ ] **Step 3: Tests and a page check.** `cd tools && npm test` passes. Open `http://127.0.0.1:8799/` in Playwright: the Harbor City card shows the Agent-ready chip, its benchmark has 2 baseline rows, and there are no console errors.
- [ ] **Step 4: Docs and memory.**
  - `docs/harbor-city-agent-mode.md`: update the title and status to agent-ready, saying what was built, where, the check commands, and that the version is v11.
  - Rewrite the memory note `harbor-city-human-only` (rename it to `harbor-city`, and update its `MEMORY.md` line).
  - Note that `deploy.sh` must run after `build-index.mjs`.
- [ ] **Step 5: Commit (only once the user allows commits).** Stage the files by name; message `harbor-city: agent mode part 3 (landing, llms.txt, agents.md, prompt, docs)`.
- [ ] **Step 6: Hand back to the user.** Report the check output, the two baseline scores and the verify result. Ask before merging to `main`, running `./deploy.sh` (it refuses untracked files, so the spec and plan docs must be committed or stashed first) and pushing.
