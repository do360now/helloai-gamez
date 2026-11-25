# Rustwater Havoc: plan for the remaining upgrades

Written 2026-11-23, after the river pass (commit 76fed7a). Each **session** below is sized to fit in one
fresh Claude Code session. A session starts cold, reads only this file, the game's README and the
code anchors it lists, does the work, then ships it. Do the sessions in order: later ones build on
earlier ones. Agent mode (session 6) is last, because it freezes the rules.

| # | Session | Status |
|---|---------|--------|
| 1 | Night (and the shadow-pass cost) | done (see git log, merged 2026-11-24) |
| 2 | Weather | done (commit ceab9c5, merged and deployed 2026-11-24) |
| 3 | Cars and sound: damage, skid marks, engine voices, radio | done (commit 024a243, merged and deployed 2026-11-24; touch point steering not done) |
| 4 | Busier streets: traffic lights, people waiting, buses and trucks | done (commit 725f59f, merged and deployed 2026-11-24) |
| 5 | More jobs: taxi fares, bridge race, cars for Sal | done (commit 468bd16, merged and deployed 2026-11-25) |
| 6 | Agent mode | 6a done (commit 89633b6); 6b built 2026-11-25 (arcade adapter, uncommitted, awaiting review); 6c (benchmark, verify, listing) not started. Decisions 1 to 5 confirmed (recommendations) |

At the end of a session, set its row to `done (commit abc1234)` and add notes under the session for
anything the next one needs to know.

## How to run a session

1. **Start.** Read this file, `games/rustwater-havoc/README.md`, and the memory note `rustwater-havoc`.
   - Then run `git checkout rustwater-havoc && git merge --ff-only main`.
   - Check `git branch --show-current` before every commit. On 2026-11-23 a commit landed on `main` by
     mistake.
2. **Don't read `index.html` whole.** It is about 3,800 lines in one module script (checked 2026-11-25).
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

Busier streets, measured 2026-11-24 after session 4 (same camera, one frame, all passes; the figures include the signals, shelters, extra people, trucks and buses that happen to be in view):

| Case | Draw calls | Triangles |
|---|---|---|
| Clear, golden (high) | 385 | 0.66M |
| Rain, day (high) | 555 | 0.93M |
| Night (high) | 161 | 0.24M |
| Clear (medium) | 388 | 0.65M |
| Clear (low) | 145 | 0.27M |

Signals add 3 draw calls (poles, heads, lenses) and the shelters 1; each bus or truck in view is about 8 to 10 like any other car.

More jobs, measured 2026-11-25 after session 5 (same camera, one frame, all passes):

| Case | Draw calls | Triangles |
|---|---|---|
| Clear, golden (high) | 392 | 0.68M |
| Rain, day (high) | 599 | 1.00M |
| Night (high) | 158 | 0.26M |
| Clear (medium) | 397 | 0.65M |
| Clear (low) | 136 | 0.25M |

