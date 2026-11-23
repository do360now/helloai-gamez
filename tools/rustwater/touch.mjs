// Touch controls check on an emulated phone.
//   node tools/rustwater/touch.mjs <outdir> [--portrait]
// Expected: touch class true, "TAP TO PLAY"; the stick moves the player; E shows "Get in" and enters a car;
// holding GAS raises speed; stick left turns the car (angle change > 0); pause / graphics / resume respond; no errors.
import { serve, launch, watchErrors, URL_GAME } from './lib.mjs';
const out = (process.argv[2] || '.').replace(/\/$/, ''), portrait = process.argv.includes('--portrait');
const srv = await serve({ hooks: false }), browser = await launch();
const ctx = await browser.newContext({ viewport: portrait ? { width: 390, height: 844 } : { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const page = await ctx.newPage(); const errs = watchErrors(page);
const W = ms => page.waitForTimeout(ms);
const tap = sel => page.tap(sel, { force: true, timeout: 180000 });
await page.goto(URL_GAME, { timeout: 180000 }); await W(8000);
console.log('touch class', await page.evaluate(() => document.body.classList.contains('touch')), '| go:', await page.textContent('#goBtn'));
await tap('#goBtn'); await W(6000);
const G = () => page.evaluate(() => { const r = window.__rustwater, p = r.player; return JSON.stringify({ state: r.state, x: +p.x.toFixed(1), z: +p.z.toFixed(1), car: !!p.car, spd: p.car ? +p.car.speed.toFixed(1) : 0 }); });
console.log('start', await G());
const cdp = await ctx.newCDPSession(page);
const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
await tp('touchStart', [{ x: 120, y: 300, id: 1 }]); await tp('touchMove', [{ x: 120, y: 240, id: 1 }]);
await W(5000); console.log('after stick up', await G());
await tp('touchEnd', []); await W(1500);
await page.evaluate(() => { const r = window.__rustwater, c = r.cars.find(c => !c.wreck); r.player.x = c.x + 2.5; r.player.z = c.z; });
await W(3000); console.log('act label', await page.textContent('#tAct small'));
await tap('#tAct'); await W(3000); console.log('after E', await G());
const gb = await page.$eval('#tGas', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await tp('touchStart', [{ x: gb.x, y: gb.y, id: 2 }]); await W(4000); console.log('gas held', await G());
await tp('touchStart', [{ x: gb.x, y: gb.y, id: 2 }, { x: 120, y: 300, id: 3 }]); await tp('touchMove', [{ x: gb.x, y: gb.y, id: 2 }, { x: 60, y: 300, id: 3 }]);
const a0 = await page.evaluate(() => window.__rustwater.player.car.angle); await W(3000);
console.log('steer left, angle change', (await page.evaluate(() => window.__rustwater.player.car.angle)) - a0);
await page.screenshot({ path: `${out}/touch-drive.png`, timeout: 180000 });
await tp('touchEnd', []); await W(1000);
await tap('#tPause'); await W(1500); console.log('paused', JSON.parse(await G()).state, await page.textContent('#pQual'));
await tap('#pQual'); await W(3000); console.log('quality now', await page.textContent('#pQual'));
await tap('#pResume'); await W(1500); console.log('resumed', JSON.parse(await G()).state);
console.log('errors', errs.join('\n') || 'none');
await browser.close(); srv.close();
