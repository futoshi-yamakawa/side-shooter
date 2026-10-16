import Phaser from 'phaser';
import { COLOR, DEPTH, H, W } from '../config';
import type { GameScene } from '../scenes/GameScene';

export type Input = { x: number; y: number; fire: boolean; focus: boolean };

const SPEED = 330;
const FOCUS_SPEED = 160;
const FIRE_INTERVAL = 0.07;

export class Player {
  sprite: Phaser.GameObjects.Image;
  private hitbox: Phaser.GameObjects.Image;
  private muzzle: Phaser.GameObjects.Image;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly r = 3;
  alive = true;
  controllable = true;
  invuln = 0;
  power = 1;
  private fireCd = 0;
  private bank = 0;
  private shotIndex = 0;

  constructor(private g: GameScene) {
    this.trail = g.add
      .particles(0, 0, 'glow', {
        lifespan: { min: 120, max: 240 },
        speedX: { min: -320, max: -180 },
        speedY: { min: -20, max: 20 },
        scale: { start: 0.45, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xffffff, 0x3cf0ff, 0x3c8aff],
        frequency: 16,
        blendMode: 'ADD',
      })
      .setDepth(DEPTH.player - 1);
    this.sprite = g.add.image(160, H / 2, 'player').setDepth(DEPTH.player);
    this.trail.startFollow(this.sprite, -30, 0);
    this.hitbox = g.add.image(0, 0, 'hitbox').setDepth(DEPTH.player + 1).setVisible(false);
    this.muzzle = g.add.image(0, 0, 'muzzle').setDepth(DEPTH.player + 1).setBlendMode(Phaser.BlendModes.ADD).setOrigin(0.1, 0.5).setVisible(false);
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }

  setTimeScale(s: number) {
    this.trail.timeScale = s;
  }

  update(dt: number, input: Input) {
    if (!this.alive) return;
    const s = this.sprite;
    if (this.controllable) {
      const sp = input.focus ? FOCUS_SPEED : SPEED;
      let { x, y } = input;
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      s.x = Phaser.Math.Clamp(s.x + x * sp * dt, 30, W - 40);
      s.y = Phaser.Math.Clamp(s.y + y * sp * dt, 24, H - 24);
      // Fake banking: squash vertically and tilt toward travel direction.
      this.bank = Phaser.Math.Linear(this.bank, y, Math.min(1, dt * 10));
      s.rotation = this.bank * 0.12;
      s.scaleY = 1 - Math.abs(this.bank) * 0.25;

      this.fireCd -= dt;
      if (input.fire && this.fireCd <= 0) {
        this.fire();
        this.fireCd += FIRE_INTERVAL;
        if (this.fireCd < 0) this.fireCd = 0;
      }
    }
    // Muzzle flash shows for the first half of each fire interval, so it strobes at the fire rate.
    if (this.controllable && input.fire && this.fireCd > FIRE_INTERVAL * 0.5) {
      this.muzzle.setVisible(true).setPosition(s.x + 28, s.y).setScale(0.7 + Math.random() * 0.5, 0.8 + Math.random() * 0.4);
    } else {
      this.muzzle.setVisible(false);
    }
    this.hitbox.setVisible(input.focus).setPosition(s.x + 2, s.y);

    if (this.invuln > 0) {
      this.invuln -= dt;
      s.alpha = Math.floor(this.invuln * 20) % 2 === 0 ? 0.35 : 1;
      if (this.invuln <= 0) s.alpha = 1;
    }
  }

  private fire() {
    const g = this.g;
    const x = this.sprite.x + 26;
    const y = this.sprite.y;
    const v = 1250;
    this.shotIndex++;
    const alt = this.shotIndex % 2 === 0 ? 1 : -1;
    g.pBullets.spawn('pshot', x, y - 6, v, 0, 8);
    g.pBullets.spawn('pshot', x, y + 6, v, 0, 8);
    if (this.power >= 2) {
      for (const a of [-0.09, 0.09]) {
        const b = g.pBullets.spawn('pshot2', x - 6, y + a * 40, Math.cos(a) * v, Math.sin(a) * v, 8);
        b.dmg = 0.8;
      }
    }
    if (this.power >= 3) {
      for (const a of [-0.22, 0.22]) {
        const b = g.pBullets.spawn('pshot2', x - 10, y + a * 30 + alt * 2, Math.cos(a) * v, Math.sin(a) * v, 8);
        b.dmg = 0.7;
      }
    }
    g.sfx.shot();
  }

  hit() {
    this.alive = false;
    this.sprite.setVisible(false);
    this.hitbox.setVisible(false);
    this.muzzle.setVisible(false);
    this.trail.stop();
  }

  respawn() {
    const s = this.sprite;
    this.power = Math.max(1, this.power - 1);
    s.setPosition(-60, H / 2).setVisible(true).setAlpha(1).setRotation(0).setScale(1);
    this.alive = true;
    this.controllable = false;
    this.invuln = 3;
    this.trail.start();
    this.g.tweens.add({
      targets: s,
      x: 160,
      duration: 700,
      ease: 'Cubic.Out',
      onComplete: () => (this.controllable = true),
    });
  }

  powerUp() {
    this.power = Math.min(3, this.power + 1);
    this.g.fx.ring(this.x, this.y, 0.9, COLOR.player, 400);
  }
}
