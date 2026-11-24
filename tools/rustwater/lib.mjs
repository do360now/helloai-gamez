// Shared harness for the Rustwater Havoc checks: a static server on port 8799 that can patch the game
// with debug hooks, and a headless Chromium using SwiftShader (about 1 fps, so waits are long).
import { createRequire } from 'node:module';
import http from 'node:http'; import { readFile, realpath } from 'node:fs/promises'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../package.json', import.meta.url));
export const { chromium } = require('playwright');
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const URL_GAME = 'http://127.0.0.1:8799/games/rustwater-havoc/';
// Hooks added to the served page only (never to the file):
//   window.__r         the WebGLRenderer (renderer.info for draw calls)
//   window.__camOv     set to c => {...} to drive the camera yourself; null gives it back
//   window.__weather  (a game feature) 'clear' | 'overcast' | 'rain' | 'clearing' | 'storm' pins and snaps the weather
//   window.__phase     (a game feature, not a hook) a number 0 to 1 pins the day cycle: 0 golden, 0.25 dusk, 0.5 night, 0.85 dawn
const HOOKS = [
  ['const scene = new THREE.Scene();', 'const scene = new THREE.Scene(); window.__r = renderer;'],
  ['function updateCamera(dt) {', 'function updateCamera(dt) { if (window.__camOv) { window.__camOv(camera); return; }'],
];
export async function serve({ hooks = true } = {}) {
  const srv = http.createServer(async (q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    try {
      // stay inside the repo: normalise, resolve symlinks, and refuse anything that lands outside ROOT
      const real = await realpath(path.resolve(ROOT, '.' + path.posix.normalize('/' + p))).catch(() => null);
      if (!real || !(real === ROOT || real.startsWith(ROOT + path.sep))) { r.writeHead(403); return r.end(); }
      let b = await readFile(real);
      if (hooks && p.endsWith('rustwater-havoc/index.html')) { let s = b.toString(); for (const [a, c] of HOOKS) { if (!s.includes(a)) console.warn('hook anchor missing:', a); s = s.replace(a, c); } b = s; }
      const type = p.endsWith('.html') ? 'text/html' : p.endsWith('.js') || p.endsWith('.mjs') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
      r.writeHead(200, { 'content-type': type }); r.end(b);
    } catch { r.writeHead(404); r.end(); }
  });
  await new Promise(res => srv.listen(8799, '127.0.0.1', res));   // loopback only
  return srv;
}
export const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
export function watchErrors(page) {
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  return errs;
}
export const camExpr = (px, py, pz, tx, ty, tz, fov = 50) => `window.__camOv = c => { c.position.set(${px}, ${py}, ${pz}); c.lookAt(${tx}, ${ty}, ${tz}); c.fov = ${fov}; c.updateProjectionMatrix(); }`;
