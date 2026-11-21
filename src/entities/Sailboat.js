/**
 * 帆船实体
 * 加载链：内嵌 GLB（base64，离线可用）→ 外部 URL（可选扩展）→ 程序化几何体
 * 姿态：root 跟随位置与航向；floatRig 做波浪起伏/俯仰/横滚；帆节点按物理帆角偏转
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sampleBoatPose } from '../world/waves.js';
import { EMBEDDED_MODELS } from '../assets/models.js';

export class Sailboat {
  constructor(physics) {
    this.physics = physics;
    this.root = new THREE.Group();       // 位置 + 航向
    this.floatRig = new THREE.Group();   // 波浪姿态（起伏/pitch/roll）
    this.root.add(this.floatRig);
    this.sailPivot = null;
    this.sailMeshes = [];
    this.ready = false;
    this._buildFallback();
  }

  /** 异步加载：任何一环失败都静默降级，不阻断场景 */
  async load(loading) {
    const loader = new GLTFLoader();
    const tryLoad = (name, src) =>
      new Promise((resolve, reject) => {
        loading.setText(`正在加载 ${name} 模型…`);
        loader.load(src, (g) => resolve(g), undefined, (err) => reject(err));
      });

    let gltf = null;
    try {
      gltf = await tryLoad('帆船', EMBEDDED_MODELS.sailboat);
      loading.note('已加载内嵌 GLB 帆船模型（CC0 自制）');
    } catch {
      if (window.SAILBOAT_MODEL_URL) {
        try {
          gltf = await tryLoad('帆船(外部)', window.SAILBOAT_MODEL_URL);
          loading.note('已加载外部 GLB 帆船模型');
        } catch { /* 继续兜底 */ }
      }
    }

    if (gltf) {
      this.floatRig.clear();
      this.sailMeshes = [];
      const model = gltf.scene;
      model.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      model.scale.setScalar(1.15);
      this._attachModel(model);
      loading.note('帆船 GLB 加载成功');
    } else {
      loading.note('帆船 GLB 加载失败，已使用程序化几何体');
    }
    this.ready = true;
  }

  /** 将模型挂到节点体系上：识别命名帆，否则整体随船、帆动画作用于兜底帆 */
  _attachModel(model) {
    this.sailPivot = new THREE.Group();
    const sailLike = [];
    model.traverse((o) => {
      if (/sail|帆/i.test(o.name) && o.isMesh) sailLike.push(o);
    });
    if (sailLike.length) {
      // GLB 帆面统一转到"沿船中线"基准朝向，使 rotation.y = 帆张角语义正确
      sailLike.forEach((s) => {
        s.geometry.rotateY(Math.PI / 2);
        this.sailPivot.attach(s);
        this.sailMeshes.push(s);
      });
      this.floatRig.add(model, this.sailPivot);
    } else {
      // 模型未拆分帆结构：挂船体，另加一个程序化小帆承载偏转动画
      this.floatRig.add(model);
      const fallbackSail = this._createFallbackSail();
      this.sailPivot = fallbackSail.pivot;
      this.sailMeshes = fallbackSail.meshes;
      this.floatRig.add(this.sailPivot);
    }
  }

  // ---------- 程序化兜底 ----------
  _buildFallback() {
    this.sailMeshes = [];
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.65 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.8 });

    // 船体：9 道椭圆截面放样，船底收尖
    const rings = 9, seg = 12, L = 6.2;
    const positions = [], indices = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings, z = (t - 0.5) * L;
      const taper = Math.sin(Math.PI * t);
      const w = 1.05 * taper * (1 - 0.25 * t);
      const depth = 0.85 * taper + 0.05;
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI;             // 下半圆
        positions.push(Math.cos(a) * w, -Math.sin(a) * depth, z);
      }
    }
    const row = seg + 1;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < seg; j++) {
        const a = i * row + j, b = a + row;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    // 首尾封口
    for (const [i, zSign] of [[0, -1], [rings, 1]]) {
      const center = positions.length / 3;
      positions.push(0, 0, (i / rings - 0.5) * L);
      for (let j = 0; j < seg; j++) indices.push(center, i * row + j + zSign, i * row + j + 1 + zSign);
    }
    const hullGeo = new THREE.BufferGeometry();
    hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    hullGeo.setIndex(indices);
    hullGeo.computeVertexNormals();
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.castShadow = true; hull.receiveShadow = true;

    // 甲板、船舷白线、桅杆、舵与稳向板
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 4.6), trimMat);
    deck.position.y = 0.02; deck.castShadow = true;
    const rail = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.05, 6, 20), trimMat);
    rail.rotation.x = Math.PI / 2; rail.scale.set(1, 2.9, 1); rail.position.y = 0.06;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2e }));
    mast.position.set(0, 2.7, -0.3); mast.castShadow = true;
    const keel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 1.1), hullMat);
    keel.position.set(0, -0.85, -0.4);
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.25), hullMat);
    rudder.position.set(0, -0.5, -3.0);

    this.floatRig.add(hull, deck, rail, mast, keel, rudder);
    const sail = this._createFallbackSail();
    this.sailPivot = sail.pivot;
    this.sailMeshes = sail.meshes;
    this.floatRig.add(this.sailPivot);
  }

  /** 程序化主帆 + 前帆（双面半透布面），返回可偏转的 pivot */
  _createFallbackSail() {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.2, -0.3);
    const cloth = new THREE.MeshStandardMaterial({
      color: 0xf5f1e6, roughness: 0.85, side: THREE.DoubleSide,
      transparent: true, opacity: 0.96,
    });
    // 主帆：YZ 平面内的直角三角形（桅杆为竖直直角边，帆面沿船中线向后伸展）
    const main = new THREE.BufferGeometry();
    main.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0,  0, 4.7, 0,  0, 0, 2.5,
    ], 3));
    main.computeVertexNormals();
    // 前帆：YZ 平面内的船头三角帆，向船首伸展
    const jib = new THREE.BufferGeometry();
    jib.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 4.2, -0.15,  0, 0.55, -0.15,  0, 0.55, -2.2,
    ], 3));
    jib.computeVertexNormals();
    const meshes = [];
    for (const g of [main, jib]) {
      const m = new THREE.Mesh(g, cloth);
      m.castShadow = true;
      pivot.add(m);
      meshes.push(m);
    }
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2e }));
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.02, 1.25);
    pivot.add(boom);
    return { pivot, meshes };
  }

  // ---------- 帧更新（由主循环统一驱动） ----------
  update(t) {
    const p = this.physics;
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = p.heading;

    // 与水面着色器同源的波浪姿态，保证贴合不穿模
    const pose = sampleBoatPose(p.x, p.z, p.heading, t);
    this.floatRig.position.y = pose.y - 0.12;                 // 轻微吃水
    this.floatRig.rotation.z = pose.roll + p.heel;            // 波浪横滚 + 风致侧倾
    this.floatRig.rotation.x = pose.pitch;

    // 帆面自动偏转 + 鼓胀（scale.z 模拟吃风，帆面位于 YZ 平面）
    if (this.sailPivot) {
      this.sailPivot.rotation.y = p.sailAngle;
      const billow = 0.75 + p.sailSet * 0.5;
      for (const m of this.sailMeshes) m.scale.z = billow;
    }
  }

  reset() { /* 物理状态由 SailingPhysics.reset 负责，这里无需处理 */ }
}
