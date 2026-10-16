import Phaser from 'phaser';
import { DEPTH } from '../config';

export type Size = 's' | 'm' | 'l' | 'xl';

export class Fx {
  private fire: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[];
  timeScale = 1;

  constructor(private scene: Phaser.Scene) {
    this.smoke = scene.add
      .particles(0, 0, 'glow', {
        emitting: false,
        lifespan: { min: 600, max: 1200 },
        speed: { min: 10, max: 70 },
        scale: { start: 0.8, end: 2.2 },
        alpha: { start: 0.35, end: 0 },
        tint: 0x2a1030,
        speedX: { min: -80, max: -30 },
      })
      .setDepth(DEPTH.fx - 2);
    this.fire = scene.add
      .particles(0, 0, 'glow', {
        emitting: false,
        lifespan: { min: 250, max: 650 },
        speed: { min: 40, max: 300 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffffff, 0xfff0b0, 0xffb040, 0xff6a2a, 0xff3c5a],
        blendMode: 'ADD',
      })
      .setDepth(DEPTH.fx);
    this.sparks = scene.add
      .particles(0, 0, 'glow', {
        emitting: false,
        lifespan: { min: 100, max: 260 },
        speed: { min: 160, max: 520 },
        scale: { start: 0.22, end: 0 },
        blendMode: 'ADD',
      })
      .setDepth(DEPTH.fx + 1);
    this.debris = scene.add
      .particles(0, 0, 'debris', {
        emitting: false,
        lifespan: { min: 500, max: 1100 },
        speed: { min: 80, max: 380 },
        rotate: { start: 0, end: 900 },
        scale: { start: 1.1, end: 0.3 },
        alpha: { start: 1, end: 0 },
        tint: [0xbbbbbb, 0xff9a6a, 0x888899],
      })
      .setDepth(DEPTH.fx - 1);
    this.emitters = [this.smoke, this.fire, this.sparks, this.debris];
  }

  setTimeScale(s: number) {
    this.timeScale = s;
    for (const e of this.emitters) e.timeScale = s;
  }

  spark(x: number, y: number, tint: number, n = 4, angle?: { min: number; max: number }) {
    this.sparks.particleTint = tint;
    if (angle) this.sparks.setEmitterAngle(angle);
    else this.sparks.setEmitterAngle({ min: 0, max: 360 });
    this.sparks.explode(n, x, y);
  }

  explosion(x: number, y: number, size: Size, tint = 0xffb040) {
    const k = { s: 1, m: 2, l: 3.4, xl: 6 }[size];
    this.fire.explode(Math.round(10 * k), x, y);
    this.spark(x, y, tint, Math.round(8 * k));
    this.debris.explode(Math.round(4 * k), x, y);
    if (size !== 's') this.smoke.explode(Math.round(4 * k), x, y);
    this.ring(x, y, 0.25 * k, tint, 320 + 80 * k);
    this.bloom(x, y, 1.2 * k, 180 + 40 * k);
  }

  ring(x: number, y: number, scale: number, tint: number, ms: number) {
    const r = this.scene.add.image(x, y, 'ring').setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(scale * 0.15);
    this.scene.tweens.add({ targets: r, scale, alpha: 0, duration: ms, ease: 'Cubic.Out', onComplete: () => r.destroy() });
  }

  bloom(x: number, y: number, scale: number, ms: number, tint = 0xffffff) {
    const g = this.scene.add.image(x, y, 'glow').setDepth(DEPTH.fx + 2).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(scale);
    this.scene.tweens.add({ targets: g, scale: scale * 1.6, alpha: 0, duration: ms, ease: 'Quad.Out', onComplete: () => g.destroy() });
  }
}
