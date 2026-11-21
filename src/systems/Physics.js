/**
 * 帆船航行物理（简化的帆动力模型，非 CFD，重在还原"风力驱动"的手感）
 *
 * 约定：heading / wind.dir 均为"指向角"，前向 f=(sinθ, cosθ)
 *  - 顺风：风向与船头同向（cosApp≈+1），推力最大
 *  - 横风：风向与船头垂直，推力依然充足并产生最大横倾
 *  - 逆风近 40° 为"不可航区"（no-go），帆失速，自动舵自动顺风偏出
 */
const NO_GO = 0.7;            // 不可航区半角（弧度，约 40°）
const SAIL_K = 0.32;          // 帆力系数
const HEEL_GAIN = 0.022;      // 横倾力矩系数
const HELM_GAIN = 0.012;      // 风对船头的小幅偏转力矩
const MAX_SAIL_ANGLE = 1.1;   // 帆相对船中线最大张角（约 63°）

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class SailingPhysics {
  constructor(config) {
    this.cfg = config.boat;
    this.shoreRadius = config.lake.shoreRadius;
    this.reset(config);
  }

  reset(config) {
    this.x = 0;
    this.z = 0;
    this.heading = config.wind.initialDir + Math.PI * 0.5; // 初始横风出发
    this.speed = 0;
    this.heel = 0;        // 附加横倾角（波浪横倾之外的风致侧倾）
    this.sailAngle = 0;   // 帆相对船中线的张角
    this.sailSet = 0;     // 帆的吃风度（0~1，控制鼓胀）
    this.inNoGo = false;
    this.yawRate = 0;
  }

  /** 每帧由帧循环统一调用 */
  update(dt, wind, t) {
    const { heading } = this;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const w = wind.vector;

    // 1) 风与船头的夹角关系
    const cosApp = fx * w.x + fz * w.z;          // +1 顺风 / -1 正顶风
    const cross = fx * w.z - fz * w.x;           // 风向相对船头的左右侧
    const rel = wrapAngle(wind.dir - heading);   // 有符号风向差

    // 2) 帆推力系数：顺风≈1，横风≈0.8，逆风按不可航区衰减到 0
    let drive;
    if (cosApp >= 0) {
      drive = 0.8 + 0.2 * cosApp;
      this.inNoGo = false;
    } else {
      const offWind = Math.acos(clamp(-cosApp, -1, 1)); // 与"来风方向"的夹角
      const upwind = clamp((offWind - NO_GO) / (Math.PI / 2 - NO_GO), 0, 1);
      drive = upwind * 0.55;
      this.inNoGo = upwind < 0.05;
    }

    // 3) 沿船头方向的帆力 + 水体阻力，积分船速
    const force = SAIL_K * wind.speed * drive;
    this.speed += (force - this.cfg.drag * this.speed) * dt;
    this.speed = clamp(this.speed, 0, this.cfg.maxSpeed);

    // 4) 自动舵：先避岸、再避不可航区，其余航向保持
    let target = heading;
    const dist = Math.hypot(this.x, this.z);
    if (dist > this.shoreRadius - 14) {
      target = Math.atan2(-this.x, -this.z);                 // 朝湖心转
    } else if (this.inNoGo) {
      target = wind.dir + (rel >= 0 ? 0.9 : -0.9);          // 顺风偏出
    }
    const err = wrapAngle(target - heading);
    const desiredYaw = clamp(this.cfg.rudderGain * err, -this.cfg.turnRate, this.cfg.turnRate);

    // 5) 风本身对船头的小幅推转（weather helm），叠加在舵效上
    const helm = HELM_GAIN * wind.speed * Math.sin(rel) * drive;
    this.yawRate += ((desiredYaw + helm) - this.yawRate) * Math.min(1, dt * 2.5);
    this.heading = wrapAngle(heading + this.yawRate * dt);

    // 6) 位置积分 + 湖岸软边界兜底（正常情况自动舵不会触界）
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    const d2 = Math.hypot(this.x, this.z);
    if (d2 > this.shoreRadius) {
      const k = this.shoreRadius / d2;
      this.x *= k;
      this.z *= k;
      this.speed *= 0.4;
    }

    // 7) 帆面自动偏转：取风向差的一半并限幅；不可航区时抖动(飘帆)
    let sail = clamp(rel * 0.5, -MAX_SAIL_ANGLE, MAX_SAIL_ANGLE);
    if (this.inNoGo) sail += Math.sin(t * 9) * 0.12;
    this.sailAngle += (sail - this.sailAngle) * Math.min(1, dt * 3);
    this.sailSet += (drive * (0.55 + 0.45 * wind.speed / wind.maxSpeed) - this.sailSet) * Math.min(1, dt * 2);

    // 8) 风致横倾：侧向风分量越大压舷越明显，背风侧倾斜
    const heelTarget = -HEEL_GAIN * wind.speed * Math.abs(cross) * drive;
    this.heel += (heelTarget - this.heel) * Math.min(1, dt * 2.2);
  }
}
