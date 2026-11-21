import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(pathToFileURL(resolve(root, 'dist/index.html')).href);
await page.waitForFunction(() => !window.__sim?.loadingVisible, { timeout: 15000 });
await page.evaluate(() => { const w = window.__sim.wind; w.auto = false; w.setDirection(Math.PI); w.setSpeed(8); });
await page.waitForTimeout(4000);
await page.evaluate(() => {
  const sim = window.__sim;
  const p = sim.boat.root.position;
  sim.rig.controls.target.set(p.x, 0.6, p.z);
  sim.camera.position.set(p.x + 11, 4.2, p.z + 7);
  sim.rig.controls.update();
});
await page.waitForTimeout(1200);
await page.screenshot({ path: resolve(root, 'tools/shot-close.png') });
// 再拍一张俯瞰全景
await page.evaluate(() => {
  const sim = window.__sim;
  sim.rig.setMode('free', sim.boat.root.position, sim.camera);
});
await page.waitForTimeout(800);
await page.screenshot({ path: resolve(root, 'tools/shot-top.png') });
await browser.close();
console.log('done');
