/**
 * 入口：组装场景并在唯一的 requestAnimationFrame 帧循环内统一更新
 * 纯前端运行，无后端、无弹窗；窗口缩放自动适配
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { Water } from './world/Water.js';
import { Sky } from './world/Sky.js';
import { Environment } from './world/Environment.js';
import { Sailboat } from './entities/Sailboat.js';
import { Wind } from './systems/Wind.js';
import { SailingPhysics } from './systems/Physics.js';
import { CameraRig } from './systems/CameraRig.js';
import { UI, Loading } from './ui/UI.js';
import { EMBEDDED_MODELS } from './assets/models.js';

// ---------- 渲染器 / 场景 / 雾 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));   // 限制 DPR，控制渲染开销
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(CONFIG.render.fogColor, CONFIG.render.fogNear, CONFIG.render.fogFar);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1200);

// ---------- 世界组装 ----------
const sky = new Sky(scene, CONFIG);
const water = new Water(CONFIG.lake.radius, CONFIG.lake.segments);
scene.add(water.mesh);
const env = new Environment(scene, CONFIG);

const wind = new Wind(CONFIG.wind);
const physics = new SailingPhysics(CONFIG);
const boat = new Sailboat(physics);
scene.add(boat.root);

const rig = new CameraRig(camera, renderer.domElement, CONFIG);
const loading = new Loading();

// 只读仿真钩子：便于自动化测试与后续扩展（多船/碰撞），不影响正常运行
window.__sim = {
  get physics() { return physics; },
  get wind() { return wind; },
  get boat() { return boat; },
  get paused() { return paused; },
  get treeIsGLB() { return env.trees.usingGLB; },
  get loadingVisible() { return loading.el.style.display !== 'none'; },
  camera,
  rig,
};

// ---------- 交互 ----------
let paused = false;
const ui = new UI(wind, {
  onPause: () => {
    paused = !paused;
    ui.setPauseLabel(paused);
  },
  onReset: () => {
    physics.reset(CONFIG);
    ui.note?.('帆船已重置到湖心');
  },
  onToggleView: () => {
    const next = rig.mode === 'follow' ? 'free' : 'follow';
    rig.setMode(next, boat.root.position, camera);
    ui.setViewLabel(next);
  },
});

// ---------- 模型加载（失败静默降级，绝不阻断） ----------
async function loadTreeModel() {
  // 可选：window.TREE_MODEL_URL 指定外部树木 GLB；默认直接用内嵌模型
  const src = window.TREE_MODEL_URL || EMBEDDED_MODELS.tree;
  try {
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().load(src, resolve, undefined, reject);
    });
    env.trees.useGLB(gltf.scene);
    loading.note('树木 GLB 加载成功');
  } catch {
    if (window.TREE_MODEL_URL) loading.note('树木 GLB 加载失败，使用程序化树木');
  }
}

(async () => {
  await Promise.allSettled([boat.load(loading), loadTreeModel()]);
  loading.setText('场景就绪');
  loading.done();
  start();
})();

// ---------- 统一帧循环 ----------
const clock = new THREE.Clock();
let simTime = 0;

function start() {
  renderer.setAnimationLoop(animate);
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);   // 钳制大跳变（切后台后回来）

  if (!paused) {
    simTime += dt;
    wind.update(dt, simTime);
    physics.update(dt, wind, simTime);
  }

  boat.update(simTime);
  water.update(simTime, wind.vector);
  env.update(simTime, wind.vector);
  rig.update(dt, boat.root.position);
  sky.follow(camera, boat.root.position);
  ui.updateReadout(physics, wind);

  renderer.render(scene, camera);
}

// ---------- 窗口自适应 ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
