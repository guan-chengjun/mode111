/**
 * 湖岸环境：环形地形（草地 + 远处低矮山丘）、芦苇丛、栈桥
 * 树木由 Trees 子模块管理：优先 GLB，失败回退程序化实例（单 draw call）
 * 所有随机布局走固定种子，保证每次打开一致、可复现
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---- 确定性随机 ----
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20240617);

/** 远处丘陵的低频噪声（角度/半径混合正弦，无需贴图） */
function hillNoise(angle, r) {
  return (
    0.55 * Math.sin(angle * 2.1 + r * 0.013) +
    0.30 * Math.sin(angle * 4.7 - r * 0.021 + 2.0) +
    0.15 * Math.sin(angle * 9.3 + r * 0.010 + 0.7)
  );
}

export class Terrain {
  constructor(lakeRadius) {
    const inner = lakeRadius - 8;          // 略微压到水面下，避免岸边露缝
    const outer = 340;
    const geo = new THREE.RingGeometry(inner, outer, 192, 40);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xd8c79e);
    const grass = new THREE.Color(0x5d8f4c);
    const dark = new THREE.Color(0x466f3a);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const a = Math.atan2(x, z);
      const y = this.heightAt(x, z);
      pos.setY(i, y);

      // 近岸沙色 → 草地 → 高处偏深
      const shoreMix = THREE_clamp((r - inner) / 14, 0, 1);
      const highMix = THREE_clamp(y / 12, 0, 1);
      tmp.copy(sand).lerp(grass, shoreMix).lerp(dark, highMix * 0.5);
      tmp.offsetHSL(0, 0, (hillNoise(a, r) * 0.04));
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'shore-terrain';
  }

  /** 与顶点位移完全相同的高度函数，供树木/栈桥落位 */
  heightAt(x, z) {
    const r = Math.hypot(x, z);
    const a = Math.atan2(x, z);
    const rise = THREE_clamp((r - 128) / 130, 0, 1);   // 128m 外开始起山
    const n = hillNoise(a, r);
    return rise * rise * (5.5 + 9.5 * n) - 0.35;
  }
}

