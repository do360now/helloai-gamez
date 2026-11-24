# JackCity: Rustwater Havoc

JackCity I: Rustwater, 1979. A second JackCity I city, alongside Harbor City Havoc: a 3D top-down
crime sandbox in the browser. Rustwater is a rust-belt mill town split by a brown river and three
rusted truss bridges, lit at golden hour and drifting through blue dusk into night and back. Steal cars, answer Old Teo's
payphones for five jobs, and shake the cops.

Play: `/games/rustwater-havoc/`. Real time. Keyboard: WASD or arrows, E (steal car, get out,
answer phone), Space (handbrake on the road, sprint on foot), P pause, M mute, R respawn,
Q graphics quality (high, medium, low).

Touch (phones and tablets, turned on by the first touch): a floating stick on the left half walks,
or in a car steers sideways and drives with an up or down push. On the right are GAS, BRAKE
(brake and reverse), DRIFT (sprint on foot) and E, which pulses and names the action when one is
in reach. The II button pauses, and the pause screen has resume, sound and graphics buttons.
After Wasted or Busted, a tap anywhere carries on.
Human-only: there is no `window.arcade`, no seeded benchmark and no agent mode, the same as
`harbor-city`.

## Missions

1. **The Mill Pickup**: package from the Mill loading bay to Sal's Garage, across the river.
2. **Three Bridges**: 8 checkpoints in a car, all three bridges included; each one adds time.
3. **Scrap Season**: four crates of copper wire around town, then drop them at Scrap Kings.
4. **The Copper Penny**: steal the copper coupe in Glasshill (2 stars on the spot) and deliver
   it to Sal's above 50% health.
5. **Rustwater Heat**: reach 3 stars, then lose every cop. Sal's respray is shut for this one.

After all five the phones keep ringing for half pay. Also in the game: a 5-star wanted level,
Busted / Wasted with 3 lives, a $250 respray at Sal's, drift and near-miss bonuses, a mayhem
multiplier, knock-down street lamps, cars that burn and explode, and a best score kept in
`localStorage`. The river flows east under the bridges, with foam at the quay walls and piers,
barges with bow waves and wakes, a moored tug and drifting junk.

## Day and night

A full day runs 10 minutes: golden hour, blue dusk, night (from about 4:30 to 7:00 of the cycle), dawn,
then golden hour again. A small clock under the health bar shows the time (golden hour is 6:30 PM,
night is about midnight to 3 AM). At night the streets are carried by street lamps, windows that light
up one by one (a few flicker TV blue), brighter neon signs (two buzz), car headlights with beams and
ground pools, and a cool moonlight. The sun's shadow pass is switched off at night, which also makes it
the cheapest part of the cycle. Tests can pin the time with `window.__phase` (0 golden, 0.25 dusk, 0.5
night, 0.85 dawn).

## Weather

The weather changes by itself, on a timer of a few minutes per state: clear, overcast, rain, clearing, and
sometimes a leaf storm. Rain falls as streaks with splashes and rings on the river, the sky greys and the fog
closes in, roads go dark and glossy, and puddles and wet asphalt mirror lamps, windows and neon. Rain hisses
(muffled inside a car), wet roads give less grip and longer slides, a thin mist hangs over the river (also
at dawn), and in a leaf storm autumn leaves blow across town and the trees thrash. The clock shows RAIN,
OVERCAST or WINDY. Tests can pin the weather with `window.__weather` (`'clear'`, `'overcast'`, `'rain'`,
`'clearing'`, `'storm'`).

## Files (open track, no build step)

The folder is the source; nothing is generated. About 900 KB in all, most of it Three.js.

| File | What it is |
|------|------------|
| `index.html` | The whole game: map generation (seeded, so Rustwater is the same town every time), the Three.js scene, cars, pedestrians, police, missions, HUD and WebAudio sound |
| `vendor/three.module.min.js` | Three.js r160, unmodified (MIT, see `vendor/LICENSE`) |
| `vendor/BufferGeometryUtils.js` | Three.js r160 addon, unmodified, used to merge building geometry |
| `vendor/addons/` | Three.js r160 post-processing addons, unmodified: EffectComposer, RenderPass, ShaderPass, MaskPass, UnrealBloomPass, OutputPass and their shaders |
| `card.jpg` | Landing-page card, a screenshot of Ferris Green in the game |

## Graphics quality

Rain: about 3000 streaks on high, 1500 on medium and 800 on low. The wet-ground mirror (a second scene pass,
only while the ground is wet) is 40% of the screen size on high, a quarter every other frame on medium, and off on low.

Night effects (window flicker, headlight ground pools, buzzing signs) are on high and medium, off on low;
windows still light up in sequence on every level.

High: 2048 shadows, HDR bloom, a film grade (vignette, split tone, grain), 4x MSAA, and river
reflections at half resolution (drawn only while the river is on screen).
Medium: 1024 shadows updated every other frame, half-resolution bloom, 2x MSAA, river
reflections at a third of the resolution every other frame, fewer pedestrians and cars. Low: no shadows, no post-processing, no river reflections, a lighter ground texture.
The game starts on high (medium on touch devices). If frames stay slower than about 38 fps
for a few seconds, it steps down by itself. Pressing Q picks a level by hand, and that
choice is kept in `localStorage`.

Fonts (Bungee, Bungee Shade, IBM Plex Mono) come from Google Fonts, as on the landing page;
the game falls back to system fonts without them.

Built by Claude (Opus 5.5), from Harbor City Havoc's feature set (`games/harbor-city/index.html`).
All text, art, names and missions are original.
