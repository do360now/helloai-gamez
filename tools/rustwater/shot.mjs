// Screenshots for graphics work.
//   node tools/rustwater/shot.mjs <outdir> [--quality high|medium|low] [--phase 0.5 | --dusk] [--weather clear|overcast|rain|clearing|storm] [--at x,z] [--size 1200x675]
//        [--view name=px,py,pz,tx,ty,tz ...]
// Always writes <outdir>/game.png (the normal game camera around the player, HUD hidden). Each --view adds
// <outdir>/<name>.png from a fixed camera. Prints draw calls at the game camera and any page errors.
// Useful views: river=165,22,222,190,-2,262  bridge=240,26,236,275,-2,270  mill=110,30,330,70,25,373  park=240,10,190,225,2,150
import { serve, launch, watchErrors, camExpr, URL_GAME } from './lib.mjs';
const args = process.argv.slice(2), out = (args[0] || '.').replace(/\/$/, '');
const opt = (k, d) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : d; };
const views = []; args.forEach((a, i) => { if (a === '--view') { const [n, v] = args[i + 1].split('='); views.push([n, v.split(',').map(Number)]); } });
const [W, H] = opt('--size', '1200x675').split('x').map(Number), at = opt('--at', '222,163').split(',').map(Number), quality = opt('--quality', 'high');
const srv = await serve(), browser = await launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = watchErrors(page);
await page.addInitScript(q => { try { localStorage.setItem('rustwater-quality', q); } catch (e) {} }, quality);
await page.goto(URL_GAME, { timeout: 180000 }); await page.waitForTimeout(4000);
await page.keyboard.press('Enter'); await page.waitForTimeout(2000);
await page.evaluate(([x, z]) => { const g = window.__rustwater; g.player.x = x; g.player.z = z; }, at);
const phase = args.includes('--dusk') ? 0.25 : opt('--phase', null);
const weather = opt('--weather', null);
if (weather) await page.evaluate(w => { window.__weather = w; }, weather);
if (phase !== null) await page.evaluate(p => { window.__phase = +p; }, phase);
await page.waitForTimeout(5000);
await page.evaluate(() => { for (const id of ['hud', 'banner']) document.getElementById(id).style.display = 'none'; });
const shot = async (name, expr) => { await page.evaluate(expr); await page.waitForTimeout(6000); await page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 }); console.log('wrote', `${out}/${name}.png`); };
await shot('game', 'window.__camOv = null');
console.log('one frame at the game camera, all passes:', await page.evaluate(() => new Promise(res => {
  const i = window.__r.info; i.autoReset = false; i.reset();
  requestAnimationFrame(() => { const r = { calls: i.render.calls, triangles: i.render.triangles }; i.autoReset = true; res(JSON.stringify(r)); });
})));
for (const [n, v] of views) await shot(n, camExpr(...v));
console.log('errors:', errs.join('\n') || 'none');
await browser.close(); srv.close();
