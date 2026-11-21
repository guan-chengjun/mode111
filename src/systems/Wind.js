/**
 * 风场：风向（风往哪个方向吹，弧度，与船 heading 同坐标系）+ 风速
 * 自动模式下风向做缓慢随机游走；手动调节后仍在新值基础上继续游走
 */
export class Wind {
  constructor(config) {
    this.dir = config.initialDir;
    this.speed = config.initialSpeed;
    this.minSpeed = config.minSpeed;
    this.maxSpeed = config.maxSpeed;
    this.wanderSpeed = config.wanderSpeed;
    this.wanderAmount = config.wanderAmount;
    this.auto = true;
    this._noise = 0;
  }

  setDirection(rad) { this.dir = rad; }
  setSpeed(v) { this.speed = THREE_clamp(v, this.minSpeed, this.maxSpeed); }

  update(dt, t) {
    if (!this.auto) return;
    // 两个低频正弦叠加，模拟风向缓慢、无规律的变化
    const n =
      Math.sin(t * this.wanderSpeed * 7.0 + 1.3) * 0.6 +
      Math.sin(t * this.wanderSpeed * 3.1 + 4.2) * 0.4;
    this._noise += (n - this._noise) * Math.min(1, dt * 0.5);
    this.dir += this._noise * this.wanderAmount * dt;
    // 归一化到 [0, 2π)
    this.dir = ((this.dir % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  /** 单位风向向量（风流动方向） */
  get vector() {
    return { x: Math.sin(this.dir), z: Math.cos(this.dir) };
  }
}

function THREE_clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
