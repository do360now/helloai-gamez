# Rustwater Havoc: plan for the remaining upgrades

Written 2026-11-23, after the river pass (commit 76fed7a). Each **session** below is sized to fit in one
fresh Claude Code session. A session starts cold, reads only this file, the game's README and the
code anchors it lists, does the work, then ships it. Do the sessions in order: later ones build on
earlier ones. Agent mode (session 6) is last, because it freezes the rules.

| # | Session | Status |
|---|---------|--------|
| 1 | Night (and the shadow-pass cost) | done (see git log, merged 2026-11-24) |
| 2 | Weather | done (commit ceab9c5, merged and deployed 2026-11-24) |
| 3 | Cars and sound: damage, skid marks, engine voices, radio | built 2026-11-24 on branch rustwater-havoc, not committed or merged yet (touch point steering not done) |
| 4 | Busier streets: traffic lights, people waiting, buses and trucks | not started |
| 5 | More jobs: taxi fares, bridge race, cars for Sal | not started |
| 6 | Agent mode | not started |

At the end of a session, set its row to `done (commit abc1234)` and add notes under the session for
anything the next one needs to know.

## How to run a session

1. **Start.** Read this file, `games/rustwater-havoc/README.md`, and the memory note `rustwater-havoc`.
   - Then run `git checkout rustwater-havoc && git merge --ff-only main`.
   - Check `git branch --show-current` before every commit. On 2026-11-23 a commit landed on `main` by
     mistake.
2. **Don't read `index.html` whole.** It is about 2,900 lines in one module script.
   - Use `grep -n` for the anchors each session lists, then read about 40 lines around each one.
   - The section headers are `// =====` blocks and `// ---------- Name` lines. Find them with
     `grep -n "^// ----------\|^// [A-Z]" games/rustwater-havoc/index.html`.
3. **Test tools** live in `tools/rustwater/`. Run them from the repo root. They use headless Chromium
   with SwiftShader, which runs at about 1 fps, so waits are long and fps can't be measured.
   - `node tools/rustwater/shot.mjs <outdir> [--quality high|medium|low] [--dusk] [--at x,z] [--view name=px,py,pz,tx,ty,tz]`
     - Takes screenshots, with the HUD hidden.
     - Also prints draw calls for one whole frame, counting every pass.
   - `node tools/rustwater/flow.mjs`: the mission regression. Its expected output is in its header
     comment. Run it after any gameplay change, and update it when missions change.
   - `node tools/rustwater/touch.mjs <outdir> [--portrait]`: the touch controls on an emulated phone.
   - `node tools/rustwater/live.mjs`: after deploying, checks the live page.
   - Put screenshots in the session's scratchpad, not the repo. Each screenshot costs context, so
     look at two or three per iteration, not ten.
4. **Ship**, when the user asks.
   - Stage files by name; never use `git add -A`, because other agents write into this tree. Then commit.
   - Run `git checkout main && git merge --no-ff rustwater-havoc`, then `./deploy.sh`.
     - `deploy.sh` is untracked.
     - It refuses to run if there are untracked files.
     - It doesn't publish `docs/` or `tools/`.
   - Then run `node tools/rustwater/live.mjs`.
   - Don't push to `origin` unless the user asks.
5. **Update** the README (controls, features, quality table), the status table above and the memory note.

### Conventions in the code

- **Three.js:** r160 is vendored. Add-ons come from `vendor/addons/`, copied unmodified from the r160 tag.
  Nothing loads from a CDN.
- **Randomness:**
  - `mrand`: the map layout (seed 1979).
  - `drand`: decoration (seed 1961). Adding `drand()` calls shifts later decoration, which is fine.
    Never add `mrand()` calls, because that moves buildings.
  - `Math.random()`: everything at run time.
- **Materials:**
  - Custom looks use `onBeforeCompile` on `MeshStandardMaterial`, so that shadows, fog and lights
    keep working (see `water`, `gmat` and `personMat`).
  - `vcMat` + `vc(geo, hex)` + `mergeGeometries` give cheap multi-colored props. Use `mergeNI` when
    the parts mix indexed and non-indexed geometry.
