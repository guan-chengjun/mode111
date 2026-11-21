/**
 * 湖面：CircleGeometry 顶点着色器位移（波参数与 waves.js 同源，保证船不穿模），
 * 片元着色器叠加风致细碎波纹法线 + 菲涅尔淡反光。
 * 选用 MeshStandardMaterial 并注入代码，自动获得阴影、雾、日光高光。
 */
import * as THREE from 'three';
import { WAVE_GLSL } from './waves.js';

export class Water {
  constructor(radius, segments) {
    this.uniforms = {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector2(1, 0) },
      uDeep: { value: new THREE.Color(0x16475e) },
      uShallow: { value: new THREE.Color(0x2e6f88) },
      uSky: { value: new THREE.Color(0xd7e9f2) },
    };

    const geo = new THREE.CircleGeometry(radius, segments);
    geo.rotateX(-Math.PI / 2); // 平铺到 XZ 平面

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2b7290,
      roughness: 0.5,
      metalness: 0.05,
    });

    // 由共享波谱生成 GLSL 常量，杜绝"船体公式与着色器公式不一致"
    const waveDefs = WAVE_GLSL.map((w, i) =>
      `const vec3 w${i} = vec3(${w.dx.toFixed(4)}, ${w.dz.toFixed(4)}, ${w.amp.toFixed(4)});` +
      `const float k${i}=${w.k.toFixed(4)}, o${i}=${w.w.toFixed(4)}, p${i}=${w.phase.toFixed(4)};`
    ).join('\n');

    mat.onBeforeCompile = (shader) => {
      // 与渲染器共享 uniform 对象引用（仅注册键，不替换整个 uniforms 容器）
      for (const [k, v] of Object.entries(this.uniforms)) shader.uniforms[k] = v;

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `
          #include <common>
          uniform float uTime; uniform vec2 uWind;
          ${waveDefs}
        `)
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float waveY = 0.0;
          ${WAVE_GLSL.map((_, i) =>
            `waveY += w${i}.z * sin(dot(transformed.xz, w${i}.xy) * k${i} + uTime * o${i} + p${i});`
          ).join('\n')}
          // 风向驱动的高幅细碎小波纹，沿风向流动（幅度小、频率高，避免色带）
          waveY += 0.018 * sin(dot(transformed.xz, uWind) * 3.1 + uTime * 2.6);
          waveY += 0.012 * sin(dot(transformed.xz, vec2(-uWind.y, uWind.x)) * 4.7 + uTime * 3.7);
          waveY += 0.008 * sin(dot(transformed.xz, uWind) * 8.3 - uTime * 4.2);
          transformed.y += waveY;
        `);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `
          #include <common>
          uniform float uTime; uniform vec2 uWind;
          uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky;
        `)
        .replace('#include <color_fragment>', `
          #include <color_fragment>
        `)
        .replace('#include <normal_fragment_begin>', `
          #include <normal_fragment_begin>
          // 微风细波对法线的周期性扰动，产生流动的细碎高光（此处 normal 已声明）
          vec2 wPerp = vec2(-uWind.y, uWind.x);
          float ph1 = dot(vViewPosition.xz, uWind) * 3.1 + uTime * 2.6;
          float ph2 = dot(vViewPosition.xz, wPerp) * 4.7 + uTime * 3.7;
          float ph3 = dot(vViewPosition.xz, uWind) * 8.3 - uTime * 4.2;
          normal.xz += uWind * (cos(ph1) * 0.04 + cos(ph3) * 0.025) + wPerp * cos(ph2) * 0.03;
          normal = normalize(normal);
        `)
        .replace('#include <opaque_fragment>', `
          // 深水/浅水色 + 菲涅尔天空反光（淡淡一层，避免镜面感）
          vec3 viewDir = normalize(vViewPosition);
          float fres = pow(1.0 - saturate(dot(normal, viewDir)), 3.0);
          vec3 waterCol = mix(uDeep, uShallow, 0.4);
          outgoingLight = mix(outgoingLight * waterCol * 1.6, uSky, fres * 0.38);
          // 8-bit 量化抖动，消除渐变/雾产生的同心圆色带
          float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
          outgoingLight += dither / 255.0 * 2.0;
          #include <opaque_fragment>
        `);
    };

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'lake-water';
  }

  update(t, windVec) {
    this.uniforms.uTime.value = t;
    this.uniforms.uWind.value.set(windVec.x, windVec.z).normalize();
  }
}
