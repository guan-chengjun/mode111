/**
 * 离线模型构建器（仅构建期运行，浏览器运行时不依赖 Node）
 * 用基础几何体搭建 CC0 自制帆船 / 树木，经 GLTFExporter 输出 GLB：
 *   - assets/models/sailboat.glb、tree.glb（原始文件，便于后续替换为开源模型）
 *   - src/assets/models.js（base64 内嵌，file:// 直开也能被 GLTFLoader 加载）
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node 环境下 GLTFExporter 二进制导出依赖浏览器 FileReader，做最小 polyfill
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onloadend?.();
      });
    }
  };
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'assets/models'), { recursive: true });
mkdirSync(resolve(root, 'src/assets'), { recursive: true });

const exporter = new GLTFExporter();
const exportGLB = (scene) =>
  new Promise((res, rej) =>
    exporter.parse(scene, res, rej, { binary: true, onlyVisible: true })
  );

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...extra });
}

// ---------------- 帆船 ----------------
function buildSailboat() {
  const g = new THREE.Group();
  g.name = 'Sailboat';

  // 船体放样（与运行时兜底同构，独立建模以便 GLB 链路真实可测）
  const rings = 10, seg = 14, L = 6.2;
  const pos = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, z = (t - 0.5) * L;
    const taper = Math.sin(Math.PI * t);
    const w = 1.05 * taper * (1 - 0.25 * t), d = 0.85 * taper + 0.05;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI;
      pos.push(Math.cos(a) * w, -Math.sin(a) * d, z);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * row + j, b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hullGeo.setIndex(idx);
  hullGeo.computeVertexNormals();
  const hull = new THREE.Mesh(hullGeo, mat(0x7a3b2e));
  hull.name = 'hull';
  g.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 4.6), mat(0xf2ead8));
  deck.name = 'deck'; deck.position.y = 0.03; g.add(deck);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.4, 8), mat(0x6b4a2e));
  mast.name = 'mast'; mast.position.set(0, 2.7, -0.3); g.add(mast);

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.6, 6), mat(0x6b4a2e));
  boom.name = 'boom';
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, 0.25, 1.0);
  g.add(boom);

  // 帆面建在 XZ 平面，导出后由运行时 rotateY(90°) 转到沿船中线的 YZ 基准面
  const cloth = mat(0xf5f1e6, { side: THREE.DoubleSide, transparent: true, opacity: 0.97 });
  const mainGeo = new THREE.BufferGeometry();
  mainGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 2.5, 0, 0, 0, 4.7, 0,
  ], 3));
  mainGeo.computeVertexNormals();
  const mainSail = new THREE.Mesh(mainGeo, cloth);
  mainSail.name = 'mainSail';
  mainSail.position.set(0, 0.2, -0.3);
  g.add(mainSail);

  const jibGeo = new THREE.BufferGeometry();
  jibGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.55, 0, -2.05, 0, 0, 0, 3.65, 0,
  ], 3));
  jibGeo.computeVertexNormals();
  const jibSail = new THREE.Mesh(jibGeo, cloth);
  jibSail.name = 'jibSail';
  jibSail.position.set(0, 0.55, -0.15);
  g.add(jibSail);

  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 1.1), mat(0x5c2c22));
  keel.name = 'keel'; keel.position.set(0, -0.85, -0.4); g.add(keel);
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.25), mat(0x5c2c22));
  rudder.name = 'rudder'; rudder.position.set(0, -0.5, -3.0); g.add(rudder);

  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

// ---------------- 树木（松树，可被实例克隆） ----------------
function buildTree() {
  const g = new THREE.Group();
  g.name = 'PineTree';
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, 1.8, 7), mat(0x7a5a38));
  trunk.position.y = 0.9; g.add(trunk);
  const greens = [0x4d7d3e, 0x558745, 0x5f9350];
  [[1.25, 3.0, 2.6], [0.95, 2.4, 3.9], [0.65, 1.8, 5.0]].forEach(([r, h, y], i) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), mat(greens[i]));
    cone.position.y = y; g.add(cone);
  });
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

// ---------------- 主流程 ----------------
const tasks = [
  ['sailboat', buildSailboat()],
  ['tree', buildTree()],
];
const embedded = {};

for (const [name, scene] of tasks) {
  const glb = await exportGLB(scene);
  const buf = Buffer.from(glb);
  const outPath = resolve(root, `assets/models/${name}.glb`);
  writeFileSync(outPath, buf);
  embedded[name] = `data:model/gltf-binary;base64,${buf.toString('base64')}`;
  console.log(`✓ ${name}.glb  ${(buf.length / 1024).toFixed(1)} KB`);
}

writeFileSync(
  resolve(root, 'src/assets/models.js'),
  `// 由 tools/build-models.mjs 自动生成，请勿手改\n` +
  `// CC0 自制模型的 base64 内嵌数据，使 file:// 直开页面也能走 GLTFLoader\n` +
  `export const EMBEDDED_MODELS = ${JSON.stringify(embedded, null, 2)};\n`
);
console.log('✓ src/assets/models.js 已生成');