- **Graphics quality:**
  - `QUALITY` has `low`, `medium` and `high`. `QS` is the current level.
  - New graphics features read a `QS` field. Add the field to all three levels and to the README table.
- **Day cycle:** `updateSky(t)` computes `k`, where 0 is golden hour and 1 is blue dusk, on a 240 s
  half period. Everything that changes with the light is set there.
- **Debug handle:** `window.__rustwater` (state, cars, peds, player, M, startGame). It is not an
  agent API.
- **Coordinates:**
  - Tiles are `T = 10` m, and the map is 54 × 54 tiles (`WORLD = 540`).
  - The river covers tile rows 24 to 29 (`RIV_Z0 = 240`, `RIV_Z1 = 300`), and the water surface sits
    at `WATER_Y = -1.8`.
  - Bridges are at tile columns `BRIDGES = [10, 26, 42]`.
- **Original work only:** names, music and art must all be original. Don't recreate real songs, brands
  or another game's look.

### Cost, measured 2026-11-23 (SwiftShader, game camera, one frame with every pass)

| Quality | Draw calls | Triangles | Note |
|---|---|---|---|
| High | 351 to 371 | about 0.65M | Includes the 2048 shadow pass, and the reflection when the river is on screen |
| Medium | 260 | about 0.5M | |
| Low | 148 | about 0.24M | |

Night, measured 2026-11-23 after session 1 (same camera, `shot.mjs --at 222,163`, one frame):

| Phase (quality) | Draw calls | Triangles |
|---|---|---|
| Golden 0.0 (high) | 376 | 0.62M |
| Dusk 0.25 (high) | 388 | 0.64M |
| Night 0.5 (high) | 177 | 0.24M (sun shadow pass off) |
| Dawn 0.85 (high) | 382 | 0.63M |
| Night (medium) | 183 | 0.25M |
| Night (low) | 138 | 0.23M |

Weather, measured 2026-11-24 after session 2 (same camera, `shot.mjs --at 222,163 --weather ...`, one frame, all passes):

| Weather (quality) | Draw calls | Triangles | Note |
|---|---|---|---|
| Clear (high) | 375 | 0.62M | same as before |
| Overcast (high) | 364 | 0.61M | |
| Leaf storm (high) | 385 | 0.63M | |
| Rain, day (high) | 713 | 1.10M | the wet-ground mirror is a second full scene pass; this is the expensive case |
| Rain, night (high) | 342 to 463 | 0.49M to 0.68M | no sun shadow pass at night; the range is two different views |
| Rain, day (medium) | 165 | 0.24M | measured on a frame where both shadow and wet pass were skipped (they run every other frame); a pass frame is about 160 calls more |
| Rain, day (low) | 142 | 0.24M | no wet mirror, no shadows |

Cars and sound, measured 2026-11-24 after session 3 (same camera, `shot.mjs --at 222,163`, one frame, all passes; no skid marks on screen):

| Case | Draw calls | Triangles |
|---|---|---|
| Clear, golden (high) | 365 | 0.62M |
| Rain, day (high) | 550 | 0.87M |
| Night (high) | 174 | 0.25M |
| Clear (medium) | 353 | 0.62M |
| Clear (low) | 146 | 0.22M |

Session 3 adds at most 1 call for the skid marks (hidden until the first mark), up to 8 for loose hubcaps, and nothing per damaged car (a dent only swaps geometry).
The rain and medium numbers move with which frame the every-other-frame passes land on, so compare them loosely.

The shadow pass (a 240 m box around the player) is the biggest single cost. Nothing has been timed
on a real GPU yet. If the user reports fps from a real device, write the numbers here.

---

## Session 1: Night

**Goal:** the day cycle goes golden hour → dusk → **night** → dawn → golden hour. At night the town
is lit by street lamps, windows, neon and headlights. Fold in the shadow-cost fix, because night
changes the sun anyway.