/** 芦苇：单实例几何体 + 着色器摇摆，一次 draw call */
class Reeds {
  constructor(terrain, lakeRadius) {
    const COUNT = 460;
    const geo = new THREE.CylinderGeometry(0.018, 0.045, 1, 5, 1, true);
    geo.translate(0, 0.5, 0);
    // 根部褐、顶部绿的顶点色
    const c = new Float32Array(geo.attributes.position.count * 3);
    const root = new THREE.Color(0x8a7a44), tip = new THREE.Color(0x6f9a4e);
    const cc = new THREE.Color();
    for (let i = 0; i < geo.attributes.position.count; i++) {
      cc.copy(root).lerp(tip, geo.attributes.position.getY(i));
      c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    this.uTime = { value: 0 };
    this.uWind = { value: new THREE.Vector2(1, 0) };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.uniforms.uWind = this.uWind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind;')
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float bend = position.y * position.y;
          transformed.x += (uWind.x * 0.22 + sin(uTime * 2.0 + position.y * 3.0) * 0.05) * bend;
          transformed.z += (uWind.y * 0.22 + cos(uTime * 1.7 + position.y * 2.0) * 0.05) * bend;
        `);
    };

    this.mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    this.mesh.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();

    let placed = 0, guard = 0;
    while (placed < COUNT && guard++ < 4000) {
      // 28 个草丛簇，沿湖岸分布
      const clumpA = rand() * Math.PI * 2;
      const clumpR = lakeRadius - 6 + rand() * 12;
      const a = clumpA + (rand() - 0.5) * 0.12;
      const r = clumpR + (rand() - 0.5) * 2.2;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const h = 1.3 + rand() * 1.2;
      e.set((rand() - 0.5) * 0.18, rand() * Math.PI * 2, (rand() - 0.5) * 0.18);
      q.setFromEuler(e);
      p.set(x, -0.15, z);
      s.set(1, h, 1);
      m.compose(p, q, s);
      this.mesh.setMatrixAt(placed++, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(t, windVec) {
    this.uTime.value = t;
    this.uWind.value.set(windVec.x, windVec.z);
  }
}

/** 栈桥：木板桥面 + 木桩，从湖岸伸入水面 */
class Pier {
  constructor(terrain, lakeRadius) {
    this.group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x6e5235, roughness: 0.95 });
    const angle = -0.9;
    const dirX = Math.sin(angle), dirZ = Math.cos(angle);
    const perpX = Math.cos(angle), perpZ = -Math.sin(angle);
    const len = 17, width = 3.2, planks = 11;

    for (let i = 0; i < planks; i++) {
      const d = 2 + (i / (planks - 1)) * len;          // 距湖心方向的距离
      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, 1.35), wood);
      plank.position.set(dirX * (lakeRadius - d), 0.55, dirZ * (lakeRadius - d));
      plank.rotation.y = angle;
      plank.castShadow = true; plank.receiveShadow = true;
      this.group.add(plank);

      if (i % 3 === 0) {  // 两侧木桩
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.4, 6), darkWood);
          post.position.set(
            dirX * (lakeRadius - d) + perpX * side * (width / 2 - 0.2),
            -0.45,
            dirZ * (lakeRadius - d) + perpZ * side * (width / 2 - 0.2)
          );
          post.castShadow = true;
          this.group.add(post);
        }
      }
    }
    this.group.name = 'wooden-pier';
  }
}

/** 树木：GLB 成功则放置克隆，失败用合并几何体 + InstancedMesh 兜底 */
export class Trees {
  constructor(terrain, lakeRadius, pierAngle) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.spots = [];
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2;
      if (Math.abs(((a - pierAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.28) continue;
      const r = 138 + rand() * 130;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      this.spots.push({ x, z, s: 0.85 + rand() * 0.9, yaw: rand() * Math.PI * 2 });
    }
    this.group.name = 'trees';
    this.usingGLB = false;
    this._buildFallback();
  }

  _buildFallback() {
    const trunk = new THREE.CylinderGeometry(0.13, 0.2, 1.7, 6).translate(0, 0.85, 0);
    paint(trunk, new THREE.Color(0x7a5a38));
    const cone1 = new THREE.ConeGeometry(1.15, 2.8, 7).translate(0, 2.7, 0);
    paint(cone1, new THREE.Color(0x4d7d3e));
    const cone2 = new THREE.ConeGeometry(0.85, 2.1, 7).translate(0, 4.0, 0);
    paint(cone2, new THREE.Color(0x5c8f47));
    const geo = mergeGeometries([trunk, cone1, cone2]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.fallback = new THREE.InstancedMesh(geo, mat, this.spots.length);
    this.fallback.castShadow = true; this.fallback.receiveShadow = true;
    this.applySpots(this.fallback, false);
    this.group.add(this.fallback);
  }

  applySpots(mesh, isGLB) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    this.spots.forEach((sp, i) => {
      e.set(0, sp.yaw, 0); q.setFromEuler(e);
      p.set(sp.x, this.terrain.heightAt(sp.x, sp.z) - (isGLB ? 0 : 0.1), sp.z);
      s.setScalar(sp.s);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** GLB 加载成功后调用：移除兜底实例，改为模型克隆 */
  useGLB(gltfScene) {
    this.group.remove(this.fallback);
    this.fallback.geometry.dispose();
    this.usingGLB = true;
    this.spots.forEach((sp) => {
      const tree = gltfScene.clone(true);
      tree.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      tree.position.set(sp.x, this.terrain.heightAt(sp.x, sp.z), sp.z);
      tree.rotation.y = sp.yaw;
      tree.scale.setScalar(sp.s);
      this.group.add(tree);
    });
  }
}

function paint(geo, color) {
  const arr = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < geo.attributes.position.count; i++) {
    arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

const THREE_clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Environment {
  constructor(scene, config) {
    this.terrain = new Terrain(config.lake.radius);
    this.reeds = new Reeds(this.terrain, config.lake.radius);
    this.pier = new Pier(this.terrain, config.lake.radius);
    this.trees = new Trees(this.terrain, config.lake.radius, -0.9);
    scene.add(this.terrain.mesh, this.reeds.mesh, this.pier.group, this.trees.group);
  }

  update(t, windVec) {
    this.reeds.update(t, windVec);
  }
}
