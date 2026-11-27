// Agent-mode checks for Harbor City Havoc (games/harbor-city). Serves the repo on 8799, headless Chromium.
//   cd tools && node harbor/check.mjs
// Expected: every line prints ok; ERRORS is empty. A temporary run file is written under data/runs/ and removed again.
//
// Human checks patch the served page for that one page only (page.route), adding window.__hp to read the player's
// position. Agent checks use window.arcade, plus window.__harbor.stateHash(), which the game exposes in agent mode only:
// a fingerprint of the whole city, because observe() only shows the area around the player.
import { serve, chromium, watchErrors } from '../rustwater/lib.mjs';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';

const SEED = 20261022;
const BASE = 'http://127.0.0.1:8799/games/harbor-city/';
const AGENT = `${BASE}?agent=1&seed=${SEED}&bench=city-240`;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const REL = 'data/runs/harbor-city/city-240/zz-check.json';

// Plain Chromium, not lib.mjs launch(): its SwiftShader GL flags drop this 2D canvas game to about 0.5 fps.
const srv = await serve({ hooks: false }), browser = await chromium.launch();
let bad = 0, n = 0;
const ok = (name, cond, extra = '') => { n++; console.log(`${String(n).padStart(2)} ${cond ? 'ok   ' : 'FAIL '}${name} ${extra}`); if (!cond) bad++; };
const allErrs = [];

async function open(url, { viewport = { width: 1280, height: 720 }, rnd = 0, humanHook = false } = {}) {
  const page = await browser.newPage({ viewport });
  const errs = watchErrors(page); page.__errs = errs;
  if (rnd) await page.addInitScript(a => { Math.random = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }, rnd);
  if (humanHook) {
    await page.route(u => u.pathname === '/games/harbor-city/', async route => {
      const res = await route.fetch(); let body = await res.text();
      body = body.replace('  requestAnimationFrame(frame);\n})();', '  window.__hp = () => ({ x: (player.inCar || player).x, y: (player.inCar || player).y, started: gameStarted });\n  requestAnimationFrame(frame);\n})();');
      await route.fulfill({ response: res, body });
    });
  }
  await page.goto(url, { timeout: 120000 });
  return page;
}
const done = async page => { allErrs.push(...page.__errs); await page.close(); };

// ---- human play: no parameters, and ?bench= without ?agent=1 -------------------------------------------------
async function humanDrive(url) {
  const page = await open(url, { humanHook: true });
  await page.waitForFunction(() => window.__hp, null, { timeout: 30000 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => window.__hp());
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1000); await page.keyboard.up('KeyW');
  const b = await page.evaluate(() => window.__hp());
  const banner = await page.$('#arcade-banner'), hook = await page.evaluate(() => !!window.__harbor);
  await done(page);
  return { a, b, banner: !!banner, hook, errs: page.__errs };
}
{
  const h = await humanDrive(BASE);
  ok('human: Enter starts, holding W moves the player', h.b.started && Math.hypot(h.b.x - h.a.x, h.b.y - h.a.y) > 5, `(${h.a.x | 0},${h.a.y | 0}) -> (${h.b.x | 0},${h.b.y | 0})`);
  ok('human: no arcade banner, no test hook, no page errors', !h.banner && !h.hook && h.errs.length === 0, h.errs.slice(0, 2).join(' | '));
  const hb = await humanDrive(BASE + '?bench=city-240');
  ok('bench-human: ?bench=city-240 without agent still plays in real time', hb.b.started && Math.hypot(hb.b.x - hb.a.x, hb.b.y - hb.a.y) > 5, `(${hb.a.x | 0},${hb.a.y | 0}) -> (${hb.b.x | 0},${hb.b.y | 0})`);
}

