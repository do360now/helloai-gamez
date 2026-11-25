// Agent-mode check (plan session 6b): a bot plays a full rust-240 run through window.arcade only, then the saved run is
// replayed in a fresh page with ?replay=...&speed=0 (what tools/verify.mjs does) and must give the same score and stats.
//   node tools/rustwater/agent.mjs [seed]
// Expected: every line prints ok; ERRORS is empty. The temporary run file is written under data/runs/ and removed again.
import { serve, launch, watchErrors } from './lib.mjs';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
const seed = process.argv[2] || '20261022';
const srv = await serve({ hooks: false }), browser = await launch();
const base = 'http://127.0.0.1:8799/games/rustwater-havoc/';
let bad = 0; const ok = (name, cond, extra = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + name + ' ' + extra); if (!cond) bad++; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const rel = 'data/runs/rustwater-havoc/rust-240/zz-agent-test.json';

const page = await browser.newPage(), errs = watchErrors(page);
await page.goto(`${base}?agent=1&seed=${seed}&bench=rust-240`, { timeout: 180000 });
await page.waitForFunction(() => window.arcade && window.arcade.observe().ready, null, { timeout: 60000 });
const info = await page.evaluate(() => arcade.info());
ok('info lists actions and the benchmark', Object.keys(info.actions).length >= 6 && info.benchmark && info.benchmark.seconds === 240);
let a = 1234567, rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
const MOVES = ['up 4', 'up 6', 'up+left 2', 'up+right 2', 'down 2', 'handbrake 1', 'up+left+handbrake 3', 'wait 2', 'enter', 'left 2', 'right 2'];
const stepToward = p => Math.abs(p.dx) > Math.abs(p.dz) ? (p.dx > 0 ? 'right 1' : 'left 1') : (p.dz > 0 ? 'down 1' : 'up 1');
let obs = await page.evaluate(() => arcade.observe()), n = 0, rejected = 0, textMax = 0;
const phoneSeen = /phones P/.test(obs.text);
while (!obs.over && n < 3000) {
  let act;
  if (obs.state === 'dead') act = 'respawn';
  else if (n < 20 && obs.onFoot && obs.phones.length) { const p = obs.phones[0]; act = Math.hypot(p.dx, p.dz) < 0.3 ? 'enter' : stepToward(p); }
  else if (n < 120 && obs.onFoot && obs.cars.length) { const c = obs.cars.find(o => o.kind !== 'wreck' && o.kind !== 'police'); act = !c ? 'wait 1' : Math.hypot(c.dx, c.dz) < 0.4 ? 'enter' : stepToward(c); }
  else act = MOVES[Math.floor(rnd() * MOVES.length)];
  obs = await page.evaluate(x => arcade.act(x), act); n++; if (!obs.ok) rejected++;
  textMax = Math.max(textMax, obs.text.length);
}
const run = await page.evaluate(() => arcade.run());
ok('the run reached 240 s or ended on lives', obs.over && (run.stats.steps >= 4800 || run.stats.lives <= 0), `steps ${run.stats.steps}, lives ${run.stats.lives}, ${n} actions`);
ok('a report is offered at the end', !!(obs.report && /Run over/.test(obs.report.say)), obs.report && obs.report.say.slice(0, 60));
ok('no action was rejected by the bot', rejected === 0, `${rejected} rejected`);
ok('the run did something (score, a job or a lost life)', run.score > 0 || run.stats.lives < 3 || obs.job.id !== null, `score ${run.score}, lives ${run.stats.lives}`);
ok('text view fits (under 3000 chars)', textMax < 3000 && phoneSeen, `max ${textMax}`);
const late = await page.evaluate(() => arcade.act('wait 1'));
ok('acting after the end is refused', late.ok === false);
console.log('run', JSON.stringify({ score: run.score, stats: run.stats, actions: run.actions.length }));

run.player = { id: 'zz-agent-test', name: 'test', kind: 'agent', model: null, harness: 'test', notes: '' }; run.date = '2026-01-01';
await mkdir(path.dirname(path.join(ROOT, rel)), { recursive: true });
await writeFile(path.join(ROOT, rel), JSON.stringify(run));
try {
  const p2 = await browser.newPage(); const e2 = watchErrors(p2);
  const t0 = Date.now();
  await p2.goto(`${base}?replay=${rel}&speed=0`, { timeout: 180000 });
  await p2.waitForFunction(() => document.documentElement.hasAttribute('data-replay-done') || document.documentElement.hasAttribute('data-arcade-error'), null, { timeout: 170000 });
  const got = await p2.evaluate(() => window.arcade.run());
  ok('replay (speed 0) gives the same score', got.score === run.score, `${got.score} vs ${run.score}, ${Date.now() - t0} ms`);
  ok('replay gives the same stats and action count', JSON.stringify(got.stats) === JSON.stringify(run.stats) && got.actions.length === run.actions.length && got.over, JSON.stringify(got.stats));
  errs.push(...e2);
} finally { await rm(path.join(ROOT, rel), { force: true }); }
console.log('ERRORS', errs.slice(0, 5).join('\n'));
await browser.close(); srv.close(); process.exit(bad ? 1 : 0);
