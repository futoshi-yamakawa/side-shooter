import Phaser from 'phaser';
import { DEPTH, H, W } from '../config';

// Game-feel controller. Hitstop freezes simulation time for a few frames on
// impactful hits; slow-mo scales it for dramatic moments. Every system reads
// `scale` so a freeze stops bullets, tweens, timers and particles together.
export class Juice {
  private hitstop = 0;
  private slowT = 0;
  private slowScale = 1;
  private flashRect: Phaser.GameObjects.Rectangle;
  private flashT = 0;
  private flashDur = 1;
  scale = 1;

  constructor(private scene: Phaser.Scene) {
    this.flashRect = scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setDepth(DEPTH.overlay).setScrollFactor(0);
  }

  stop(ms: number) {
    this.hitstop = Math.max(this.hitstop, ms / 1000);
  }

  slow(ms: number, scale: number) {
    this.slowT = Math.max(this.slowT, ms / 1000);
    this.slowScale = scale;
  }

  shake(ms: number, intensity: number) {
    const cam = this.scene.cameras.main;
    // Keep the stronger shake if one is already running.
    if (cam.shakeEffect.isRunning && cam.shakeEffect.intensity.x > intensity) return;
    cam.shake(ms, intensity, true);
  }

  flash(ms: number, color = 0xffffff, alpha = 0.6) {
    this.flashRect.setFillStyle(color, alpha);
    this.flashDur = ms / 1000;
    this.flashT = this.flashDur;
  }

  update(realDt: number) {
    // The flash fades in real time so it still reads during a hitstop freeze.
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - realDt);
      const k = this.flashT / this.flashDur;
      this.flashRect.alpha = k * k;
    }
    if (this.hitstop > 0) {
      this.hitstop -= realDt;
      this.scale = 0;
    } else if (this.slowT > 0) {
      this.slowT -= realDt;
      this.scale = this.slowScale;
    } else {
      this.scale = 1;
    }
    return this.scale;
  }
}
