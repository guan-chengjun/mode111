/**
 * 天空：BackSide 大球 + 渐变 Shader（地平线暖白 → 天顶淡蓝），带太阳光晕
 * 灯光：柔和日光（平行光 + 阴影）与半球环境光；雾在 main.js 中按 CONFIG 统一配置
 */
import * as THREE from 'three';

export class Sky {
  constructor(scene, config) {
    const sunDir = new THREE.Vector3(0.42, 0.55, 0.72).normalize();

    const geo = new THREE.SphereGeometry(600, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x6fb4e0) },
        uHorizon: { value: new THREE.Color(0xdceef6) },
        uSunDir: { value: sunDir },
        uSunColor: { value: new THREE.Color(0xfff3d6) },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
        void main() {
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.75));
          float glow = pow(max(dot(normalize(vDir), normalize(uSunDir)), 0.0), 90.0);
          float halo = pow(max(dot(normalize(vDir), normalize(uSunDir)), 0.0), 6.0) * 0.18;
          col += uSunColor * (glow * 0.7 + halo);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // 柔和日光
    this.sun = new THREE.DirectionalLight(0xfff1d8, 2.1);
    this.sun.position.copy(sunDir).multiplyScalar(140);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(config.render.shadowMapSize, config.render.shadowMapSize);
    const s = 90;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.far = 360;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfe0f2, 0x6f8f5a, 0.85);
    scene.add(this.hemi);
  }

  /** 跟随模式下天空球与太阳目标跟着镜头走，避免走到球壁 */
  follow(camera, boatPos) {
    this.mesh.position.copy(camera.position);
    this.sun.position.set(boatPos.x + 60, 80, boatPos.z + 100);
    this.sun.target.position.copy(boatPos);
    this.sun.target.updateMatrixWorld();
  }
}
