// Mission regression: plays jobs 1 to 4 by teleporting, then starts job 5 (keyboard, desktop viewport).
//   node tools/rustwater/flow.mjs
// Expected as of 2026-11-23: M1, M2, M3 and M4 each print "done" with next = 1..4 and the score rising to
// $3,350; M4 shows 2 stars; job 5 starts ("Get to 3 stars"); "police" is at least 1; ERRORS is empty.
// Then a second phase on a fresh game (since 2026-11-25): S1 a taxi fare (duty on, a person hails, boarded, paid, off duty), S2 the Bridge Run
// (start through the banner, 11 checkpoints, about +$1,100, best saved), S3 a delivery to Sal's (about +$250, on foot); ERRORS empty.
// If a mission is added or rewards change, update this script and the expectations above.
import { serve, launch, watchErrors, URL_GAME } from './lib.mjs';
const srv = await serve({ hooks: false }), browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errs = watchErrors(page);
await page.goto(URL_GAME, { timeout: 180000 }); await page.waitForTimeout(3000);
await page.keyboard.press('Enter'); await page.waitForTimeout(5000);
const W = ms => page.waitForTimeout(ms * 2.5);
const ev = f => page.evaluate(f);
const tp = (x, z) => ev(`(()=>{const g=window.__rustwater; if(g.player.car){g.player.car.x=${x};g.player.car.z=${z};g.player.car.vx=g.player.car.vz=0;} else {g.player.x=${x};g.player.z=${z};}})()`);
const mstate = () => ev(() => { const g = window.__rustwater; return JSON.stringify({ pos: [g.player.x | 0, g.player.z | 0], active: g.M.active && g.M.active.id, next: g.M.next, stage: g.M.stage, score: document.getElementById('score').textContent, obj: document.getElementById('mObj').textContent, state: g.state }); });
const inCar = () => ev(() => !!window.__rustwater.player.car);
async function ensureCar() { for (let k = 0; k < 4 && !(await inCar()); k++) { await ev(() => { const g = window.__rustwater; const c = g.cars.filter(c => !c.wreck && c.type !== 'police' && !c.mission).sort((a, b) => Math.hypot(a.x - g.player.x, a.z - g.player.z) - Math.hypot(b.x - g.player.x, b.z - g.player.z))[0]; g.player.x = c.x + 2.3; g.player.z = c.z; }); await W(1200); await page.keyboard.press('KeyE'); await W(1200); } }
async function ensureFoot() { if (await inCar()) { await ev(() => { const c = window.__rustwater.player.car; c.vx = c.vz = 0; }); await W(800); await page.keyboard.press('KeyE'); await W(1200); } }
async function phone() { await ensureFoot(); await tp(215, 125); await W(1500); await page.keyboard.press('KeyE'); await W(1500); console.log('start', await mstate()); }
await phone();
await tp(70, 400); await W(2000); console.log('M1 stage', await mstate());
await tp(460, 80); await W(2000); console.log('M1 done', await mstate());
await phone(); await ensureCar();
for (const [x, z] of await ev(() => window.__rustwater.M.cps)) { await tp(x, z); await W(1800); }
console.log('M2 done', await mstate());
await phone();
for (const [x, z] of await ev(() => window.__rustwater.M.crates.map(c => [c.x, c.z]))) { await tp(x, z); await W(1800); }
await tp(150, 470); await W(2000); console.log('M3 done', await mstate());
await phone();
const cc = await ev(() => [window.__rustwater.M.car.x, window.__rustwater.M.car.z]);
await tp(cc[0] + 2.3, cc[1]); await W(1200); await page.keyboard.press('KeyE'); await W(2000);
console.log('M4 got', await mstate(), 'stars', await ev(() => document.querySelector('#stars b').textContent));
await tp(460, 80); await W(2000); console.log('M4 done', await mstate());
await phone();
console.log('police', await ev(() => window.__rustwater.cars.filter(c => c.kind === 'police').length));
console.log('ERRORS', errs.slice(0, 10).join('\n'));

// ---- Side jobs on a fresh game: one taxi fare, the Bridge Run checkpoints, and a delivery to Sal's
errs.length = 0;
await page.goto(URL_GAME, { timeout: 180000 }); await W(1200);
await page.keyboard.press('Enter'); await W(2000);
const score = () => ev(() => document.getElementById('score').textContent);
const side = () => ev(() => { const g = window.__rustwater; return JSON.stringify({ active: g.M.active && g.M.active.id, tx: g.TX.on, stage: g.TX.stage, fares: g.TX.fares, ped: !!g.TX.ped, score: document.getElementById('score').textContent }); });
const car = (type, x, z) => ev(`(()=>{const g=window.__rustwater; for (const c of g.cars) if (c.kind!=='police') { c.x+=700; } const c=g.makeCar('${type}','#fff',${x},${z},0,'parked'); window.__sc=c; g.player.x=c.x+2.3; g.player.z=c.z; })()`);
await car('taxi', 223, 110); await W(1500); await page.keyboard.press('KeyE'); await W(2000);
console.log('S1 in taxi', await inCar()); await page.keyboard.press('KeyE'); await W(1500); console.log('S1 duty', await side());
for (let k = 0; k < 12 && !(await ev(() => !!window.__rustwater.TX.ped)); k++) await W(1500);
console.log('S1 hail', await side());
await ev(() => { const g = window.__rustwater, p = g.TX.ped; if (p) { const c = g.player.car; c.x = p.x + 3; c.z = p.z; c.vx = c.vz = 0; } }); await W(2500);
console.log('S1 boarded', await side());
await ev(() => { const g = window.__rustwater, c = g.player.car; c.x = g.TX.dest[0]; c.z = g.TX.dest[1]; c.vx = c.vz = 0; }); await W(2500);
console.log('S1 paid', await side());
await page.keyboard.press('KeyE'); await W(1500); console.log('S1 off duty, on foot', !(await inCar()), await side());
// race: drive through the banner, then hit each checkpoint in order
await car('sedan', 223, 110); await W(1500); await page.keyboard.press('KeyE'); await W(2000);
await ev(() => { const g = window.__rustwater, c = g.player.car, G = g.RACE_GATE; c.x = G[0]; c.z = G[1] - 2; c.angle = 0; c.vx = 0; c.vz = 14; c.speed = 14; }); await page.keyboard.down('KeyW'); await W(2500);
console.log('S2 race started', await side());
for (const [x, z] of await ev(() => window.__rustwater.M.cps)) { await ev(`(()=>{const c=window.__rustwater.player.car; c.x=${x}; c.z=${z}; c.vx=c.vz=0;})()`); await W(1500); }
await page.keyboard.up('KeyW');
console.log('S2 race done', await side(), 'best saved', await ev(() => localStorage.getItem('rustwater-race') !== null));
// Sal: put the car's type on the list and drive it into the garage bay
await ev(() => { const g = window.__rustwater, c = g.player.car; g.SAL.list[0] = c.type; c.x = 460; c.z = 80; c.vx = c.vz = 0; c.speed = 0; }); await W(2500);
console.log('S3 sal', await side(), 'in car', await inCar());
console.log('ERRORS', errs.slice(0, 10).join('\n'));
await browser.close(); srv.close();
