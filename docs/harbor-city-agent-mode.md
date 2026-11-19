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