// ---- agent mode: info, still, reject, unit, text ------------------------------------------------------------------
const ready = page => page.waitForFunction(() => window.arcade && window.arcade.observe().ready, null, { timeout: 60000 });
{
  const page = await open(AGENT); await ready(page);
  const info = await page.evaluate(() => arcade.info());
  ok('info: at least 8 actions and a 240 s benchmark', Object.keys(info.actions).length >= 8 && info.benchmark && info.benchmark.seconds === 240, `${Object.keys(info.actions).length} actions`);
  const s1 = await page.evaluate(() => arcade.observe()); await page.waitForTimeout(500);
  const s2 = await page.evaluate(() => arcade.observe());
  ok('still: the world does not move between actions', s1.seconds === 0 && s2.seconds === 0 && JSON.stringify(s1.at) === JSON.stringify(s2.at) && JSON.stringify(s1.world) === JSON.stringify(s2.world));
  const rej = [];
  for (const a of ['up 41', 'up+down', 'enter 2', 'fly', '', 'left+right', 'up 0']) {
    const r = await page.evaluate(x => arcade.act(x), a);
    if (r.ok !== false || r.seconds !== 0) rej.push(JSON.stringify(a));
  }
  ok('reject: bad actions are refused and the clock does not move', rej.length === 0, rej.join(' '));
  const u = await page.evaluate(() => arcade.act('wait 4'));
  ok('unit: wait 4 moves the clock by 1 s', u.ok !== false && u.seconds === 1, `seconds ${u.seconds}`);
  const t = u.text || '';
  ok('text: under 3000 chars, header line, payphones, map', t.length < 3000 && t.startsWith(`harbor-city city-240 seed ${SEED}`) && t.includes('payphones:') && t.includes('map ('), `${t.length} chars: ${t.split('\n')[0]}`);
  await done(page);
}

// ---- determinism: a full 240 s scripted run, hashed every 60 s -----------------------------------------------------
// Two scripts. 'bot': walk to the nearest car and get in, then pseudo-random driving from a fixed LCG, respawning when
// it can (with this seed it spends all 3 chances: the GAME OVER ending). 'wait': stand still for the full 240 s while
// the rest of the city moves (the TIME UP ending). Both hash the whole city every 20 s of game time.
async function scripted(mode, opts = {}) {
  const page = await open(AGENT, opts); await ready(page);
  const t0 = Date.now();
  const r = await page.evaluate(async (mode) => {
    let a = 1234567; const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    const MOVES = ['up 4', 'up 6', 'up+left 2', 'up+right 2', 'down 2', 'handbrake 1', 'up+left+handbrake 3', 'wait 2', 'enter', 'left 2', 'right 2', 'punch'];
    const step = p => Math.abs(p.dx) > Math.abs(p.dy) ? (p.dx > 0 ? 'right 1' : 'left 1') : (p.dy > 0 ? 'down 1' : 'up 1');
    let obs = arcade.observe(), k = 0, rejected = 0; const marks = [];
    let nextMark = 20;
    while (!obs.over && k < 3000) {
      let act;
      if (mode === 'wait') act = 'wait 40';
      else if (obs.can.respawn) act = 'respawn';
      else if (k < 80 && !obs.inCar) {
        const c = obs.world.cars.find(o => o.kind !== 'wreck');
        act = !c ? 'wait 1' : obs.can.enterCar && c.dist < 1.5 ? 'enter' : step(c);
      } else act = MOVES[Math.floor(rnd() * MOVES.length)];
      obs = await arcade.act(act); k++; if (obs.ok === false) rejected++;
      while (obs.seconds >= nextMark) { marks.push(window.__harbor.stateHash()); nextMark += 20; }
    }
    const run = arcade.run();
    return { marks, hash: window.__harbor.stateHash(), run, obs: { seconds: obs.seconds, over: obs.over, chancesLeft: obs.chancesLeft, text0: obs.text.split('\n')[0], report: obs.report }, rejected, k,
      late: (await arcade.act('wait 1')).ok };
  }, mode);
  r.ms = Date.now() - t0; await done(page); return r;
}
const same = (x, y) => x.hash === y.hash && JSON.stringify(x.marks) === JSON.stringify(y.marks);
const A = await scripted('bot'), B = await scripted('bot');
ok('determinism (bot): same seed and script twice give the same city hash every 20 s', same(A, B) && A.marks.length >= 3, `${A.marks.length} marks, final ${A.hash}`);
ok('determinism (bot): same score and stats', A.run.score === B.run.score && JSON.stringify(A.run.stats) === JSON.stringify(B.run.stats), `score ${A.run.score} ${JSON.stringify(A.run.stats)}, ${A.k} actions, ${A.ms} ms`);
const W = await scripted('wait'), W2 = await scripted('wait');
ok('determinism (wait): the full 240 s gives the same city hash every 20 s', same(W, W2) && W.marks.length === 12, `${W.marks.length} marks, final ${W.hash}, ${W.ms} ms`);
const C = await scripted('bot', { rnd: 12345 }), D = await scripted('wait', { rnd: 987654321 });
ok('Math.random replaced two ways: same hashes (no gameplay reads it)', same(C, A) && same(D, W), `${C.hash} ${D.hash}`);
const V1 = await scripted('bot', { viewport: { width: 800, height: 600 } }), V2 = await scripted('wait', { viewport: { width: 1920, height: 1080 } });
ok('viewport 800x600 and 1920x1080: same hashes (no gameplay reads the screen)', same(V1, A) && same(V2, W), `${V1.hash} ${V2.hash}`);
ok('no scripted action was refused', A.rejected === 0 && W.rejected === 0, `${A.rejected + W.rejected} refused`);
const hashAt10 = async seed => { const page = await open(`${BASE}?agent=1&seed=${seed}&bench=city-240`); await ready(page); await page.evaluate(() => arcade.act('wait 40')); const h = await page.evaluate(() => window.__harbor.stateHash()); await done(page); return h; };
const E7 = await hashAt10(7), E0 = await hashAt10(SEED);
ok('a different seed gives a different city (both hashed at 10 s)', E7 !== E0, `seed 7 ${E7}, seed ${SEED} ${E0}`);

