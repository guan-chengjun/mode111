/**
 * 共享波浪数学：水面顶点着色器与船体起伏使用同一组波参数，
 * 保证船始终"坐"在水面上，不会穿模。
 * 波高刻意控制在 0.3m 量级（相对 6.2m 船长），属细碎波纹。
 */
export const WAVE_SPECTRUM = [
  // dirX, dirZ, 振幅, 波长, 速度, 初相位
  { d: [1.0, 0.35], amp: 0.06, len: 6.0, spd: 1.5, phase: 0.0 },
  { d: [0.45, -1.0], amp: 0.045, len: 3.8, spd: 1.9, phase: 1.7 },
  { d: [-0.8, 0.6], amp: 0.03, len: 2.3, spd: 2.4, phase: 3.1 },
  { d: [0.25, 1.0], amp: 0.02, len: 1.4, spd: 3.1, phase: 0.6 },
  { d: [-0.55, -0.83], amp: 0.018, len: 2.0, spd: 2.7, phase: 5.2 },
  { d: [0.9, -0.4], amp: 0.012, len: 1.1, spd: 3.6, phase: 2.4 },
];

// 供 GLSL 使用的扁平数组（方向需归一化）
export const WAVE_GLSL = WAVE_SPECTRUM.map((w) => {
  const l = Math.hypot(w.d[0], w.d[1]);
  return {
    dx: w.d[0] / l,
    dz: w.d[1] / l,
    amp: w.amp,
    k: (Math.PI * 2) / w.len,
    w: (Math.PI * 2 * w.spd) / w.len,
    phase: w.phase,
  };
});

/** 某时刻 t、水平位置 (x,z) 的水面高度 */
export function waveHeight(x, z, t) {
  let h = 0;
  for (const w of WAVE_GLSL) {
    h += w.amp * Math.sin(w.k * (w.dx * x + w.dz * z) + w.w * t + w.phase);
  }
  return h;
}

/**
 * 采样船姿：吃水线处的高度、俯仰(pitch)、横滚(roll)
 * 通过船头/船尾、左舷/右舷的高度差计算倾斜，与着色器公式完全一致
 */
export function sampleBoatPose(x, z, heading, t, halfLen = 3.1, halfBeam = 1.05) {
  const fx = Math.sin(heading), fz = Math.cos(heading);   // 船头方向
  const rx = Math.cos(heading), rz = -Math.sin(heading);  // 右舷方向

  const hCenter = waveHeight(x, z, t);
  const hBow = waveHeight(x + fx * halfLen, z + fz * halfLen, t);
  const hStern = waveHeight(x - fx * halfLen, z - fz * halfLen, t);
  const hPort = waveHeight(x - rx * halfBeam, z - rz * halfBeam, t);
  const hStar = waveHeight(x + rx * halfBeam, z + rz * halfBeam, t);

  const pitch = Math.atan2(hBow - hStern, halfLen * 2);  // 船头高为正
  const roll = Math.atan2(hStar - hPort, halfBeam * 2);  // 右舷低为正
  return { y: hCenter, pitch, roll };
}