**Anchors:**
- `function updateSky`, `// ---------- Day cycle`
- `const facadeMats`, `function facade`
- `function addSign`, `// ---------- Neon signs`
- `const lampHeadMat`, `function updateLamps`, `poolMat`
- `beamMat`, `headlight` (the player's SpotLight), `c.beam`, `c.head`, `c.tail` in `function makeCar`
- `GradeShader` (the `uDusk` uniform), `glow` (lamp glow points)
- `sun`, `hemi`, `FOG_GOLD`/`FOG_DUSK`

**Design:**
- **Cycle.** Replace the cosine `k` with a phase `p` in [0, 1) over about 10 minutes (golden 0.0,
  dusk 0.25, night 0.45 to 0.7, dawn 0.85). Derive the old `k` from `p` so existing callers keep
  working, and add `night` (0 to 1).
  - Add a debug override `window.__phase`, and change the `__fastDusk` hook in `tools/rustwater/lib.mjs`
    to pin a phase.
  - Show the time (for example `9:40 PM`) small in the HUD.
- **Sky and light.**
  - At night: a deep blue-black fog and background, a cool moonlight `sun` (low intensity, blue)
    and a dim `hemi`.
  - Optional: a moon sprite and a few stars on a dome, if the camera ever shows sky (mostly it doesn't).
- **Windows lit in sequence.** The facade glow maps are static canvases.
  - Add `onBeforeCompile` to the facade materials: hash each window cell from its UV (the facades
    are 8 bays × 8 floors per tile) plus the building's world position, then switch the cell's
    emissive on when `hash < uLit`.
  - `uLit` rises through dusk and falls before dawn, so windows come on one by one rather than
    all at once.
  - Keep a few windows flickering (TV blue).
- **Neon.** The `addSign` signs get brighter at night, and one or two get a slow buzz flicker. Bloom
  strength rises with `night`.
- **Headlights.**
  - Every driven car's `beam` plane goes up to full opacity, and `head`/`tail` emissive goes up.
  - Add a small additive ground pool in front of each car (reuse the `poolDisc` texture).
  - Only the player's car has a real SpotLight; that is already there. **Don't add or remove real
    lights while running**: changing the light count recompiles every material.
- **Puddles.** The ground roughness map already has puddles. At night, lower the ground's
  `envMapIntensity`. Real neon reflections in puddles are session 2's wet-road reflection, not this
  one.
- **Shadow cost.**
  - At night (`night > 0.5`), turn `sun.castShadow` off. The moon gives soft light, and people keep
    their blob shadows.
  - Toggling `castShadow` recompiles every material once (see `setQuality`), so do it only at the
    threshold, with hysteresis.
  - In daytime, try `QS.shadowEvery`-style static caching: re-render the shadow map only when the
    focus moves more than 8 m or the sun moves noticeably. Dynamic objects then lag a little.
    Measure the effect with `shot.mjs` and keep it only if it looks right.

**Quality:** window hashing is on all levels. Low gets no flicker and no headlight ground pools.

**Done when:**
- `shot.mjs --at 222,163` with the phase pinned at golden, dusk, night and dawn gives four
  believable frames, with no blown-out bloom at night.
- Draw calls at night on high are below the table above (shadow pass gone).
- `flow.mjs` gives the same output as before.

**Session 1 notes (built 2026-11-23):**
- Cycle is `DAY_LEN = 600` s, `p = (t / 600) % 1`; keyframe tables `K_DUSK`, `K_NIGHT`, `K_LIT` in `updateSky`.
  `window.__phase` (a real feature in the game, not a test hook) pins it; `shot.mjs` has `--phase 0.5`
  (`--dusk` = 0.25). The old `__fastDusk` hook is gone. The game starts at golden hour (p = 0).
- `updateSky` still returns `k`. New globals: `nightAmt`, `clockText` (HUD `#clock`, golden hour = 6:30 PM).
- Windows: `nightU` (uLit, uTV, uT) is shared by all facade materials through `onBeforeCompile`
  (hash of the emissive-map cell plus the 10 m world tile). TV windows are 7% of cells, off on low (`QS.nightFx`).
- Night shadow switch: `nightNoShadow` with hysteresis (off above 0.55, on below 0.4), through
  `applySunShadow()`, which `setQuality` now also uses. One recompile hitch at each switch; not measured on a real GPU.
- `scene.environmentIntensity` doesn't exist in r160, so night scales every material's `envMapIntensity`
  (base kept in `userData.envBase`) by a scene traversal, only when the factor moves by 0.01.
- Headlights: `c.hpool` (additive ground pool, shared material `headPoolMat`) per car, shown when night > 0.12
  on driven cars; beam and head/tail brighten. Still one real SpotLight. Two signs buzz (`buzz` flag).
- **Decided against the static shadow cache for daytime.** The shadow camera follows the player, so a cached
  map would need snapping to an 8 m grid, and traffic, people and the player's own car would then visibly
  trail their shadows. Medium already updates every other frame. Revisit only if a real-GPU report says the shadow pass is too costly by day.
- Not done: moon sprite and stars (the camera never shows sky).
- Daytime draw calls (376 to 388) are a little above the 351 to 371 of the table, with no new daytime
  objects; it is probably the car/traffic mix in the frame. Not investigated.
- Ideas for later: in session 2, wet-road reflections should use `uNight` too so neon shows in puddles.

**Risks:** night too dark on phones. Keep the roads readable: lamp pools and headlights should carry
the scene, and the minimap is unchanged.

---

## Session 2: Weather

**Goal:** the weather changes on its own: clear, overcast, rain, clearing, and a leaf storm. Wet
roads reflect lights.

**Anchors:**
- `class Particles`, `const smoke`/`fire` (point sprites; `pUniformScale`)
- `gmat` and `groundRough` in `// ---------- Ground texture`
- The `refl` object in `// ---------- River` (the planar reflection pass)
- `updateSky`; `// AUDIO` (`A.noise` exists)
- `stepCar` (grip: the `vl *= Math.exp(-(hb ? 1.4 : 9) * dt)` line)

**Design:**
- **Weather state.** Use `W = { kind, rain 0–1, wet 0–1, wind }` with eased transitions: rain starts
  over about 20 s, and the ground dries over about 60 s after it stops.
  - It runs from `Math.random()` on a timer of a few minutes per state.
  - Add the debug override `window.__weather`.
- **Rain.**
  - Streaks as an `InstancedMesh` of thin quads (or `LineSegments`) in a box that follows the camera.
    Point sprites can't draw streaks.
  - Splashes are a small `Particles` system emitting on the ground near the camera.
  - Rain rings on the river: add a `uRain` uniform to the water shader for small expanding circles.
  - Add a rain sound: filtered noise through `A`, louder outdoors, muffled in a car.
- **Wet ground.**
  - Add a `uWet` uniform to `gmat` through its `onBeforeCompile`: darker albedo, roughness down to
    about 0.15, and puddles flat at 0.05.
  - **Reflections:** reuse the `refl` pass with a second target and the mirror plane at `y = 0` when
    `W.wet > 0.3`, sampled by the ground shader in puddles and on wet asphalt (strong on high,
    weaker on medium, off on low).
  - This is where "neon in puddles" lands. It costs another scene pass, so limit it: render it only
    when wet, at half or a third of the resolution, every other frame on medium.
  - Merge it with the river's pass if possible, since they're planes 1.8 m apart. Try it.
- **Fog over the river:** a few large, soft, additive sprites drifting slowly at `WATER_Y + 1`. They
  are thicker in rain and at dawn.
- **Leaf storm:** with high wind, a `Particles` system of leaf-colored flakes blowing across the
  camera view, and trees swaying more (the `windU` uniform; check how `swayMat` uses it).
- **Handling:** wet roads lower grip a little (for example damping 9 → 6.5) and make the handbrake
  slide longer. Keep it mild, and check `flow.mjs`.
- **Loose end:** when the quality changes to low in the middle of a game, the ground keeps its 2×
  texture. Rebake at `GSC = 1`, or accept that and document it.

**Quality:**
- High: rain streaks (about 3k), splashes and wet reflections.
- Medium: half the streaks, and reflections at a third of the resolution every other frame.
- Low: about 800 streaks, darker wet ground only, and no reflections.

**Done when:** screenshots of clear, rain (day), rain (night, with neon visible in puddles) and the
leaf storm all look right; draw calls in rain on high are noted in the cost table; and `flow.mjs`
passes.

**Session 2 notes (built 2026-11-24):**
- State is `W = { kind, rain, wet, cloud, wind, gust, t }` (also on `window.__rustwater.W`). Kinds and their
  targets are in `WK`, the random order in `W_NEXT`, durations in `W_DUR` (clear 150 to 240 s, overcast 50 to 90,
  rain 110 to 190, clearing 50 to 80, storm 70 to 110). The game starts clear. `updateWeather(dt, dawn)` runs just
  before `updateSky`. `window.__weather = 'rain'` (clear, overcast, rain, clearing, storm) pins the kind and snaps
  every value; `shot.mjs --weather` sets it. Pinning `storm` also pre-fills the view with leaves (headless runs at
  about 1 fps, game time moves 0.05 s per frame, so natural easing is far too slow to test).
- Rain: one `LineSegments` (3000 streaks, draw range follows `W.rain`), animated in the vertex shader from a
  wrapped box around the camera. Splashes are a `Particles` system (`splash`), skipped on the river rows. Rain rings
  on the river are in the water shader (`uRain`). Rain sound is two looped noise sources (`A.rainS`, `A.windS`),
  muffled inside a car.
- Wet ground: `wetU` (`uWet`) in `gmat`: darker albedo, roughness down, flat mirror puddles. The roughness map's
  blue channel is 0 on roads and puddles, so it is the road mask; green is the puddle mask.
- The mirror: `makePlanar(Y, ...)` is now the generic planar reflection; `refl` (river, y = WATER_Y) and `wetRefl`
  (ground, y = 0) both use it. The wet pass runs when `W.wet > 0.3` and `QS.wetRefl > 0` (high 0.4 scale, medium 0.25
  every other frame, low off). **I did not merge it with the river pass:** the planes are 1.8 m apart, but the river
  needs the water hidden and its own oblique clip, so one shared target would show wrong reflections in one of them.
  The cost is in the table above: rain by day on high is about twice the draw calls.
- Neon in puddles: confirmed at night, windows and signs mirror in the wet asphalt
  (`n2/low.png` in the session scratchpad). Neon and lamps look much weaker in a top-down view, because the
  mirror strength depends on the viewing angle.
- Overcast: `updateSky` scales sun and env light by `W.cloud`, greys the fog, and rain pulls the fog in (140/360 to 85/250).
- Leaf storm: `leaves` (`Particles`, 500) blown east, trees sway by `windAmp` (up to 4x). Leaves are round-ish point
  sprites that don't tumble.
- Handling: wet damping 9 to 6.5 and handbrake 1.4 to 0.9 at full wet (applies to all cars). `flow.mjs` passed three times,
  but "police" printed 0 once, then 2, 2 (baseline 1): that count depends on frame timing at 1 fps and is flaky.
- River mist: 16 flat additive-free quads (one `InstancedMesh`), thicker in rain, at dawn and under cloud.
- Loose end (low quality changing mid-game keeps the 2x ground texture): **accepted, not rebaked**. It only costs memory.
- Not done: no rain on car windows, no lightning or thunder, no puddle ripples on the ground, and rain falls through
  roofs (the camera looks down, so it isn't noticeable).
- Not measured on a real GPU. Rain by day on high is the likeliest to drop frames; the `perfWatch` step-down
  covers it, but if a real device shows it, set `wetRefl` lower or skip the wet pass on high too.

---

## Session 3: Cars and sound

**Goal:**
- Damage you can see: dents, cracked glass, hubcaps flying off, and skid marks.
- Engine sounds by car type, and a radio with original procedural stations.
- Optionally, "point where you want to go" steering on touch.

**Anchors:**
- `const CAR_TYPES`, `const CAR_GEO` (geometry cached per type and **shared**)
- `function makeCar`, `function charCar`, `function explodeCar`
- `function stepCar` (the `hit` variable for wall hits), `function carCollisions`
- `const glassMat`, `c.wheels`
- `// AUDIO`: `A.eng`, `A.engFilt`, `A.engGain`, `function initAudio`; the engine-pitch line in the audio update
- Touch: `// ---------- Touch controls`, `TOUCH`, and the car branch of `updatePlayer`

**Design:**
- **Dents.**
  - On the first hit, give the car its own copy of the body geometry (`bodyMesh.geometry = shared.clone()`),
    so other cars of the same type don't share the dent.
  - On each hit with a world point and force, push vertices within about 0.8 m of the local impact
    point inward along the hit normal. Keep the push small (≤ 0.25 m) and never past the cabin.
  - Run `computeVertexNormals()` after each hit. Dispose of the clone in `removeCar`.
- **Glass.** Below 50% health, swap `c.glass` to a shared cracked-glass material (a canvas crack
  texture). Wrecks lose their glass.
- **Hubcaps.** A heavy side hit has a chance to detach a hubcap: a small disc mesh with velocity,
  spin, bounce and roll, removed after 6 s. Keep at most 8.
- **Skid marks.**
  - One `InstancedMesh` ring buffer of about 800 thin dark quads on the ground (y = 0.02,
    `polygonOffset`).
  - Lay a pair at the rear wheels each 0.4 m while drifting (`c.drift`) or braking hard above
    12 m/s.
  - A fade needs per-instance opacity, using an `instanceColor` alpha trick or a custom attribute. A
    hard cap of 800 with overwrite is acceptable.
- **Engine by type.** Add an `engine` entry to each `CAR_TYPES` type: base pitch, waveform, filter
  and a slight detune second oscillator. A van grumbles, the coupe rasps, the police car is deep.
  Set these in `initAudio` and wherever the player's car changes.
- **Radio.**
  - Three original stations made with WebAudio (no samples):
    - **WRST 1979:** funk-ish bass and drums from a seeded step sequencer.
    - **Mill Town Blues:** a slow 12-bar on a plucked synth.
    - **KTEO talk:** static, beeps and garbled "voice" formant noise between jingles.
  - Schedule with a lookahead timer, the standard "tale of two clocks" approach.
  - It plays only in a car; leaving the car fades it out. Sirens duck it.
  - Controls: the **T** key and a touch **RADIO** button cycle stations. Show the station name as a
    toast. Off is the fourth state.
  - Mute (M) mutes it too.
- **Touch steering (optional).** Add a setting on the pause screen: "steering: turn" (now) or
  "steering: point".
  - In point mode the car steers toward the stick's screen direction, and the stick's length is the
    throttle.
  - Pushing opposite the car's facing brakes, then reverses.
  - Save the choice in localStorage.

**Done when:**
- Crashing a car into walls and other cars shows dents and cracked glass in a screenshot.
- Skid marks show after a handbrake turn.
- The radio cycles through its stations.
- `touch.mjs` and `flow.mjs` pass.
- No audio errors when the page loads muted or before the first gesture.

**Session 3 notes (built 2026-11-24, split as damage and skids first, then engines and radio):**
- Damage: `dentCar(c, dx, dz, force)` (dx, dz = world direction from the car toward what it hit; called from `stepCar` wall hits and `carCollisions`,
  debounced 120 ms per car). On the first dent a car clones its body and trim geometry (`c.dent`), keeps an `orig` attribute, and
  `tessellateNear` splits the triangles near the impact to about 0.3 m (the body faces are huge flat triangles, so a plain vertex push showed nothing).
  Vertices move inward, sag a little above the impact height, and are capped at `DENT_MAX = 0.3` from `orig`. The greenhouse is masked out so the glass doesn't clip.
  The clones are disposed in `removeCar`. `repairCar` (called by Sal's respray) restores everything.
- Glass: `glassMat` got a blank map so `crackMat` (canvas crack texture) uses the same shader, with no recompile hitch. Under 50% health `damageCar` swaps it;
  `charCar` hides the glass of wrecks.
- Hubcaps: `carGeo` builds `wheelBare`; `popHubcap` swaps a wheel to it and launches one of 8 pooled discs (`updateHubcaps`, 6 s life).
- Skid marks: `skIM`, one InstancedMesh ring (`QS.skid` 800/500/300) with a per-instance alpha attribute (`aA`); `laySkids` is called from `stepCar`
  (sliding over 4.5 m/s sideways, or handbrake/brake hard above 12 m/s), only within 110 m of the camera, not on water tiles; they fade over 60 s (`updateSkids`).
- Engines: `CAR_TYPES[type].engine` (waveforms, detune, base pitch, filter, gain); `updateAudio` sets them when the player's car type changes, with four gears.
- Radio: `R` and the code above `sfxBeep`. Stations are generated live with a 30 ms lookahead timer (0.7 s ahead); each has its own gain bus (`R.w` trims loudness),
  so switching mutes what was already scheduled. T, the touch `#tRadio` button and the HUD line `#radioLine`; the choice is saved as `rustwater-radio`. Default is off.
  Level check with an analyser on the output (headless Chromium does run the AudioContext): engine idle rms 0.027, stations add up to peak 0.2, no clipping.
- Debug handle now also has `dentCar` and `damageCar` (tests use them).
- Tests: `flow.mjs` and `touch.mjs` (landscape and portrait) pass; no console errors on load before the first gesture, or when pressing T before and after.
- Not done: touch "point" steering (optional). Nothing could be judged by ear, so the stations' musical quality and the engine voices are unheard.
- Ideas: dents don't show on the taxi and police decals or the glass; skid marks don't darken with rain; no damage sounds per hubcap landing.

---

## Session 4: Busier streets

**Goal:** the town feels lived in: traffic lights at main crossings, people waiting at crossings and
bus stops or sitting on benches, a bus line and delivery trucks.

**Anchors:**
- `const nodes`, `const ROAD_X`/`ROAD_Z`, `function link` (the road graph)
- `function updateTraffic`, `function spawnTrafficAt`, `function upkeep`
- `function updatePeds`, `function newPed`, `function knockPed`, `function animPerson`/`posePersonDown`
- `PROP_DEFS` (the bench exists), `props`
- `const CAR_TYPES` (profile `p` per type, `sideExtrude`, `carGeo`), `function carHitsWorld`
- `function crime`

**Design:**
- **Traffic lights.**
  - Pick the 4-way junctions on the main avenues. Each gets a signal phase (north-south green,
    amber, all red, east-west green, ...) with an offset by position, to make a slight green wave.
  - Add the poles and heads as instanced meshes, with emissive set per instance through
    `instanceColor`.
  - **AI:** traffic cars and buses brake to a stop line before a red or amber junction they're
    heading into. Police with sirens on ignore lights.
  - **Player:** running a red right next to a cop adds a little heat (`crime(0.3)`).
  - Lights also work at night and in rain (reflections are free if session 2 is done).
- **Pedestrians.**
  - Add `waitCross`/`cross` states: walkers pause at the corner on red, then cross on the crosswalk.
  - Add `sit`: a new seated pose (hips and knees bent, from the bone rig in `BONE_DEF`) on park
    benches.
  - Add `waitBus`: people stand at bus stops. Add a new prop: a shelter with a bench and a sign.
  - Keep the population cap `QS.peds`.
- **Bus.**
  - A `bus` entry in `CAR_TYPES`: about 11 m long, in a 1970s transit livery with an original name
    ("Rustwater Transit"). It needs its own profile `p` and a rear engine grille.
  - One or two buses run a fixed loop of road-graph nodes that includes the bridges. They stop at
    stops, where people get on and off (fade in and out).
  - The player can steal a bus: slow, heavy, high health.
- **Delivery truck:** a `truck` type with a box body and an original company name. It sometimes
  double-parks with its hazards flashing.
- **Check long vehicles** against `carHitsWorld`, car-to-car collisions and the near-miss bonus.
  The body box comes from `spec.body`.

**Done when:**
- A junction screenshot shows lights and cars stopped at a red.
- Bus-stop and bench people are visible.
- A bus completes a loop over 2 minutes headless (check its position).
- `flow.mjs` passes. Traffic must not deadlock at lights: watch for cars with `idle > 8` piling up.

---

## Session 5: More jobs and side activities

**Goal:** more to do after Teo's five jobs: taxi fares, a timed race over the three bridges, and car
thefts for Sal that pay by vehicle type.

**Anchors:**
- `const MISSIONS`, `const M` (mission state), `function startMission`, `function updateMission`,
  `function missionEvent`, `function updateMissionPanel`
- `function setTarget`/`clearTargets` (the green beams and compass), `function flashBanner`, `function addScore`
- `function interact`, `function nearPhone`
- `function updateRespray` (Sal's Garage location and logic)
- `best` (localStorage `rustwater-best`)

**Design:**
- **One job at a time.** Side jobs use `M.active` like missions, so they can't overlap. Phones still
  give Teo's jobs.
- **Taxi fares.**
  - In any `taxi`, press **E** while stopped: "Taxi duty on".
  - People hail with a raised arm: a pose, and a marker on the minimap.
  - Stop next to one to pick them up, then drive to a random destination across town. The fare is
    distance plus a time bonus; crashing knocks off tips.
  - Ten fares in a row pays a bonus.
  - Leaving the taxi, or picking up 2 stars, ends taxi duty.
- **Bridge race.** The start is a checkered banner at the foot of a bridge: drive into it in any car.
  - Checkpoints over all three bridges, and a lap time.
  - Best time saved in localStorage (`rustwater-race`).
  - Ghost-free: no replays needed.
- **Sal's list.**
  - A board at Sal's Garage shows three wanted models, which change every few minutes. Use
    `CAR_TYPES` keys, including bus and truck if session 4 is done.
  - Delivering one pays by type × health. Police cars pay the most and add stars.
- **Help.** Show these on the title screen's help and the touch help. Update `tools/rustwater/flow.mjs`
  to also run one taxi fare and one race checkpoint.

**Done when:** each new activity is played through headless by teleporting (as in `flow.mjs`), the
updated `flow.mjs` passes, and the score and localStorage records behave.

---

## Session 6: Agent mode

**Goal:** AI agents can play Rustwater through `window.arcade`, with a seeded benchmark that can be
verified. This is the same work as Harbor City's agent mode, so start from there.

**Read first:**
- `docs/harbor-city-agent-mode.md`: what's missing, and what was built for Harbor City.
- The Harbor City agent page, in git history at commit 8d69abf (`git show 8d69abf:games/harbor-city-agent/index.html`).
  It was removed from the site in fea904f because it wasn't ready.
- The repo `README.md` sections on the agent protocol, `agents.md`, `games/arcade.js`,
  `tools/verify.mjs` and `data/benchmarks.json`.

**Design (to confirm with the user before building):**
- **Separate page.** `tools/verify.mjs` replays at `/games/<id>/`, so it would be
  `games/rustwater-havoc-agent/` or a `?agent=1` mode inside the same page. Pick one and say why.
- **Seeded RNG.** Gameplay `Math.random()` calls (about 52 in all; separate gameplay from cosmetic)
  go through `Arcade.random()`. Decoration and particles stay on `Math.random()`.
- **Fixed step.** Move the simulation part of `frame()` into `simStep(dt)`. In agent mode,
  `arcade.act()` advances N fixed steps of 0.05 s, and rendering only draws.
- **`observe()`:** a text view around the player (tiles, cars, cops, people), plus status, mission,
  phones and the wanted level. **Actions:** move directions, `handbrake`, `enter`, `wait n`, `respawn`.
- **Benchmark:** for example `rust-240`, the score in 240 s of game time. It needs a recorder, a
  replay through `verify.mjs`, an entry in `benchmarks.json`, then `node tools/build-index.mjs`
  before deploying.
- **Then:** a baseline agent run, the landing card set to `agent: true`, and `llms.txt` / `agents.md`.
- **Human play stays identical.** Agent mode changes only pacing and input.

**Note:** this is likely bigger than one session. Plan the split at the start: (a) seed, fixed step
and arcade API; (b) benchmark, recorder, verify and listing.

---

## Not planned as sessions

- **Push to origin:** whenever the user says so.
- **Real-GPU tuning:** once the user reports fps on a real machine, adjust the `QUALITY` thresholds
  and the `perfWatch` step-down (26 ms average over 4 s).
