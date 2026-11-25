# JackCity: Rustwater Havoc

JackCity I: Rustwater, 1979. A second JackCity I city, alongside Harbor City Havoc: a 3D top-down
crime sandbox in the browser. Rustwater is a rust-belt mill town split by a brown river and three
rusted truss bridges, lit at golden hour and drifting through blue dusk into night and back. Steal cars, answer Old Teo's
payphones for five jobs, and shake the cops.

Play: `/games/rustwater-havoc/`. Real time. Keyboard: WASD or arrows, E (steal car, get out,
answer phone), Space (handbrake on the road, sprint on foot), T radio station (in a car: off, WRST 1979,
Mill Town Blues, KTEO talk), P pause, M mute, R respawn, Q graphics quality (high, medium, low).

Touch (phones and tablets, turned on by the first touch): a floating stick on the left half walks,
or in a car steers sideways and drives with an up or down push. On the right are GAS, BRAKE
(brake and reverse), DRIFT (sprint on foot), RADIO (in a car: next station) and E, which pulses and names the
action when one is in reach. The II button pauses, and the pause screen has resume, sound and graphics buttons.
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

## Cars and sound

**Damage.** A hit dents the car where it landed: the body and trim near the impact are tessellated and pushed in (at most
0.3 m from where they started), so wall hits, side swipes and car-to-car crashes each leave their own crumple. Below half
health the glass cracks, a heavy side hit can knock a hubcap off (it bounces and rolls, at most 8 at once, gone after 6 s,
leaving a bare rusty hub), and a wreck loses its glass. A respray at Sal's repairs all of it.
**Skid marks.** Handbrake turns, slides and hard braking above 12 m/s leave a pair of dark marks at the rear wheels
(one instanced draw call, a ring of 800 on high, 500 on medium, 300 on low; they fade over a minute).
**Engines.** Every car type has its own voice: the sedan hums, the coupe rasps, the sport car screams higher, the van and
pickup grumble, the taxi clatters and the police car is deep. Pitch climbs through four gears and drops at each shift.
**Radio.** Three original stations, synthesized live with WebAudio (no samples): WRST 1979 (funk, a seeded step
sequencer with bass, drums and stabs), Mill Town Blues (a slow 12-bar blues with a walking bass and a plucked lead) and
KTEO talk (static, a station jingle, garbled "announcer" speech, time pips and tuning squeals). T or the RADIO button
cycles them, a small line under the clock names the station, and the choice is kept in `localStorage`
(`rustwater-radio`). It plays only in a car and fades out when you get out, sirens duck it, and M mutes it with
everything else. Nothing is audible in the headless tests, so the sound design is untested by ear.

## More jobs

Teo's five jobs are not the only things to do. Side jobs share the one-job-at-a-time slot, so the phones stay quiet while one runs.
**Bridge Run.** Drive south through the checkered banner at the north foot of the west bridge (any car). It starts a lap
over all three bridges and back through the banner; each checkpoint is a green beam, the clock counts up, and the pay falls
with the time ($1,100 for 50 s down to $300). The best lap is kept in `localStorage` (`rustwater-race`). Leaving the car or
taking over 4 minutes fails it.
**Taxi duty.** In a taxi, stopped, press E (the touch E button says "Taxi duty") to go on duty; press E again to get out, which
ends it. People at the kerb wave an arm and show a yellow beam; stop next to one to pick them up, then drive to the
destination beam across town. A fare is $20 plus $0.28 a metre, plus up to half again as a tip for being quick, minus
damage to the car; being too slow loses the fare and the streak, and ten fares in a row pay $500. Two stars, a wreck or
leaving the car end duty.
**Sal's list.** A board near Sal's Garage (and a line under the clock when you are near it, or in a car he wants) lists three
wanted models, with the price for each; one changes every 2.5 minutes. Drive one in to the garage and stop: you are paid by
type and health (35 to 100 per cent of the price). Police cars pay most ($1,200) and bring a star; a bus pays $900.

## Busier streets

**Traffic lights.** The twelve 4-way junctions on the three bridge avenues have signals: poles with a head on each side, a
25 s cycle (9 s green, 2 s amber, 1.5 s all red, then the other way) and a position offset so lights down an avenue come on
a little apart. Stop bars are painted before the crosswalks. Traffic, taxis, trucks and buses brake to the bar on red or on an
amber they can stop for, and queue behind each other; police ignore the lights. Running a red light with a cop within
40 m adds a little heat (and a "Ran a red light" toast). The lights work at night and reflect in wet roads.
**People.** Walkers stop at the kerb before crossing: near a signal they wait for red for the cars, elsewhere for a gap in
the traffic. Some people sit on the park benches (they get up and run if the bench is knocked over), and people wait at the
bus stops.
**Bus line.** Two Rustwater Transit buses (cream with a rust stripe, about 11 m long) run a 960 m loop over two bridges, stopping
at three shelters (a bench, a sign, a glass back). At a stop the people waiting walk to the door and climb in, and some
passengers climb out. The loop takes about 2.5 minutes. You can steal a bus: it is slow, heavy and tough (420 health).
**Delivery trucks.** Merridew Freight box trucks drive with the traffic, and a couple are parked at the kerb with their hazard
lights flashing. Long vehicles use five collision circles, so a bus or truck is hit along its whole length.

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

Traffic lights, bus stops and shelters are on all levels (a few instanced draws); the number of walkers follows the Peds count of each level and
the sitters and people at bus stops are on top of that (up to about 14).

Skid marks: a ring of 800 on high, 500 on medium, 300 on low. Dents, cracked glass and hubcaps are on every level.

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