// ---- end: the run stops on chances (GAME OVER) or at 240 s (TIME UP), and refuses actions afterwards ---------------
ok('end (bot): GAME OVER before 240 s once all 3 chances are spent', A.obs.over && A.obs.chancesLeft <= 0 && A.obs.seconds < 240 && A.obs.text0.includes('GAME OVER'), `${A.obs.seconds} s, "${A.obs.text0}"`);
ok('end (wait): TIME UP at exactly 240 s', W.obs.over && W.obs.seconds === 240 && W.obs.text0.includes('TIME UP'), `${W.obs.seconds} s, "${W.obs.text0}"`);
ok('end: acting after the end is refused, and a report is offered', A.late === false && W.late === false && !!(A.obs.report && A.obs.report.say), A.obs.report && A.obs.report.say.slice(0, 70));

// ---- replay: what tools/verify.mjs does ---------------------------------------------------------------------------
{
  const run = A.run;
  run.player = { id: 'zz-check', name: 'check', kind: 'agent', model: null, harness: 'test', notes: '' }; run.date = '2026-01-01';
  await mkdir(path.dirname(path.join(ROOT, REL)), { recursive: true });
  await writeFile(path.join(ROOT, REL), JSON.stringify(run));
  try {
    const page = await open(`${BASE}?replay=${REL}&speed=0`);
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-replay-done') || document.documentElement.hasAttribute('data-arcade-error'), null, { timeout: 170000 });
    const got = await page.evaluate(() => window.arcade.run());
    ok('replay (speed 0): same score, stats and action count', got.score === run.score && JSON.stringify(got.stats) === JSON.stringify(run.stats) && got.actions.length === run.actions.length && got.over, `score ${got.score}, ${JSON.stringify(got.stats)}`);
    await done(page);
  } finally { await rm(path.join(ROOT, REL), { force: true }); }
}

console.log('ERRORS', allErrs.slice(0, 5).join('\n'));
await browser.close(); srv.close(); process.exit(bad || allErrs.length ? 1 : 0);
