# Harbor City Havoc: agent mode (design)

Written 2026-11-26. Status: approved by the user on 2026-11-27, with the hub panel's additions below (room `harbor-city-upgrades-2026-11-27`).

## Intent

Make `games/harbor-city/` playable by agents and LLMs, the same way Rustwater Havoc already is. Then list it
as agent-ready. This comes first, before any upgrades to the look or the gameplay, which may come later.

## Goals

- `?agent=1` on the game's own page gives a turn-based world, with `window.arcade` (`observe`, `act`, `info`)
  as described in `agents.md`.
- `?seed=` with the same actions gives the same run, and `tools/verify.mjs` can replay a recorded run at
  `/games/harbor-city/`.
- A benchmark, `harbor-city/city-240`, with two recorded baseline runs (a seeker and a random agent).
- Listed as agent-ready: the landing card set to `agent: true`, and entries in `llms.txt` and `agents.md`.

## Non-goals

- No new missions, graphics, sound, touch controls, night or weather.
- No human play of the benchmark (`agentOnly: true`, like `rust-240`).

## Anti-goals

- Human play without `?agent=1` must not change. The keyboard, pacing, best score and the feel of the game
  stay as they are in v10.

## Approaches

- **A (picked by the user): fold it into the game's own page behind `?agent=1`.** This is the Rustwater
  pattern: one copy of the game, the replay path works, and later upgrades are made once.
- B: restore the separate `games/harbor-city-agent/` folder from 8d69abf. Rejected because it means two
  copies of a 4,600-line game that would drift apart.

## How it gets built

- **Source:** port the WIP from commit 8d69abf (`git show 8d69abf:games/harbor-city-agent/index.html`). It
  differs from today's `index.html` by about 360 lines:
  - it loads `../arcade.js`
  - 18 gameplay `Math.random()` calls become `Arcade.random()` (cosmetic ones stay)
  - `simStep(dt)` is lifted out of `frame()`
  - `Arcade.agent` guards on input and on the best score
  - an AGENT MODE block with actions, a 31 x 19 text map, a 240 s limit and a TIME UP overlay
- **Version record:** the result is saved as `v11.html` (v10 + agent mode), and `index.html` = v11 +
  `../views.js`, following the existing convention. The page title stays the same; the "(agent mode)" suffix
  from the WIP is dropped.
- **Benchmark:** `harbor-city/city-240`, seed 20261022. The rules text is based on the WIP entry, and it gets
  `agentOnly: true`. The game id is `harbor-city`, not `harbor-city-agent`.
- **Baselines:** `tools/agents/harbor-seeker.mjs` and `tools/agents/harbor-random.mjs`, modelled on the
  Rustwater pair. They are wired into `tools/agents/run.mjs` the same way, and their runs are recorded into
  `data/runs/harbor-city/city-240/`. Then run `node tools/build-index.mjs`.
- **Listing:** the landing card (`index.html`, about line 562) gets `agent: true` and an updated description,
  plus any series-strip text that says human-only. Also update `llms.txt` line 18, the `agents.md`
  "not agent-ready" line plus a Harbor City section like Rustwater's, and `games/prompt.js` if Rustwater
  needed an entry there.
- **Docs:** update `docs/harbor-city-agent-mode.md` (status: done), and the memory notes.

## Checks before shipping

- Human page with no parameters, in headless Chromium: it starts, keys drive the car, and there are no
  console errors.
- The same seed and the same actions give the same state twice.
- Added by the hub panel: a whole-city `stateHash()` (agent mode only), compared every 20 s of game time. It must not
  change when the script is repeated, when `Math.random` is replaced in two different ways, or at 800x600 versus
  1920x1080. This is the standing gate for every later upgrade.
- Agent step: keep 0.05 s (5 steps per 0.25 s unit) and document it. Once `city-240` is published, any gameplay change
  needs a new benchmark id.
- `node tools/verify.mjs --base http://127.0.0.1:8799` passes on the recorded baseline runs. CI is broken
  (billing), so this is the only replay check.
- `npm test` passes.

## Process

- Work on a branch, `harbor-city`. Stage files by name.
- Do not commit, merge, deploy or push until the user says so.
- Serve with `python3 -m http.server 8799 --bind 127.0.0.1`, because ports 8770 to 8783 are taken.

## Left to the builder

- The seeker's strategy. The default is: walk to a car, then do the payphone missions in order, with a
  shortest path over the text map.
- The exact wording of the rules text and of the card.
- Whether `observe()` needs any fields beyond the WIP's, which can be found by watching the seeker play.
