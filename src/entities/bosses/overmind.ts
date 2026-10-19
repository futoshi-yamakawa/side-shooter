import Phaser from 'phaser';
import { DEPTH, H, W } from '../../config';
import type { GameScene } from '../../scenes/GameScene';
import type { BossLike, HitResult } from './types';

const POD_HP = 70;
const CORE_HP = 950;
const ORBIT = 150;
const COLOR = 0xff4d6d;

type Pod = { img: Phaser.GameObjects.Image; hp: number; fireT: number; flashT: number };

// Final boss. A sealed eye guarded by four orbiting gun pods; destroying the
// pods opens the eye, which then fights back with spirals and laser fans.
export class Overmind implements BossLike {
  readonly name = 'OVERMIND';
  readonly color = COLOR;
  readonly size = { w: 110, h: 110 };
  readonly maxHp = CORE_HP + POD_HP * 4;
  private shell: Phaser.GameObjects.Image;
  private eye: Phaser.GameObjects.Image;
  private lid: Phaser.GameObjects.Image;
  private pods: Pod[];
  private coreHp = CORE_HP;
  private state: 'enter' | 'sealed' | 'opening' | 'open' | 'dying' | 'dead' = 'enter';
  private t = 0;
  private spin = 0;
  private ringT = 2;
  private atkT = 1.5;
  private spiralT = 0;
  private flashT = 0;

  constructor(private g: GameScene) {
    this.shell = g.add.image(W + 200, H / 2, 'boss3_shell').setDepth(DEPTH.boss);
    this.eye = g.add.image(W + 200, H / 2, 'boss3_eye').setDepth(DEPTH.boss + 1);
    this.lid = g.add.image(W + 200, H / 2, 'boss3_lid').setDepth(DEPTH.boss + 2);
    this.pods = [0, 1, 2, 3].map(() => ({
      img: g.add.image(W + 200, H / 2, 'boss3_pod').setDepth(DEPTH.boss + 2),
      hp: POD_HP,
      fireT: 1 + Math.random(),
      flashT: 0,
    }));
  }

  get x() {
    return this.shell.x;
  }
  get y() {
    return this.shell.y;
  }
  get hp() {
    return this.coreHp + this.pods.reduce((s, p) => s + Math.max(0, p.hp), 0);
  }
  get active() {
    return this.state === 'sealed' || this.state === 'open' || this.state === 'opening';
  }

