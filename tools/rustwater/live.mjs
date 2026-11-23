// After ./deploy.sh: checks the live game reaches play with no errors and the home page links to it.
//   node tools/rustwater/live.mjs
import { launch } from './lib.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const bad = []; page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
await page.goto('https://play.helloai.com/games/rustwater-havoc/', { timeout: 180000 }); await page.waitForTimeout(5000);
await page.keyboard.press('Enter'); await page.waitForTimeout(3000);
console.log('game state:', await page.evaluate(() => window.__rustwater && window.__rustwater.state), '| errors:', errs.join('; ') || 'none', '| bad responses:', bad.join('; ') || 'none');
await page.goto('https://play.helloai.com/'); await page.waitForTimeout(2000);
console.log('home lists it:', await page.locator('a[href="/games/rustwater-havoc/"]').count(), 'links');
await browser.close();
