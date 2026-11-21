import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// GLTFLoader 经 fetch(new Request(dataURI)) 加载模型，拦截 Request.url 强制失败，
// 验证程序化几何体兜底（含树木 InstancedMesh 与程序化船体）
await page.addInitScript(() => {
  const of = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (String(url).startsWith('data:model/gltf-binary')) {
      return Promise.reject(new Error('forced GLB fetch failure (test)'));
    }
    return of(input, init);
  };
});
await page.goto(pathToFileURL(resolve(root, 'dist/index.html')).href);
await page.waitForFunction(() => !window.__sim?.loadingVisible, { timeout: 15000 });
const state = await page.evaluate(() => ({
  treeFallback: window.__sim.treeIsGLB === false,
  boatReady: window.__sim.boat.ready,
  speed: window.__sim.physics.speed,
}));
await page.waitForTimeout(3000);
const after = await page.evaluate(() => ({
  speed: window.__sim.physics.speed,
  dist: Math.hypot(window.__sim.physics.x, window.__sim.physics.z),
}));
await page.screenshot({ path: resolve(root, 'tools/shot-fallback.png') });
await browser.close();
const ok = state.treeFallback && state.boatReady && after.speed > 0.5 && after.dist > 1 && errors.length === 0;
console.log(JSON.stringify({ state, after, pageErrors: errors }, null, 1));
console.log(ok ? '✓ 兜底链路验证通过（GLB 失败 → 几何体接管，可正常航行、无报错）' : '✗ 兜底验证失败');
process.exit(ok ? 0 : 1);