  enter(onArrive: () => void) {
    this.g.tweens.add({
      targets: this.shell,
      x: 740,
      duration: 3000,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.state = 'sealed';
        onArrive();
      },
    });
  }

  update(dt: number) {
    const g = this.g;
    this.t += dt;
    const s = this.shell;
    s.y = H / 2 + Math.sin(this.t * 0.6) * (this.state === 'open' ? 90 : 40);
    s.rotation += dt * 0.3;
    this.eye.setPosition(s.x, s.y);
    this.lid.setPosition(s.x, s.y);

    // pods orbit; the orbit speeds up as fewer remain
    const alive = this.pods.filter((p) => p.hp > 0);
    this.spin += dt * (0.6 + (4 - alive.length) * 0.25);
    this.pods.forEach((p, i) => {
      const a = this.spin + (i * Math.PI) / 2;
      p.img.setPosition(s.x + Math.cos(a) * ORBIT, s.y + Math.sin(a) * ORBIT * 0.85).setRotation(-this.spin * 2);
      if (p.flashT > 0 && (p.flashT -= dt) <= 0) p.img.clearTint();
      if (p.hp <= 0 || this.state !== 'sealed') return;
      p.fireT -= dt;
      if (p.fireT <= 0) {
        p.fireT = 2.1 + Math.random() * 0.8;
        g.aimed(p.img.x, p.img.y, 240, 1, 0, 'eb_big', 10);
      }
    });

    if (this.state === 'sealed') {
      this.ringT -= dt;
      if (this.ringT <= 0) {
        this.ringT = 2.6;
        g.ring(s.x, s.y, 14, 140, this.t, 'eb');
      }
    } else if (this.state === 'open') {
      // three-arm spiral, reversing direction every few seconds
      this.spiralT += dt;
      if (this.spiralT > 0.15) {
        this.spiralT = 0;
        const dir = Math.floor(this.t / 4) % 2 === 0 ? 1 : -1;
        const a = this.t * 1.7 * dir;
        for (let k = 0; k < 3; k++) {
          const ang = a + (k * Math.PI * 2) / 3;
          g.shoot(s.x, s.y, Math.cos(ang) * 150, Math.sin(ang) * 150, 'eb', 6);
        }
      }
      this.atkT -= dt;
      if (this.atkT <= 0) {
        this.atkT = 3;
        for (let i = 0; i < 3; i++) {
          g.time.delayedCall(i * 120, () => {
            if (this.state !== 'open') return;
            const base = Math.atan2(g.player.y - s.y, g.player.x - s.x);
            for (const off of [-0.3, 0, 0.3]) {
              const a = base + off;
              g.shoot(s.x + Math.cos(a) * 50, s.y + Math.sin(a) * 50, Math.cos(a) * 420, Math.sin(a) * 420, 'elaser', 5);
            }
          });
        }
        g.sfx.laser();
      }
      this.eye.setScale(1 + Math.sin(this.t * 10) * 0.05);
    }
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.eye.clearTint();
  }

  hitTest(x: number, y: number, dmg: number): HitResult {
    if (!this.active) return null;
    for (const p of this.pods) {
      if (p.hp <= 0) continue;
      if ((p.img.x - x) ** 2 + (p.img.y - y) ** 2 < 24 * 24) {
        this.damagePod(p, dmg);
        return 'hit';
      }
    }
    // Sealed, the shell deflects shots. Open, the whole shell counts as the eye:
    // a ring-shaped "block" zone would stop every bullet before it reached the
    // centre, since shots enter from outside a step at a time.
    const d2 = (this.x - x) ** 2 + (this.y - y) ** 2;
    if (d2 >= 94 * 94) return null;
    if (this.state !== 'open') return 'block';
    this.damageCore(dmg);
    return 'hit';
  }

  touches(x: number, y: number) {
    if ((this.x - x) ** 2 + (this.y - y) ** 2 < 86 * 86) return true;
    return this.pods.some((p) => p.hp > 0 && (p.img.x - x) ** 2 + (p.img.y - y) ** 2 < 20 * 20);
  }

  bomb(dmg: number) {
    if (!this.active) return;
    for (const p of this.pods) if (p.hp > 0) this.damagePod(p, dmg * 0.6);
    if (this.state === 'open') this.damageCore(dmg);
  }

  private damagePod(p: Pod, dmg: number) {
    const g = this.g;
    p.hp -= dmg;
    if (p.flashT <= 0) {
      p.img.setTintFill(0xffffff);
      p.flashT = 0.04;
    }
    if (p.hp > 0) return;
    p.img.setVisible(false);
    g.fx.explosion(p.img.x, p.img.y, 'l', 0xffb03c);
    g.juice.stop(70);
    g.juice.shake(240, 0.01);
    g.sfx.explodeMid();
    if (this.pods.every((q) => q.hp <= 0)) this.open();
  }

  private open() {
    const g = this.g;
    this.state = 'opening';
    g.cancelBullets(false);
    g.juice.stop(160);
    g.juice.flash(300, 0xff4d6d, 0.5);
    g.juice.shake(700, 0.018);
    g.sfx.impact();
    g.hud.banner('CORE AWAKENED', '', 1400, '#ff4d6d');
    g.tweens.add({ targets: this.lid, scaleY: 0, alpha: 0, duration: 900, ease: 'Cubic.In' });
    g.time.delayedCall(1300, () => {
      this.state = 'open';
      this.atkT = 1.2;
    });
  }

  private damageCore(dmg: number) {
    this.coreHp -= dmg;
    if (this.flashT <= 0) {
      this.eye.setTintFill(0xffffff);
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
    [this.shell, this.eye, this.lid, ...this.pods.map((p) => p.img)].forEach((o) => o.destroy());
  }
}
