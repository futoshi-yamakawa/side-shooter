import Phaser from 'phaser';
import { DEPTH, H, W } from '../../config';
import type { GameScene } from '../../scenes/GameScene';
import type { BossLike, HitResult } from './types';

const CORE_HP = 520;
const BARRIER_HP = 55;
const COLOR = 0x5ab8ff;

type Barrier = { img: Phaser.GameObjects.Image; hp: number; dx: number; flashT: number };

// Stage 2 boss, a nod to Gradius' Big Core: the core sits at the end of a
// channel behind three barrier walls, and only shots that travel down the
// channel can reach it. It tracks the player vertically and fires straight
// laser volleys from four ports.
export class BarrierCore implements BossLike {
  readonly name = 'BARRIER CORE';
  readonly color = COLOR;
  readonly size = { w: 140, h: 80 };
  readonly maxHp = CORE_HP + BARRIER_HP * 3;
  private body: Phaser.GameObjects.Image;
  private core: Phaser.GameObjects.Image;
  private barriers: Barrier[];
  private coreHp = CORE_HP;
  private state: 'enter' | 'fight' | 'dying' | 'dead' = 'enter';
  private t = 0;
  private atkT = 1;
  private volley = 0;
  private flashT = 0;

  constructor(private g: GameScene) {
    this.body = g.add.image(W + 220, H / 2, 'boss2').setDepth(DEPTH.boss);
    this.core = g.add.image(W + 220, H / 2, 'boss2_core').setDepth(DEPTH.boss + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.barriers = [-92, -64, -36].map((dx) => ({
      img: g.add.image(W + 220, H / 2, 'barrier').setDepth(DEPTH.boss + 1),
      hp: BARRIER_HP,
      dx,
      flashT: 0,
    }));
  }

  get x() {
    return this.body.x;
  }
  get y() {
    return this.body.y;
  }
  get hp() {
    return this.coreHp + this.barriers.reduce((s, b) => s + Math.max(0, b.hp), 0);
  }
  get active() {
    return this.state === 'fight';
  }
  private get broken() {
    return this.barriers.filter((b) => b.hp <= 0).length;
  }

  enter(onArrive: () => void) {
    this.g.tweens.add({
      targets: this.body,
      x: 730,
      duration: 2800,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.state = 'fight';
        onArrive();
      },
    });
  }

  update(dt: number) {
    const g = this.g;
    this.t += dt;
    const b = this.body;
    if (this.state === 'fight') {
      // slow vertical tracking keeps the channel lined up with the player only briefly
      const top = (g.terrain?.ceilAt(b.x) ?? 0) + 100;
      const bottom = (g.terrain?.floorAt(b.x) ?? H) - 100;
      const target = Phaser.Math.Clamp(g.player.y, top, bottom);
      const sp = 55 + this.broken * 20;
      b.y += Phaser.Math.Clamp(target - b.y, -sp * dt, sp * dt);
      this.atkT -= dt;
      if (this.atkT <= 0) this.attack();
    }
    const pulse = 1 + Math.sin(this.t * (6 + this.broken * 3)) * 0.15;
    this.core.setPosition(b.x, b.y).setScale(pulse);
    for (const br of this.barriers) {
      br.img.setPosition(b.x + br.dx, b.y);
      if (br.flashT > 0 && (br.flashT -= dt) <= 0) br.img.clearTint();
    }
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.core.clearTint();
  }

  private attack() {
    const g = this.g;
    const b = this.body;
    const ports = [-50, -24, 24, 50];
    for (let i = 0; i < 2; i++) {
      g.time.delayedCall(i * 110, () => {
        if (!this.active) return;
        for (const dy of ports) g.shoot(b.x - 54, b.y + dy, -560, 0, 'elaser', 5);
      });
    }
    g.sfx.laser();
    this.volley++;
    // Once barriers start falling it adds aimed fans and blue rings.
    if (this.broken >= 1 && this.volley % 2 === 0) {
      g.time.delayedCall(350, () => this.active && g.aimed(b.x - 70, b.y, 230, 5, 0.2, 'eb_blue'));
    }
    if (this.broken >= 3 && this.volley % 3 === 0) {
      g.time.delayedCall(600, () => this.active && g.ring(b.x + 40, b.y, 18, 160, this.t, 'eb'));
    }
    this.atkT = Math.max(1.1, 2 - this.broken * 0.3);
  }

  hitTest(x: number, y: number, dmg: number): HitResult {
    if (!this.active) return null;
    const dx = x - this.x;
    const dy = y - this.y;
    // Inside the channel: the front-most standing barrier blocks, then the core.
    if (Math.abs(dy) < 15 && dx > -150 && dx < 26) {
      const wall = this.barriers.find((br) => br.hp > 0);
      if (wall) {
        if (dx < wall.dx - 8) return null;
        this.damageBarrier(wall, dmg);
        return 'block';
      }
      if (dx < -22) return null;
      this.damageCore(dmg);
      return 'hit';
    }
    if ((dx * dx) / (150 * 150) + (dy * dy) / (88 * 88) < 1) return 'block';
    return null;
  }

  touches(x: number, y: number) {
    const dx = x - this.x;
    const dy = y - this.y;
    return (dx * dx) / (135 * 135) + (dy * dy) / (78 * 78) < 1;
  }

  bomb(dmg: number) {
    if (!this.active) return;
    const wall = this.barriers.find((br) => br.hp > 0);
    if (wall) this.damageBarrier(wall, dmg);
    else this.damageCore(dmg);
  }

  private damageBarrier(br: Barrier, dmg: number) {
    const g = this.g;
    br.hp -= dmg;
    if (br.flashT <= 0) {
      br.img.setTintFill(0xffffff);
      br.flashT = 0.04;
    }
    if (br.hp <= 0) {
      br.img.setVisible(false);
      g.fx.explosion(br.img.x, br.img.y, 'm', COLOR);
      g.juice.stop(60);
      g.juice.shake(200, 0.008);
      g.sfx.explodeMid();
      g.hud.popup(br.img.x, br.img.y - 30, 'BARRIER DOWN', '#9fe8ff');
    }
  }

  private damageCore(dmg: number) {
    this.coreHp -= dmg;
    if (this.flashT <= 0) {
      this.core.setTintFill(0xffffff);
      this.flashT = 0.04;
    }
    if (this.coreHp <= 0) {
      this.coreHp = 0;
      this.state = 'dying';
      this.g.onBossDying();
    }
  }

  destroy() {
    this.state = 'dead';
    this.body.destroy();
    this.core.destroy();
    this.barriers.forEach((b) => b.img.destroy());
  }
}