Session 5 adds about 5 static draws (banner, its poles, Sal's board and posts); the numbers move a few calls with whatever cars and people are in view.

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

**Session 4 notes (built 2026-11-24, in two parts: signals and braking, then people, buses and trucks):**
- Signals: `sigNodes` (4-way nodes in odd columns, so the three bridge avenues; 12 junctions), `sigState(n, axis)` (25 s cycle, offset `n.sigOff`),
  `window.__signal = 'ns' | 'ew'` pins it (green for that axis; a real feature hook like `__phase`). `updateSignals` recolours the lens instances only when a head changes.
  Stop bars are painted in `bakeGround`. `signalTarget(c)` in `updateTraffic` caps the speed of a car heading for a red or an uncomfortable amber
  (stop point is 21.3 m + half the car's length from the junction centre); cars waiting at a light don't count towards the `idle > 8` despawn.
  Police don't use `updateTraffic`, so they ignore lights. `redLightCheck` gives `crime(0.3)` when the player enters a junction box on red with a cop within 40 m.
- Long vehicles: `carCircles` uses 5 circles above 6 m; `blockedAhead` scales its range and width with the car.
- Types: `bus` (11 m, hp 420, max 22) and `truck` (7 m box body, hp 220) in `CAR_TYPES`, with `wheelK` (bigger wheels) and decals through `DECAL_MAT`.
  `TRAFFIC_MIX` replaces the three hard-coded lists. `spawnCurbTruck` parks a truck at the kerb with `c.hazard` (flashing the brake lights).
- Bus line: `BUS_ROUTE` (10 nodes, 960 m, both ends of two bridges), `busStops` (3, found by scanning for a free sidewalk spot), `shelterIM`.
  A bus is `kind: 'traffic'` with `c.bus`, `c.route`, `c.ri`; `planNext` follows the route; `busStopTarget` brakes to the stop, `c.dwell` holds it 7 s,
  `busDwell` makes the waiters walk to the door (`p.board`, `busDoor`) and climb in (the ped is removed) and lets up to 2 passengers climb out.
  `upkeep` keeps two buses alive (never despawns a bus that is still on its route) and about two kerb trucks.
- People: `p.stay` (a bench sitter or a bus-stop waiter), `p.board`, `p.waitT` (waiting at a kerb; `pedMayCross`: near a signal, wait for red for the cars,
  otherwise wait for a gap, give up after 20 s). `seatPeople` adds sitters (max 8) and waiters (max 3 per stop) around the player; `releasePed` / `dropPed` clean up.
  `posePersonSit` is the sitting pose. People who wait or sit are on top of `QS.peds`.
- Test hooks: `__rustwater.fastForward(seconds)` runs traffic, signals and people without drawing (headless draws 1 frame a second, so a bus would never get round);
  the handle also has `nodes`, `sigState`, `makeCar`, `busStops`, `props`, `time`, `heat`.
  With it, two buses ran the whole loop in about 150 s of game time, stopping at all three stops, with no car idle for more than 8 s. Cars queue and
  stop at a pinned red; walkers wait about 11 s at the kerb near a light.
- Checked: `flow.mjs` (police 2), `touch.mjs` landscape and portrait, no page errors; screenshots of the lights, a bus at a stop with people boarding, a bench sitter,
  and the hazard truck were looked at in the session scratchpad.
- Not done / ideas: people don't get on a bus that is not at a stop; the bus has no driver or passengers visible, and no interior; cars don't give way to each other in a junction
  (a car left in the box when the light changes relies on the 1.5 s all-red); hazard lights flash the red brake lamps, not amber; peds only look for a gap
  at kerbs (not for a car that is already crossing); trucks don't deliver anything.
  Next session (5) can use `TRAFFIC_MIX` and the new types in Sal's list.
- Not measured on a real GPU or by ear/eye in motion: only still frames in headless.

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

**Session 5 notes (built 2026-11-25):**
- Side jobs set `M.active = { id, name, side: true }` (so phones stay quiet and `playerFail` clears them) and never touch `M.next`; `updateMission` hands
  `side` jobs to `updateSideMission` (the race clock and checkpoints); `updateSide(dt)` runs next to it every frame (Sal's list timer, the race gate trigger, taxi duty, deliveries).
  The mission panel hides the timer when `M.timer > 900` (taxi duty, while looking for a fare); the race counts up (`M.active.up`).
- Bridge Run: `RACE_GATE` (north foot of the west bridge, z = junction + 27) with a checkered strip in the ground texture and a banner on two poles; trigger is a car moving south
  (`vz > 3`) through it with no job running. `M.cps` is 11 checkpoints (all three bridges, back over the west one to the gate), radius 8. Pay `clamp(1100 - (t - 50) * 10, 300, 1100)`,
  best in `localStorage` `rustwater-race`, 240 s limit. The race has no rivals and no ghost.
- Taxi duty: `TX` (also on the debug handle). First E in a stopped taxi with no job starts duty; E again gets out and ends it. `pickFare` makes a walker on a sidewalk tile
  (30 to 110 m away) wave (`p.stay.kind === 'hail'`, raised arm in the stay branch of `updatePeds`, yellow beam through `setTarget`, so the minimap and compass use it).
  Stopping within 7 m boards them (the ped is removed), `boardFare` picks a destination 220 to 560 m away on a sidewalk tile beside a road, and `payFare` pays
  `20 + 0.28 * distance` plus a tip (up to 50%, less 1.5 per point of damage), a 10-fare streak bonus, and drops the passenger beside the car. Late fares walk off and reset the streak.
  Duty ends for 2 stars, a wreck, or leaving the car. Cost of the design: leaving a taxi takes two E presses when you are not on duty.
- Sal's list: `SAL = { list, t }`, `SAL_PAY` by type, a board with a canvas texture next to the garage (first free sidewalk spot on a ring around `GARAGE`; faces away from the garage)
  and a HUD line `#sal` near the garage or in a wanted car. `salDeliver` pays `price * (0.35 + 0.65 * health)`, removes the car, puts you on foot, and adds a star for a police car.
  One entry is replaced every 150 s. Cars with `c.mission` (the copper coupe) are not accepted.
- `flow.mjs` now has a second phase on a fresh game: a taxi fare (hail, board, pay, off duty), the race (start through the banner, all 11 checkpoints, best saved) and a Sal delivery.
  Expected: S1 paid with fares 1 and score $170 or so (the fare is random), S2 finishes with about +$1,100, S3 pays about +$250 for a sedan and puts you on foot, and no errors.
- Checked: `flow.mjs` (both phases), `touch.mjs` landscape and portrait, screenshots of the banner, the garage with the board, and a hailing person (session scratchpad `c5/`).
- Not done / ideas: no minimap marker for a taxi fare beyond the beam dot; the board is hard to read from the road (small, and it faces away from the garage); the race has no
  traffic-light or cop handling; nothing is saved between sessions except the best lap; the player can't refuse a fare. Touch players start taxi duty with the E button (label "Taxi duty").

---

## Session 6: Agent mode

**Goal:** AI agents can play Rustwater through `window.arcade`, with a seeded benchmark that can be
verified. This is the same work as Harbor City's agent mode (`docs/harbor-city-agent-mode.md`, built
at 8d69abf and removed in fea904f), so reuse its shape, not its copy of the page.

**Status 2026-11-25: planned, not built.** Split into three parts (6a, 6b, 6c) below. The decisions in
"To confirm" are open; the recommendations there are what the parts assume. Nothing in `index.html` has changed.

### Audit, 2026-11-25 (what the rules look like now that sessions 1 to 5 are in)

**What affects the rules** (all of it must be inside the fixed step, or be cosmetic and kept out of it):
- Missions and side jobs: `MISSIONS` (5 jobs, timers 110/75/170/160/200 s), `M` (`M.active`, `side: true` jobs never touch `M.next`), Bridge Run (`RACE_GATE`, 11 checkpoints, 240 s limit),
  taxi duty `TX` (E in a stopped taxi starts it, E again gets out and ends it), Sal's list `SAL` (new entry every 150 s, `salDeliver`).
- Signals (`updateSignals`, `sigState`, on game `time`), buses on `BUS_ROUTE`, box trucks, people who wait for red or a gap and sit on benches (`seatPeople`, `updatePeds`).
- Wanted level: `heat`, `evade`, `bustT`, `updateWanted`, `updatePolice`; lives, Wasted and Busted, `updateRespray`; `score`, `mult`/`multT`.
- Weather `W`: wet roads change grip, so weather is gameplay. First change is at `W.t = 180` s.
- The radio (`R`, T key) is audio only and has no effect on the rules. Day and night are visual only (nothing in the simulation reads `nightAmt`).

**Randomness.** `Math.random` is not the whole story: `rr(a,b)` and `pick(arr)` (lines 240 and 241) wrap it.
Counted with perl: **96 `Math.random`, 92 `rr(`, 50 `pick(`** (the definitions included), about 238 sites, not "about 52".
- **Gameplay, about 55** (must go through a seeded stream): `spawnTrafficAt`, `spawnBus` (`pax`), `spawnCurbTruck`, `upkeep` (bus and truck top-up), `spawnPed`, `newPed`,
  `pedGoal` (turn choices), `seatPeople`, `planNext` (traffic turns), `updatePolice`, `updateRespray`, `salRefill`, `updateSide` (SAL replace), `boardFare` (fare destination),
  `updateWeather` (`W.t`, `pick(W_NEXT)`), `startGame`/`respawn` (`pick(TRAFFIC_MIX)`), `makeCar`, and the ones that write physics state: `knockPed` (`downT`, `spin`), `knockProp` (velocity, spin),
  `explodeCar` (`c.flip`).
- **Cosmetic, about 180** (stay on `Math.random`, or a second private stream so that the gameplay stream never shifts): textures and facades (`facade`, `shopFacade`, `roofTex`, `grainTex`, `stackMat`, building UV offsets),
  `randomLook` (and the `pick`s in it), `makePerson`'s phase, sign flicker, rain and mist set-up, `leafBurst`, `sparks`, `popHubcap`, `dentCar`, `updateLamps`, the `explodeCar` and fire/smoke emits, camera shake, all audio (`rNoise`, `rVowel`, `funkStep`, `talkStep`, `sfxNoise`, `initAudio`).
- Rule used for the split: if the value is written into state that the simulation or the score later reads, it is gameplay. When unsure, treat it as gameplay.
- `rr` and `pick` need two variants (for example `rr`/`pick` stay cosmetic, `grr`/`gpick`/`grand` are gameplay and read `Arcade.random()`); converting only the direct `Math.random` calls would leave about 40 gameplay sites on the unseeded generator.

**Things in the plan that are wrong or missing:**
1. The "about 52" count (above), and `rr`/`pick` hiding most of the sites.
2. **Sim state lives in the drawing half of `frame()`.** `updateHud` counts down `multT` (the mayhem multiplier resets there); the fire loop in `frame()` counts `c.fireT` down and calls `explodeCar`
   (damage, knocks peds, flips the car) inside the particle code. `simStep` must be built by reading the whole of `frame()`, not by cutting at the "// visuals" comment. The audit of that function is the first task of 6a.
3. **Quality leaks into the rules.** `QS.peds` (30/40/46) and `QS.traffic` (12/15/18) set how many walkers and cars exist, and `perfWatch` changes `QS` by itself when frames are slow. In agent mode the gameplay counts must be fixed constants (use the medium numbers: 40 and 15), whatever the graphics level.
4. **`time` is not reset by `startGame` and keeps running on the title screen**, and it drives signals, the day cycle and the weather's sine gust. Agent mode must zero it at start and only advance it in `simStep`. `W` (kind, `t`) must be reset at start too.
5. **`fastForward` is not a step.** It runs `simCars`, `updatePeds` and `upkeep`; it skips the player, missions, side jobs, wanted level, respray, weather, fire and `updateHud`. Keep it as the test hook, but have it call `simStep` once that exists.
6. **Blur pauses the game** (`addEventListener('blur')` calls `setPause(true)`), and `perfWatch` and audio are driven from `frame()`. In agent mode the blur handler, `perfWatch`, `initAudio` and the radio timer (`setInterval`, 30 ms) must be off.
7. `dentCar` debounces with `performance.now()` (wall clock). Only the dent mesh depends on it, but it should use game time so replays are the same everywhere.
8. `index.html` is **3,781 lines** now, not about 4,500 (the plan's header says 2,900).
9. Drawing blocks the page: headless Chromium (SwiftShader) takes about 1 s per drawn frame. Measured 2026-11-25: `fastForward(60)` (traffic and walkers, no drawing) took **2.1 s** (1,200 steps, 1.7 ms each), so 240 s is about 8 s plus the player and missions. The `requestAnimationFrame` loop must not draw during a replay (speed 0) and should draw only after an action when someone is watching.
10. `tools/verify.mjs` launches plain `chromium.launch()` (no SwiftShader flags). Checked 2026-11-25: Rustwater loads and creates its WebGL context that way in about 5 s here. **Not checked on CI** (`ubuntu-latest`, `python3 -m http.server`); 6c must run the workflow before the card goes live.
11. The Open track has no extra rule for agent games in `README.md`; the protocol is the same (`../arcade.js`, `agent`, `seed`, `bench`, `replay`). A same-page agent mode needs no new rule.
12. Port clash to remember: `tools/rustwater/lib.mjs` serves on 8799, and so does the documented `bridge.mjs --port 8799`. Run them one at a time. `verify.mjs` wants the repo server on 8765 (`cd tools && npm run serve`).
13. Cross-machine determinism is the open risk: the simulation is float, with collisions that amplify tiny differences. V8's `Math.sin/cos/exp/atan2` are deterministic software implementations and JS has no FMA contraction, so a replay should match on any x86 or ARM Chrome. This is reasoned, not measured: 6c checks it on CI.

### To confirm with the user before building (recommendations)

1. **Separate page or `?agent=1` in the same page.** Recommend **the same page** (`games/rustwater-havoc/?agent=1&seed=…&bench=…`). `verify.mjs` opens `/games/<run.game>/`, and the same page keeps one source for a 3,800-line game and one copy of the vendored Three.js (about 900 KB).
   Harbor City's copy went stale the moment it was made. The cost: human play and agent play share a file, so every change to the simulation has to keep both working (the 6a checks guard it).
2. **The seeded benchmark.** Recommend `rustwater-havoc/rust-240`, seed 20261022 (the same as the other benchmarks): **score = money at 240 s of game time** (4,800 fixed steps of 0.05 s), ending early at 0 lives (3 lives as in the game; Wasted and Busted keep their penalties).
   Every job counts: Teo's five, Bridge Run, taxi fares, Sal's deliveries, mayhem and near-miss bonuses. No tiebreak. 240 s fits about two of Teo's jobs or two Bridge Run laps, so a good run is a choice of route, and a random bot scores near $0. The length is cheap to change until the first run is published, then it is frozen.
   Agent mode turns off `localStorage` records (`best`, `rustwater-race`) so a replay never depends on the browser.
3. **`observe()` and actions.** Recommend Harbor City's shape: a text map of 31 × 19 tiles (10 m each), player-centred and north-up, one glyph per tile (road, sidewalk, building, water, bridge, park, lot), over-drawn with the player, cars, police, people, the job target and the signals;
   plus text lines for status (score, lives, health, speed and heading, stars and evade, weather, game time), the mission (name, stage, time left, target as dx/dz/distance), Bridge Run (next checkpoint), taxi duty (on/off, fare, destination), Sal's list (and where the garage is), the phones, the 6 nearest signals with red/amber/green,
   and nearby cars, police and people as dx/dz tiles. The same data as JSON.
   Actions, in units of 0.25 s (5 steps), n from 1 to 40, default 1: `up|down|left|right` and the diagonals (gas, brake or reverse, steer; on foot, walk), `handbrake [n]` (on foot: sprint), `wait [n]`, `enter` (E: answer a phone, steal, get out, **start and end taxi duty**), `respawn` (R, only in Wasted or Busted).
   Out: the radio, pause, mute, quality and touch (no effect on the rules, or not meaningful for an agent). A taxi needs two `enter`s to leave: the first starts taxi duty, so `observe()` must say so plainly.
4. **Weather and day phase.** Recommend: **do not pin either.** The day phase follows game time, which is deterministic once the step is fixed, and nothing in the simulation reads it (golden hour to dusk in the first 240 s; night starts at about 270 s), so it needs no seed. The weather is gameplay (grip), so it runs on its own seeded stream and is the **same for every player** (it starts as `W` does at page load and first changes at 180 s);
   `observe()` reports it. Streams: `weather`, `sal` (the list of wanted cars, also the same for everyone), and `world` (traffic, people, fares, physics jitter). `window.__phase` and `window.__weather` stay debug overrides and are ignored in a benchmark run.
5. **Human play stays identical.** Recommend: **same rules, not same bytes.** Human mode keeps the real-time loop, `dt` from the clock, the quality-dependent counts, keyboard and touch; it calls the same `simStep(dt)`. A casual human game seeds `Arcade.random` from `Math.random()` at load (as `arcade.js` does), so traffic and people differ from before in sequence, not in kind.
   The 6a checks: `flow.mjs` (both phases), `touch.mjs`, and the frame cost table unchanged. Humans do not play the benchmark in 6 (the keyboard is off in agent mode, as Harbor's was); a human turn-based mode can come later.

### Part 6a: Seed, fixed step, no drawing (no arcade API yet)

**Scope.** After 6a the game runs headless in a fixed step, deterministically, with `?agent=1&seed=N`; the page is not yet an `arcade` game.
- Audit `frame()` and list every piece of state it writes outside the player, cars, peds and missions (fire timers, `multT`, `c.vy/liftY`, bus pax, hubcaps…); move the sim ones into `simStep(dt)`, leave the visuals in `frame()`.
- `simStep(dt)`: `updatePlayer`, `focus`, `updateMission`, `updateSide`, `updateRespray`, `updateWanted`, `simCars`, fire/explosion timers, `updatePeds`, `upkeep`, `updateWeather` (its sim half; the rain and splash drawing half stays in `frame()`), `multT`, `time += dt`. `frame()` calls it with the clock's `dt` (human) or never (agent). `fastForward` calls it.
- RNG: add `grand`/`grr`/`gpick` (gameplay, on `Arcade.random()` or, until 6b, a local `mulberry32(seed)`), three streams (`weather`, `sal`, `world`), reset in `startGame`/`respawn` paths as `Arcade.reset()` expects; convert the roughly 55 gameplay sites; leave cosmetic on `Math.random`.
- Agent-mode switches: fixed `QS.peds`/`QS.traffic` equivalents, no `perfWatch`, no blur pause, no audio init, no localStorage records, `time` and `W` reset at start, `dentCar` on game time, no title flyover.
- Add `stateHash()` to `window.__rustwater` (rounded positions of player, cars, peds, score, lives, `M`, `W`, `SAL`, `time`) for the tests.

**Anchors:** `const rr`/`const pick` (240), `function frame` and `simCars`/`fastForward` (3689 to 3776), `updateHud` (3264: `multT`), `function startGame`/`respawn` (3572, 3595), `resetWorld` (3557), `updateWeather` (1640), `W`/`W_DUR` (519 to 523), `QS.peds` (2572) and `QS.traffic` (3681), `perfWatch` (476), the `blur` listener (3484), `dentCar` (2165), `updateSide` (3190), `salRefill` (3090), `boardFare` (3146).

**Headless tests** (new `tools/rustwater/sim.mjs`, server on 8799, SwiftShader flags as in `lib.mjs`):
1. Same seed, same scripted inputs (set keys through a test hook that feeds `simStep`), twice: equal `stateHash()` after 4,800 steps.
2. Same, with `Math.random` replaced by two different seeded generators: **equal hashes** (proves no gameplay value reads the unseeded one). Different seed: different hash.
3. Time for 4,800 steps with the player driving: well under 60 s (traffic and walkers alone measured 8 s).
4. Human regression: `flow.mjs` both phases (expected output unchanged), `touch.mjs`, `shot.mjs` draw-call counts within a few calls of the 2026-11-25 table.

**Done when:** tests 1 to 4 pass; `node tools/rustwater/flow.mjs` prints the documented output; no new `Math.random` in `simStep`'s call tree (test 2); the plan's notes list what moved.

**Part 6a built 2026-11-25 (on the branch, not committed).**
- `simStep(dt)` holds everything the rules read: weather (`stepWeather`, split out of `updateWeather`), player, missions, side jobs, respray, wanted level, `simCars`, fire timers and `explodeCar`, `wreckT` (it drives wreck clean-up in `upkeep`), `updatePeds`, `multT` (moved out of `updateHud`), `upkeep`. `tick(dt)` = `time += dt; simStep(dt)`; `fastForward(s)` now runs `tick`. `frame()` keeps the looks (fire and smoke emits, people blobs, everything under "// visuals") and, in human mode only, calls `simStep` with the clock's `dt`.
- Streams (just after `mpick`): `grand/grr/gpick` (world), `wrr/wpick` (weather), `srand/spick` (Sal's list). Seed from `?seed=N`, else random at load; `window.__rustwater.reseed(n)` for 6b. 53 gameplay sites converted. The one missed in the first pass was `planNext` (traffic turns); the test caught it. `rr`, `pick` and `Math.random` stay for looks and sound.
- `?agent=1` (`AGENT`): fixed counts (40 people, 15 cars), no `perfWatch`, no blur pause, no audio, `__signal` and `__weather` ignored, no stored race best, `startGame` reseeds the streams, sets `time` to 0 and rebuilds Sal's list. The loop does not draw unless `?view=1` (`VIEW`), and never steps the simulation. `dentCar` debounces on game time.
- Test hooks on `__rustwater`: `simStep`, `tick`, `stateHash`, `keys`, `press` (the key-press handler), `seed`, `reseed`. New `tools/rustwater/sim.mjs`.
- **Results:** `sim.mjs` passes: same seed twice gives the same hash at every 60 s mark and at the end (4,800 steps, with Teo's job 1 started, a stolen car, crashes and respawns); with `Math.random` replaced two different ways the hash is unchanged; another seed gives a different hash; 240 s of game time takes 7 to 11 s. `flow.mjs` both phases pass and match a run of the committed code (M4 done $4,050 both; the "$3,350" in its header comment is out of date, the real figure is $4,050); `touch.mjs` clean; `shot.mjs` one frame 404 calls, 0.69M triangles, no errors.
- Not checked: `?agent=1&view=1` drawing (6b), 6a on any machine but this one, the pinned `__weather` and `__phase` in human mode (code path unchanged, not re-run). The Wasted and Busted respawn needs 0.8 s of game time in the dead state (`failT > 0.8`), so the `respawn` action must wait that long; 6b should return an error before then.

### Part 6b: The arcade adapter (`window.arcade`), no benchmark entry yet

**Scope.** `<script src="../arcade.js">` before the game script; `Arcade.register({...})` with `id: 'rustwater-havoc'`, `benchmarks`, `actions`, `start`, `ready`, `over`, `score`, `observe`, `text`, `stats`, `apply`.
- `apply(action)`: parse `verb [n]`, set the key state for n × 5 `simStep(0.05)` calls, release, return true; unknown action returns false (nothing logged).
- Over: 240 s of game time, or `state === 'over'` (0 lives). `stats`: `{jobs, fares, laps, deliveries, wrecks, busts}` plus game time.
- `observe()` and `text()` as in decision 3; keep `text` under about 2,500 characters.
- Rendering: in agent mode the loop draws only when `?view=1`, after an action (or on a 1 s timer), never while `Arcade.replaying` with `speed=0`. The title screen is skipped: agent mode starts the game itself.
- Run `Arcade.reset()` in `startGame`; `Arcade.onGameOver()` when the run ends; `Arcade.onKeyAction` unused.

**Anchors:** `function startGame`, `state` machine (`'title' | 'play' | 'dead' | 'over' | 'paused'`), `onPress` (key handling, 3484), `interact` (2745), `setTarget`/`clearTargets`, `M`, `TX`, `SAL`, `RACE_GATE`, `sigState`, `tileW`/`TILE`, `nearestCar`, `/games/arcade.js` and `games/color-stack/index.html` as the reference adapter.

**Headless tests** (extend `tools/rustwater/sim.mjs`, plus a throwaway local bench entry that is not committed): load `?agent=1&seed=20261022&bench=rust-240`; `arcade.info()` lists the actions; a scripted list of about 300 actions plays to the end; `arcade.run()` replayed with `?replay=…&speed=0` gives the same score and stats; `observe().text` has every section; a random-action bot never throws; `window.arcade.act` before `ready` returns an error; a drive-by of each job type through real actions (`enter` at a phone, Bridge Run, taxi duty, Sal) where reachable, with the rest covered by `__rustwater` teleports in a separate non-recorded check.

**Done when:** a 240 s random run and a scripted run both finish through the public API only; replay through `verify.mjs`'s logic (page load, `?replay`, `data-replay-done`) matches; the human page without `?agent=1` is unchanged (`flow.mjs`).

**Part 6b built 2026-11-25 (on the branch, not committed).**
- `index.html` loads `../arcade.js` before the module; `AGENT` is `Arcade.agent` (`?agent=1`, or any `?replay=`); `SEED` comes from `Arcade.seed`, and `startGame` re-reads it (a replay reseeds after load). The adapter is registered only when `AGENT`, so the human page has no `window.arcade` and no banner.
- Adapter at the end of the module (`// ---------- Agent mode`): `agentApply` (regex over `up|down|left|right|handbrake` joined by `+`, `wait`, `enter`, `respawn`, optional `n` 1 to 40; unknown, `up+down`, `left+right`, a repeated key, `n` out of range, `enter` or `respawn` with `n`, `enter` when not playing, `respawn` when not dead, and anything after the end are refused and not logged), `agentSteps` (5 steps of 0.05 s per unit, stops the moment the run is over), `agentView` (the JSON) and `agentText` (about 1.9 KB), `BENCHES['rust-240'] = { seconds: 240 }`.
  Over = 4,800 steps, or `state === 'over'`, or dead with 0 lives. `respawn` runs the dead state on until `failT > 0.8`, presses R, then one unit. Keys are the arrow codes and Space; real keyboard and touch input are ignored in agent mode.
- `observe()`: seconds and seconds left, lives, health, stars and whether the police see you, weather and wet, clock, mayhem; position and tile; car (type, speed, heading in degrees and compass, fire); the job (id, name, objective, time, counting up or down); targets with dx/dz in tiles, distance in metres and compass bearing (beams, scrap crates not yet taken); taxi duty; Sal's list and the garage; the Bridge Run banner (when no job); phones (when no job); the 6 nearest signals with north-south and east-west states; 8 nearest cars and 6 people; the events since the last action (toasts and banners, `EV`); `stats`; and a 31 × 19 tile map (`, . = # " ~ :` plus `@ X S P o c t B p *`). North is up, dx east, dz south.
- Stats for `arcade.run()` (all deterministic integers): `steps, jobs, laps, fares, deliveries, busts, wipeouts, lives` (new `STAT` counters; `toast`/`flashBanner` also feed `EV`). In agent mode toasts skip the DOM unless drawing, and no `localStorage` is written.
- Drawing: `VIEW` is false by default in agent mode, `?view=1` turns it on, and a replay with `speed` above 0 turns it on by itself. In view mode the loop only draws; the HUD timers (banner) do not tick between actions.
- **Results:** new `tools/rustwater/agent.mjs` passes: a bot (walks to a phone, steals a car, random moves, respawns) plays a full 240 s run in 415 to 419 actions through `arcade.act` only (score 100, one wipeout), the report is offered, an action after the end is refused, and the saved run replayed with `?replay=...&speed=0` gives the same score, stats and action count (10 to 16 s). `sim.mjs` still passes; `flow.mjs` both phases pass with the same figures (M4 $4,050); the `view=1` page draws without errors.
- Not done in 6b, by design: no `benchmarks.json` entry (the replay test writes a temporary run file under `data/runs/` and removes it), no baseline run, no landing card, docs or listing (all 6c). Not covered by the bot: taxi duty, the Bridge Run and Sal through real actions (flow.mjs covers them by teleport in human mode; an agent can still do them, nothing is blocked).
- Open question for 6c: a random bot scores about $100, as expected, so a baseline with some intent (walk to the phone, steal a car, drive to the target dx/dz) would be more useful as the first official run than `random`.

### Part 6c: Benchmark, recorder, verify, listing

**Scope.**
- `data/benchmarks.json`: entry `rustwater-havoc/rust-240` (seed 20261022, title, rules text from decision 2).
- A baseline: `node tools/agents/run.mjs random rustwater-havoc/rust-240` (its output is a recorded run), and optionally a small heuristic that drives toward the mission target using `observe()`'s dx/dz. Keep it honest in `harness`/`notes`.
- `node tools/verify.mjs` against the repo server (8765) passes locally; push the branch to check the **GitHub Actions verify job** (the cross-machine float risk and plain `chromium.launch()`) before anything goes live. Do not push to origin without the user's say-so.
- `node tools/build-index.mjs`, then the listing: landing card `agent: true` (and the card footer), `llms.txt`, `agents.md` (the "agent-ready today" paragraph, the "start here" link, an actions table for Rustwater, the note that humans do not play the benchmark yet), the game README (the "Human-only" line, a short "Agent mode" section), `docs/harbor-city-agent-mode.md` (one line: Rustwater did it), the memory note.
- Deploy only when told: `deploy.sh` (untracked; no untracked files in the tree), then `tools/rustwater/live.mjs` plus a check of `…/?agent=1&seed=20261022&bench=rust-240` on the live site.

**Anchors:** `data/benchmarks.json`, `tools/agents/run.mjs`/`random.mjs`/`bridge.mjs`, `tools/verify.mjs`, `tools/build-index.mjs`, `index.html` (the `rustwater-havoc` entry near line 566, the series strip), `llms.txt` (line 19), `agents.md` (header paragraph and "start here").

**Headless tests:** `node tools/verify.mjs data/runs/rustwater-havoc/rust-240/*.json` (the run replays to the same score and stats); `node tools/smoke.mjs` (landing card and discovery files); `npm test` in `tools/`; the CI run above; `live.mjs` after the deploy.

**Done when:** a recorded run verifies locally and on CI, the index is rebuilt (`build-index.mjs --check` clean), the landing card says agent-ready, the docs are updated, and (after a deploy the user asks for) the live agent URL works.

**Why three parts and not two.** The plan's (a) put the seed, the fixed step and the arcade API together. The audit shows the first two are the hard, risky part (the simulation is tangled with drawing, and about 55 random sites need converting), and the arcade API is a separate chunk of design (the text view). Splitting them lets 6a be proven with hashes before any API depends on it, and 6a can ship on its own (it changes no behaviour for humans).
If 6a goes fast, 6b can follow in the same sitting.

---

## Not planned as sessions

- **Push to origin:** whenever the user says so.
- **Real-GPU tuning:** once the user reports fps on a real machine, adjust the `QUALITY` thresholds
  and the `perfWatch` step-down (26 ms average over 4 s).
