# 湖泊帆船航行 3D 仿真

基于 Three.js（r160）的纯前端帆船航行物理仿真：开阔湖面、湖岸草地、芦苇、远山、栈桥，
风向随机缓慢变化，帆船自动调帆借力、随风转向、随浪起伏侧倾。无后端、无外部弹窗，
`dist/index.html` 可直接双击离线运行。

## 快速开始

```bash
npm install          # 安装构建期依赖（three / esbuild / playwright）
npm run build        # 生成 dist/（单文件 HTML，内嵌全部代码与 GLB，双击即开）
npm test             # 无头浏览器冒烟测试 + GLB 兜底链路验证
npm run serve        # 开发模式静态服务器（http://localhost:5173，源码热改刷新）
```

- **离线运行**：直接打开 `dist/index.html`（Chromium 系浏览器；已处理 file:// 的 module CORS 限制）
- **开发调试**：`npm run serve` 后访问 http://localhost:5173，直接加载 `src/` 源码模块

## 功能清单

| 类别 | 实现 |
| --- | --- |
| 场景 | 环形湖岸草地（顶点色沙滩→草地）、程序化低矮山丘、460 株风动芦苇、木质栈桥、46 棵树木 |
| 水面 | 6 组方向波谱顶点位移 + 风致高频细碎波纹、菲涅尔淡反光、量化抖动消色带 |
| 帆船物理 | 帆推力（顺风/横风/逆风 no-go 失速区）、自动舵避岸与偏出失速区、风致 weather helm 转向、帆面自动张角与鼓胀、风致横倾、水阻力 |
| 波浪贴附 | 水面着色器与船体姿态共用 `waves.js` 同一波谱，船底始终贴合水面，不穿模 |
| 交互 | OrbitControls 左键旋转 / 滚轮缩放 / 右键平移；跟随 ⇄ 俯瞰视角切换 |
| 控制面板 | 风向滑杆 + 罗盘指示、风力滑杆（蒲福风级）、自动风向开关、暂停、重置、实时风向/风力/船速/帆状态 |
| 渲染 | 柔和平行光日光 + PCF 软阴影、半球环境光、渐变天空球 + 太阳光晕、指数薄雾、DPR 上限 2 |
| 模型 | GLTFLoader 三级降级：内嵌 GLB → `window.SAILBOAT_MODEL_URL` 外部 GLB → 程序化几何体 |
| 工程 | 单一 `requestAnimationFrame` 统一驱动；窗口 resize 自适应；固定随机种子布局可复现 |

## 模型与授权

- `assets/models/*.glb` 与内嵌数据由 `tools/build-models.mjs` 用基础几何体程序化生成并经
  GLTFExporter 导出，为本项目自制资产，按 **CC0** 释放，可商用。
- 要替换为下载的开源 GLB（如 KayKit、Quaternius 等 CC0 资源）：
  1. 覆盖 `assets/models/sailboat.glb` / `tree.glb` 后重跑 `npm run build:models`；或
  2. 页面设置 `window.SAILBOAT_MODEL_URL = './your-boat.glb'`（帆节点命名含 `sail`/`帆` 会被自动识别驱动）。
- 加载失败时自动静默降级到程序化几何体，场景不阻断、不弹错误窗。

## 目录结构

```
├─ index.html               # 页面骨架 + 控制面板样式
├─ src/
│  ├─ main.js               # 入口：渲染器/雾/帧循环/窗口自适应/模型加载编排
│  ├─ config.js             # 全部可调参数（湖尺寸、物理系数、相机、雾）
│  ├─ assets/models.js      # 构建期生成的 base64 GLB（file:// 直开关键）
│  ├─ world/
│  │  ├─ waves.js           # 共享波谱：waveHeight / sampleBoatPose（防穿模核心）
│  │  ├─ Water.js           # 水面 Shader（位移 + 风纹法线 + 菲涅尔）
│  │  ├─ Sky.js             # 渐变天空球、日光阴影、半球光
│  │  └─ Environment.js     # 地形/山丘/芦苇/栈桥/树木（含 GLB↔实例化兜底）
│  ├─ entities/Sailboat.js  # 帆船实体：GLB 加载链、帆偏转、波浪贴附
│  ├─ systems/
│  │  ├─ Wind.js            # 风场 + 风向低频随机游走
│  │  ├─ Physics.js         # 帆动力/自动舵/横倾/帆角/岸界
│  │  └─ CameraRig.js       # OrbitControls + 跟随/俯瞰双模式
│  └─ ui/UI.js              # 控制面板与加载浮层
├─ tools/
│  ├─ build-models.mjs      # 程序化建模 → GLB → 内嵌 base64
│  ├─ build.mjs             # esbuild 单文件打包（内联 module 绕开 file:// CORS）
│  ├─ serve.mjs             # 开发静态服务器
│  ├─ smoke.mjs             # 13 项无头浏览器功能断言
│  └─ shot-fallback.mjs     # GLB 强制失败下的兜底验证
└─ dist/                    # 构建产物，可直接分发
```

## 后续扩展点

代码已预留扩展位置：
- **多艘帆船**：`SailingPhysics` 与 `Sailboat` 为无共享实例，按 `new` 批量生成后在帧循环遍历即可。
- **礁石碰撞**：在 `Physics.update` 位置积分后增加障碍圆/圆相交判定，叠加反弹冲量与 `speed` 衰减；
  湖岸软边界（`shoreRadius` 回推）已是同类处理的范例。
- 所有魔术数字集中在 `src/config.js`，调参无需翻业务代码。
