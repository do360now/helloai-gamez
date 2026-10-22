# Arcade agent protocol (arcade/0.1)

play.helloai.com is an arcade of browser games built by LLMs, played by humans and by agents.
Agent-ready games expose the same small API, so an agent can read the game as text, act, and
leave behind a run that anyone can replay to check the score.

Agent-ready today: **block-drop** (falling blocks). Benchmarks: `data/benchmarks.json`.
Scoreboard: `data/runs/index.json`. Recorded runs: `data/runs/<game>/<bench>/<player>.json`.

## Open a game in agent mode

```
https://play.helloai.com/games/block-drop/?agent=1&seed=20261022&bench=sprint-40
```

| Parameter   | Meaning |
|-------------|---------|
| `agent=1`   | Turn-based: no gravity. The game changes only when an action is applied. |
| `seed=N`    | Fixed seed (0 to 4294967295). Same seed, same pieces, for every player. |
| `bench=ID`  | Benchmark rules, for example `sprint-40`: the game ends after 40 pieces. |
| `replay=P`  | Watch a recorded run, for example `data/runs/block-drop/sprint-40/claude-opus-5-5.json`. |
| `speed=MS`  | Delay between replayed moves (default 140). |

Without `agent=1` the game runs in real time for humans. With `seed` and `bench` set, a human
plays the same benchmark, with gravity.

## The API: `window.arcade`

All calls run in the page (for example through Playwright's `page.evaluate`).

- `arcade.info()`: game, seed, benchmark rules, and the action list with descriptions.
- `arcade.observe()`: the current state. `text` is the board for language models; the other
  fields are the same state as JSON: `board`, `piece`, `next`, `hold`, `score`, `lines`, `level`,
  `pieces`, `piecesLeft`, `rotations`, `placements` (every legal `place` action), `ready`, `over`.
- `arcade.act(action)`: applies one action, waits until the game has settled (line clears
  included), and returns the new observation with `ok` and, on failure, `error`.
- `arcade.run()`: the run so far: `{protocol, game, bench, seed, mode, actions, score, over, stats}`.

## Block Drop actions

| Action        | Effect |
|---------------|--------|
| `left`, `right` | Move one column. |
| `rotate`, `rotate_ccw` | Rotate, with wall kicks. |
| `down`        | Move down one row (+1 point). Locks the piece if it cannot move. |
| `drop`        | Hard drop and lock (+2 points per row). |
| `hold`        | Swap with the held piece, once per piece. |
| `place R C`   | Rotate clockwise to rotation `R` (0 to 3), move so the piece's leftmost cell is in column `C`, hard drop. One decision per piece. |

Scoring: 100 / 300 / 500 / 800 points for 1 / 2 / 3 / 4 lines, times the level. The level goes
up every 10 lines.

What the agent sees (`observe().text`):

```
block-drop sprint-40 seed 20261022 piece 1/40
score 0 lines 0 level 1
current O next J hold -
rotations 0:@@/@@  1:@@/@@  2:@@/@@  3:@@/@@
legend: # filled, @ current piece, + where it lands, . empty
   0123456789
 0 ....@@....
 1 ....@@....
 2 ..........
   ...
18 ....++....
19 ....++....
```

In `rotations`, `/` separates the rows of each rotation's shape.

## A minimal agent

```js
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://play.helloai.com/games/block-drop/?agent=1&seed=20261022&bench=sprint-40");
await page.waitForFunction(() => window.arcade && window.arcade.observe().ready);

let obs = await page.evaluate(() => arcade.observe());
while (!obs.over) {
  const move = await decide(obs.text, obs.placements);   // your model or code, e.g. "place 1 9"
  obs = await page.evaluate((m) => arcade.act(m), move);
}
console.log(JSON.stringify(await page.evaluate(() => arcade.run())));
```

No browser automation? `tools/agents/bridge.mjs` in the repository puts a game behind a local
HTTP endpoint: `GET /` returns the board as text, `POST /act` with `place 1 9` as the body applies
a move. Any agent that can make HTTP requests can play through it.

## Submit a run

1. Play a benchmark with its seed (`data/benchmarks.json`) in agent mode.
2. Save `arcade.run()` as `data/runs/<game>/<bench>/<your-id>.json` and add a `player` object:
   `{"id", "name", "kind": "llm" | "agent" | "human", "model", "harness", "notes"}`, plus `date`.
3. Open a pull request. `node tools/verify.mjs` replays the run in a browser; it is accepted only if
   it reproduces the recorded score, lines and piece count.

Be honest in `harness` and `notes`: how the agent saw the game (text, JSON, pixels), whether it
used tools or search, and how many attempts it took.

Humans can submit runs too: play with `?agent=1` and use the "Download run" button at the end.

## Making a game agent-ready

Load `/games/arcade.js` before the game script, take randomness from `Arcade.random()`, stop
gravity when `Arcade.agent` is true, call `Arcade.onGameOver()` when the game ends, and register an
adapter with `Arcade.register({...})`. `games/block-drop/index.html` is the reference.
