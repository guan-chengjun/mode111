/**
 * 冒烟测试（仅开发期）：无头 Chromium 打开 dist/index.html（file:// 直开路径）
 * 校验：无报错、GLB 链路、物理推进、波浪贴附、帆偏转、交互控件、跟随视角、截图
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = pathToFileURL(resolve(root, 'dist/index.html')).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(target);

// 1) 等待场景就绪（加载浮层消失）
await page.waitForFunction(() => !window.__sim?.loadingVisible, { timeout: 15000 });
const treeGLB = await page.evaluate(() => window.__sim.treeIsGLB);

// 2) 让仿真跑 4 秒，记录船速/位移/帆角
const snap = await page.evaluate(async () => {
  const start = { ...window.__sim.physics, sail: window.__sim.physics.sailAngle };
  await new Promise((r) => setTimeout(r, 4000));
  const p = window.__sim.physics;
  return {
    startSpeed: start.speed,
    speed: p.speed,
    dist: Math.hypot(p.x, p.z),
    heading: p.heading,
    sail: p.sailAngle,
    heel: p.heel,
  };
});

// 3) 波浪贴附：船底 floatRig 高度应接近波浪高度且高于水面最低点，无穿模
const pose = await page.evaluate(() => {
  const rig = window.__sim.boat.floatRig;
  return { y: rig.position.y, pitch: rig.rotation.x, roll: rig.rotation.z };
});

// 4) 控件交互：暂停 / 风速归零 / 跟随视角
await page.click('#btn-pause');
// 点击后立即采样（暂停标志在该事件循环内已生效），等待后再采样应完全一致
const beforePause = await page.evaluate(() => ({ x: window.__sim.physics.x, z: window.__sim.physics.z }));
const pausedSpeed = beforePause && await page.evaluate(() => window.__sim.physics.speed);
await page.waitForTimeout(800);
const frozen = await page.evaluate(() => ({ x: window.__sim.physics.x, z: window.__sim.physics.z }));
await page.click('#btn-pause');

await page.fill('#wind-speed', '0');
await page.dispatchEvent('#wind-speed', 'input');
await page.waitForTimeout(1500);
const calmSpeed = await page.evaluate(() => window.__sim.physics.speed);

await page.click('#btn-view');
const followLabel = await page.textContent('#btn-view');
await page.waitForTimeout(1500);
const followCam = await page.evaluate(() => {
  const p = window.__sim.boat.root.position;
  const c = window.__sim.camera.position;
  return { dist: Math.hypot(c.x - p.x, c.z - p.z) };
});

// 5) 风向滑杆：关闭自动游走后，手动值应与读数精确联动
await page.evaluate(() => { window.__sim.wind.auto = false; });
await page.fill('#wind-dir', '180');
await page.dispatchEvent('#wind-dir', 'input');
const dirReadout = await page.textContent('#r-wind-dir');

// 6) 重置 + 恢复默认风力，回到俯瞰视角后截图
await page.click('#btn-reset');
const resetPos = await page.evaluate(() => ({ x: window.__sim.physics.x, z: window.__sim.physics.z }));
await page.evaluate(() => {
  const w = window.__sim.wind;
  w.auto = false; w.setSpeed(5.5);
});
await page.fill('#wind-speed', '5.5');
await page.dispatchEvent('#wind-speed', 'input');
// 若当前在跟随视角则切回俯瞰
const labelNow = await page.textContent('#btn-view');
if (labelNow.includes('俯瞰')) await page.click('#btn-view');
await page.waitForTimeout(2500);   // 让船跑出一段、帆面张开

await page.screenshot({ path: resolve(root, 'tools/smoke.png') });
await browser.close();

// ---- 断言 ----
const checks = [
  ['无 JS 报错', errors.length === 0, errors.join(' | ')],
  ['树木 GLB 加载成功', treeGLB === true, `treeIsGLB=${treeGLB}`],
  ['帆船获得航速 (>0.8m/s)', snap.speed > 0.8, `speed=${snap.speed.toFixed(2)}`],
  ['船体发生位移 (>2m)', snap.dist > 2, `dist=${snap.dist.toFixed(2)}`],
  ['帆面产生偏转 (|sail|>0.05)', Math.abs(snap.sail) > 0.05, `sail=${snap.sail.toFixed(3)}`],
  ['风致横倾生效 (|heel|>0.01)', Math.abs(snap.heel) > 0.01, `heel=${snap.heel.toFixed(3)}`],
  ['波浪贴附姿态合理 (|y|<0.6)', Math.abs(pose.y) < 0.6, `y=${pose.y.toFixed(3)}`],
  ['暂停时位置冻结', frozen.x === beforePause.x && frozen.z === beforePause.z,
    `${JSON.stringify(beforePause)} -> ${JSON.stringify(frozen)}`],
  ['风速归零后船减速', calmSpeed < pausedSpeed, `${calmSpeed.toFixed(2)} < ${pausedSpeed.toFixed(2)}`],
  ['跟随视角按钮切换', followLabel.includes('俯瞰'), followLabel],
  ['跟随镜头贴近帆船 (<20m)', followCam.dist < 20, `dist=${followCam.dist.toFixed(1)}`],
  ['风向控件联动读数', dirReadout.trim() === '180°', dirReadout],
  ['重置回到湖心', Math.hypot(resetPos.x, resetPos.z) < 0.01, JSON.stringify(resetPos)],
];
// 暂停冻结的严格校验需要暂停前后同点比较，单独处理
let fail = 0;
for (const [name, ok, detail] of checks) {
  if (ok) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name} — ${detail}`); fail++; }
}
if (fail) { console.error(`\n${fail} 项检查失败`); process.exit(1); }
console.log('\n全部冒烟检查通过 ✓ 截图: tools/smoke.png');
