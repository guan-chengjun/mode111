/**
 * 相机控制：OrbitControls 提供鼠标旋转/缩放/平移
 *  - free：自由俯瞰，控制点固定在湖心
 *  - follow：每帧把 target 平滑跟到帆船，相机保持相对偏移
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraRig {
  constructor(camera, dom, config) {
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;   // 不允许钻到水下
    this.controls.minDistance = 6;
    this.controls.maxDistance = 220;
    this.mode = 'free';
    this.config = config;
    this.fp = config.camera.freePosition;
    camera.position.set(this.fp.x, this.fp.y, this.fp.z);
    this.controls.target.set(0, 0, 0);
  }

  setMode(mode, boatPos, camera) {
    this.mode = mode;
    if (mode === 'follow') {
      const off = this.config.camera.followOffset;
      camera.position.set(boatPos.x + off.x, boatPos.y + off.y, boatPos.z + off.z);
      this.controls.target.copy(boatPos);
    } else {
      camera.position.set(this.fp.x, this.fp.y, this.fp.z);
      this.controls.target.set(0, 0, 0);
    }
    this.controls.update();
  }

  update(dt, boatPos) {
    if (this.mode === 'follow') {
      // 平滑跟随目标点；相机由 OrbitControls 阻尼自然带上
      this.controls.target.lerp(
        new THREE.Vector3(boatPos.x, boatPos.y + 0.6, boatPos.z),
        Math.min(1, dt * 3.2)
      );
    }
    this.controls.update();
  }
}
