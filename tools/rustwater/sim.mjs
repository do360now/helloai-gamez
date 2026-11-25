// Determinism checks for agent mode (plan session 6a). Serves on 8799, SwiftShader, no drawing (?agent=1 without view=1).
//   node tools/rustwater/sim.mjs
// Expected: every line prints ok; "ERRORS" is empty.
import { serve, launch, watchErrors } from './lib.mjs';
const srv = await serve({ hooks: false }), browser = await launch();
const base = 'http://127.0.0.1:8799/games/rustwater-havoc/';
let bad = 0; const ok = (name, cond, extra = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + name + ' ' + extra); if (!cond) bad++; };

// One run: seed, optional Math.random replacement, a scripted drive for `steps` ticks. Returns hashes and timing.
async function run(seed, rnd, steps = 4800) {
  const page = await browser.newPage(); const errs = watchErrors(page);
  await page.goto(`${base}?agent=1&seed=${seed}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__rustwater, null, { timeout: 60000 });
  const r = await page.evaluate(({ rnd, steps }) => {
    if (rnd) { let a = rnd; Math.random = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
    const g = window.__rustwater, out = { marks: [] }; g.startGame();
    const t0 = performance.now();
    // a fixed script: answer Teo's phone on foot (job 1 starts), then steal the nearest car with E and drive a pattern
    g.player.x = 215; g.player.z = 125; g.tick(0.05); g.press('KeyE'); g.tick(0.05);
    const near = g.cars.filter(c => !c.wreck).sort((a, b) => Math.hypot(a.x - g.player.x, a.z - g.player.z) - Math.hypot(b.x - g.player.x, b.z - g.player.z))[0];
    g.player.x = near.x + 2.3; g.player.z = near.z; g.tick(0.05); g.press('KeyE'); g.tick(0.05);
    out.inCar = !!g.player.car; out.job = g.M.active && g.M.active.id;
    for (let i = 0; i < steps; i++) {
      const ph = Math.floor(i / 40) % 6;
      g.keys.ArrowUp = ph !== 4; g.keys.ArrowDown = ph === 4; g.keys.ArrowLeft = ph === 1 || ph === 3; g.keys.ArrowRight = ph === 5; g.keys.Space = ph === 3;
      g.tick(0.05);
      if (g.state === 'dead') { g.press('KeyR'); out.deaths = (out.deaths || 0) + 1; }
      if (i % 1200 === 1199) out.marks.push(g.stateHash());
    }
    out.ms = performance.now() - t0; out.hash = g.stateHash(); out.state = g.state; out.score = g.score; out.time = g.time;
    return out;
  }, { rnd, steps });
  r.errs = errs; await page.close(); return r;
}
const a = await run(20261022, 0), b = await run(20261022, 0);
ok('same seed twice: same hashes', a.hash === b.hash && JSON.stringify(a.marks) === JSON.stringify(b.marks), a.hash);
const c = await run(20261022, 12345), d = await run(20261022, 987654321);
ok('Math.random replaced (two ways): same hash as the plain run (nothing gameplay reads it)', c.hash === a.hash && d.hash === a.hash, `${c.hash} ${d.hash}`);
const e = await run(7, 0);
ok('different seed: different hash', e.hash !== a.hash, e.hash);
ok('4800 steps (240 s) in a reasonable time', a.ms < 60000, `${Math.round(a.ms)} ms, game time ${a.time.toFixed(1)} s, state ${a.state}, inCar ${a.inCar}, job ${a.job}, deaths ${a.deaths || 0}`);
console.log('ERRORS', [...a.errs, ...c.errs, ...e.errs].slice(0, 5).join('\n'));
await browser.close(); srv.close(); process.exit(bad ? 1 : 0);
