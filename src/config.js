/**
 * 全局配置：场景尺寸、物理参数、初始风力等
 * 后续扩展多艘帆船 / 礁石碰撞时可在此集中调参
 */
export const CONFIG = {
  lake: {
    radius: 120,        // 湖面半径（米）
    shoreRadius: 108,   // 软边界：超出后自动回推
    segments: 160,      // 水面网格精度
  },
  boat: {
    hullLength: 6.2,
    hullWidth: 2.1,
    maxSpeed: 7.2,      // 船体速度上限（米/秒）
    drag: 0.35,         // 水体线性阻力
    rudderGain: 0.9,    // 自动舵转向增益
    turnRate: 0.55,     // 最大转向角速度（弧度/秒）
  },
  wind: {
    initialDir: Math.PI * 0.25,   // 风向角（弧度，风往该方向吹）
    initialSpeed: 5.5,            // 风速（米/秒）
    minSpeed: 0,
    maxSpeed: 14,
    wanderSpeed: 0.06,            // 风向随机游走速率
    wanderAmount: 0.45,           // 游走噪声幅度
  },
  camera: {
    followOffset: new (class {
      constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
    })(0, 6.5, 13),
    freePosition: { x: 70, y: 62, z: 70 },
  },
  render: {
    shadowMapSize: 2048,
    fogColor: 0xcfe4ee,
    fogNear: 150,
    fogFar: 430,
  },
};
