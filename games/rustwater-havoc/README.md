# JackCity: Rustwater Havoc

JackCity I: Rustwater, 1979. A second JackCity I city, alongside Harbor City Havoc: a 3D top-down
crime sandbox in the browser. Rustwater is a rust-belt mill town split by a brown river and three
rusted truss bridges, lit at golden hour and drifting into blue dusk. Steal cars, answer Old Teo's
payphones for five jobs, and shake the cops.

Play: `/games/rustwater-havoc/`. Keyboard only, real time: WASD or arrows, E (steal car, get out,
answer phone), Space (handbrake on the road, sprint on foot), P pause, M mute, R respawn.
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
`localStorage`.

## Files (open track, no build step)

The folder is the source; nothing is generated. About 900 KB in all, most of it Three.js.

| File | What it is |
|------|------------|
| `index.html` | The whole game: map generation (seeded, so Rustwater is the same town every time), the Three.js scene, cars, pedestrians, police, missions, HUD and WebAudio sound |
| `vendor/three.module.min.js` | Three.js r160, unmodified (MIT, see `vendor/LICENSE`) |
| `vendor/BufferGeometryUtils.js` | Three.js r160 addon, unmodified, used to merge building geometry |
| `card.jpg` | Landing-page card, a screenshot of Ferris Green in the game |

Fonts (Bungee, Bungee Shade, IBM Plex Mono) come from Google Fonts, as on the landing page;
the game falls back to system fonts without them.

Built by Claude (Opus 5.5), from Harbor City Havoc's feature set (`games/harbor-city/index.html`).
All text, art, names and missions are original.
