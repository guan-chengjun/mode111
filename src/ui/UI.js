/**
 * 控制面板：仅保留必要项（风向、风力、暂停、重置、视角）+ 实时数据
 * 加载提示为右下角小浮层，不使用弹窗
 */
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(wind, handlers) {
    this.wind = wind;
    this.handlers = handlers;

    // 风向
    $('wind-dir').value = THREE_rad2deg(wind.dir);
    $('wind-dir-val').textContent = `${Math.round(THREE_rad2deg(wind.dir))}°`;
    $('wind-dir').addEventListener('input', (e) => {
      const deg = Number(e.target.value);
      wind.auto = false;                       // 手动调风向时挂起自动游走
      $('wind-auto').checked = false;
      wind.setDirection(THREE_deg2rad(deg));
      $('wind-dir-val').textContent = `${deg}°`;
      this._syncArrow();
    });

    // 自动风向开关：恢复后在当前值基础上继续缓慢游走
    $('wind-auto').addEventListener('change', (e) => {
      wind.auto = e.target.checked;
    });

    // 风力
    $('wind-speed').value = wind.speed;
    $('wind-speed-val').textContent = `${wind.speed.toFixed(1)} m/s`;
    $('wind-speed').addEventListener('input', (e) => {
      wind.setSpeed(Number(e.target.value));
      $('wind-speed-val').textContent = `${wind.speed.toFixed(1)} m/s`;
    });

    $('btn-pause').addEventListener('click', () => handlers.onPause());
    $('btn-reset').addEventListener('click', () => handlers.onReset());
    $('btn-view').addEventListener('click', () => handlers.onToggleView());

    this.arrow = $('wind-arrow');
    this._syncArrow();
  }

  _syncArrow() {
    // 风向角约定：0 = 向北(屏幕上方)，角度按 sin/cos 定义，直接用 CSS 旋转即可
    this.arrow.style.transform = `rotate(${THREE_rad2deg(this.wind.dir)}deg)`;
  }

  setPauseLabel(paused) {
    $('btn-pause').textContent = paused ? '继续航行' : '暂停航行';
  }

  setViewLabel(mode) {
    $('btn-view').textContent = mode === 'follow' ? '切回俯瞰视角' : '切换跟随视角';
  }

  /** 每帧刷新实时数据（只改文本，开销可忽略） */
  updateReadout(physics, wind) {
    $('r-wind-dir').textContent = `${Math.round(THREE_rad2deg(wind.dir))}°`;
    $('r-wind-level').textContent = `${wind.speed.toFixed(1)} m/s · ${beaufort(wind.speed)}级`;
    const knots = physics.speed * 1.94384;
    $('r-boat-speed').textContent = `${physics.speed.toFixed(2)} m/s · ${knots.toFixed(1)} 节`;
    $('r-sail-state').textContent = physics.inNoGo ? '失速(顶风)' : '吃风航行';
    this._syncArrow();
  }
}

/** 简易加载提示：文本 + 进度条，结束后淡出 */
export class Loading {
  constructor() { this.el = $('loading'); }
  setText(t) { $('loading-text').textContent = t; }
  note(t) { $('loading-note').textContent = t; }
  done() {
    this.el.classList.add('loading--hide');
    setTimeout(() => { this.el.style.display = 'none'; }, 600);
  }
}

function beaufort(ms) {
  const table = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  for (let i = 0; i < table.length; i++) if (ms < table[i]) return i;
  return 12;
}
const THREE_rad2deg = (r) => (r * 180) / Math.PI;
const THREE_deg2rad = (d) => (d * Math.PI) / 180;
