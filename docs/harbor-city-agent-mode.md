# Jackcity: Harbor City Havoc: not agent-playable yet (look into this)

Status (2026-11-19): `games/harbor-city/` is **human-only**. It is listed on the landing page with
`agent: false` (no "Agent-ready" chip, "agent mode soon" in the card footer), and in `llms.txt` and
`agents.md` as not agent-ready. It has no benchmark in `data/benchmarks.json`.

**Future work:** if an LLM or agent (for example Claude, ChatGPT, Gemini, or a Grok bot) cannot play
it, look into making it playable for them, then flip `agent: true` on its landing card.

## Why agents can't play it today

- It does not load `games/arcade.js` and exposes no `window.arcade` (`observe`, `act`, `info`), so
  there is no text board and no action list.
- It is real time: traffic, police and timers run on `requestAnimationFrame`, so there is no
  `?agent=1` turn-based mode where the world waits for the model.
- Randomness uses `Math.random()` (traffic turns, ped spawns, respawn points), so there is no fixed
  seed and a run cannot be replayed or verified.
- The only input is the keyboard (WASD, E, Space, P, M, R, Enter).

## What making it agent-ready would take

1. A seeded RNG (replace `Math.random()` in game logic) so `?seed=` gives the same city every time.
2. A fixed-step mode for `?agent=1`: each `act()` advances the simulation by a fixed number of ticks
   (for example 0.25 s), then pauses until the next action.
3. `window.arcade` per agents.md: `observe()` returning a text view (nearby tiles, cars, cops,
   wanted level, mission, score, health, lives) and actions such as `up/down/left/right`, `enter`,
   `attack`, `handbrake`, `wait`.
4. A recorder and replay for `data/runs/harbor-city/<bench>/`, plus a benchmark entry (for example a
   fixed-length "score in N ticks" or "finish the 3 payphone missions").

Keep gameplay identical to v9 for human play; agent mode should only change pacing and input.

## Versions

`v1.html` to `v8.html` are Gemini's work in progress; `v9.html` is a graphics-only touch-up of v8 by
Claude (same gameplay); `v10.html` rebrands it as Jackcity: Harbor City Havoc (title text only).
`index.html` is v10 plus the shared visitor counter (`../views.js`).

## Status 2026-11-19: steps 1 to 3 built, in a separate page

`games/harbor-city-agent/index.html` is a copy of `games/harbor-city/index.html` (v10 + views.js) with agent
mode; `games/harbor-city/` is untouched. It is a separate folder because `tools/verify.mjs` replays a run at
`/games/<game>/?replay=...`, so the game id has to be a folder of its own.

- **Seeded RNG:** the 18 gameplay `Math.random()` calls (traffic, pedestrians, police, spawns) use
  `Arcade.random()`. Cosmetic ones (smoke, sparks, sprite phase) stay on `Math.random()`.
- **Fixed step:** `simStep(dt)` was lifted out of `frame()`. With `?agent=1` the frame loop only draws; the
  world moves in `arcade.act()`, 5 steps of 0.05 s per unit (0.25 s). Keyboard and mouse are ignored.
- **`window.arcade`:** actions `up|down|left|right|up+left|...|handbrake [n]`, `wait [n]`, `enter`, `punch`,
  `respawn` (n = units, max 40). `observe().text` is a 31 x 19 tile map plus status, mission, payphones and
  nearby cars, police and pedestrians as dx/dy tiles. Bench `city-240`: 240 s of game time, or 3 busts/wipeouts.
- **Checked:** same seed and actions give the same state; a 337-action random run replayed through
  `tools/verify.mjs` with the same score (170); `npm test` passes.

Not done: step 4's baseline agent and a recorded run, the landing card, `llms.txt`/`agents.md`, and the
index rebuild (`node tools/build-index.mjs`, needed before `deploy.sh` after the `benchmarks.json` change).
Human real-time play on this page is not supported (the keyboard is off in agent mode).

Update 2026-11-25: Rustwater Havoc (`games/rustwater-havoc/`) got the same agent mode, built in the game's own page behind `?agent=1`
(see `docs/rustwater-havoc-plan.md`, session 6); Harbor City is still human-only.

Update 2026-11-20: the `games/harbor-city-agent/` page and its `city-240` benchmark entry were taken off the site
(not ready to publish). The code is in git history at commit 8d69abf (`git show 8d69abf:games/harbor-city-agent/index.html`).
