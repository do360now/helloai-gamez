# Jackcity: Harbor City Havoc: agent mode

Status (2026-11-27): `games/harbor-city/` is **agent-ready**. Humans play the page as before, in real time with the
keyboard. With `?agent=1` the same page is turn-based and exposes `window.arcade` (protocol arcade/0.1, see
`agents.md`). The benchmark is `harbor-city/city-240`, seed 20261022, `agentOnly: true`. It is listed on the landing card
(`agent: true`), in `llms.txt` and in `agents.md`.

Spec and plan: `docs/superpowers/specs/2026-11-26-harbor-city-agent-mode-design.md`,
`docs/superpowers/plans/2026-11-26-harbor-city-agent-mode.md`. The approach and the order of the later upgrades were
discussed in hub room `harbor-city-upgrades-2026-11-27`.

## What was built

- **Seeded RNG:** the 18 gameplay `Math.random()` calls (traffic, pedestrians, police, spawns) use `Arcade.random()`.
  Cosmetic ones (smoke, sparks, dust, sprite phase) stay on `Math.random()`.
- **Fixed step:** `simStep(dt)` was lifted out of `frame()`. Without `?agent=1` the frame loop runs it every frame,
  exactly as in v10. With `?agent=1` the frame loop only draws, and the world moves inside `arcade.act()`. Each unit
  is 0.25 s, made of 5 steps of 0.05 s. Humans at 60 fps step about 0.017 s, so agent driving is integrated more
  coarsely. That is a documented choice, not a bug. Keyboard, mouse, audio and the best score are off in agent mode.
- **`window.arcade`:** the actions are `up|down|left|right` (combined with `+`, plus `handbrake`) `[n]`, `wait [n]`,
  `enter`, `punch` and `respawn`, where `n` is 1 to 40 units. `observe().text` is a 31 x 19 tile map plus status,
  mission, payphones and the nearby cars, police and pedestrians. `stats()` is `{ seconds, missions, chancesUsed }`.
  The run ends at 240 s (TIME UP) or on the third bust or wipeout (GAME OVER).
- **Test hook:** in agent mode only, `window.__harbor.stateHash()` fingerprints the whole city: cars, peds, police,
  officers, props, the player, the missions, the wanted level and the clock.
- **Baselines** (`tools/agents/`): `harbor-random` scored 210 (0 missions). `harbor-seeker` scored 1840 (2 missions;
  it spends its 3 chances by 65 s). Both are recorded under `data/runs/harbor-city/city-240/`.

## Checks

```
cd tools && node harbor/check.mjs        # 19 checks, about 15 s
cd tools && npm test
python3 -m http.server 8799 --bind 127.0.0.1   # from the repo root, then:
cd tools && node verify.mjs --base http://127.0.0.1:8799
```

`check.mjs` covers:
- human play (no parameters, and `?bench=` without the agent flag)
- refused actions, the unit and the text map
- whole-city hashes every 20 s that must not change when you:
  - repeat the same script,
  - replace `Math.random` in two different ways,
  - run at 800x600 or 1920x1080
- both endings
- a speed-0 replay

Every later upgrade (touch, night, rain, …) must keep this gate green. A cosmetic change must give identical hashes.

**Rule:** `city-240` is published, so any change to gameplay (traffic, missions, damage, grip, spawning) needs a new
benchmark id and new baselines. Recorded runs must keep replaying.

## Versions

`v1.html` to `v8.html` are Gemini's work in progress. `v9.html` is Claude's graphics-only touch-up of v8, and
`v10.html` rebrands it as Jackcity: Harbor City Havoc. `v11.html` is v10 plus agent mode. `index.html` is v11 plus the
shared visitor counter (`../views.js`).

## History

- 2026-11-19: human-only at launch. A first agent-mode copy was made in a separate folder, `games/harbor-city-agent/`.
- 2026-11-20: that copy was taken off the site. Its code is at commit 8d69abf.
- 2026-11-27: the 8d69abf work was ported into the game's own page behind `?agent=1`, the same pattern as Rustwater
  Havoc (`docs/rustwater-havoc-plan.md`, session 6). The whole-city hash gate was added, and the benchmark was listed.

Deploy note: `data/runs/index.json` was rebuilt with `node tools/build-index.mjs`. Run that again after any change to
`data/benchmarks.json` or to the runs, before `./deploy.sh`.
