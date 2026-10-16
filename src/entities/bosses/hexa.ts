import Phaser from 'phaser';
import { COLOR, DEPTH, H, W } from '../../config';
import type { GameScene } from '../../scenes/GameScene';
import type { BossLike, HitResult } from './types';

const MAX_HP = 1100;

type State = 'enter' | 'p1' | 'shift' | 'p2' | 'dying' | 'dead';

// Stage 1 boss. Phase 1 fires fans and turret streams with armour on; at 50% HP
// the armour blows off, the core turns red and it switches to a rotating
// spiral with dash attacks.
export class HexaBoss implements BossLike {
  readonly name = 'HEXA-GARGANT';
  readonly color = COLOR.boss;
  readonly size = { w: 110, h: 80 };
  body: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  hp = MAX_HP;
  readonly maxHp = MAX_HP;
  readonly r = 70;
  state: State = 'enter';
  private t = 0;
  private atkT = 0;
  private pattern = 0;
  private spiral = 0;
  private flashT = 0;
  private flashCd = 0;
  private baseY = H / 2;
  private dashing = false;

  constructor(private g: GameScene) {
    this.body = g.add.image(W + 200, H / 2, 'boss').setDepth(DEPTH.boss);
    this.core = g.add.image(W + 200, H / 2, 'boss_core').setDepth(DEPTH.boss + 1).setBlendMode(Phaser.BlendModes.ADD);
  }

  get x() {
    return this.body.x;
  }
  get y() {
    return this.body.y;
  }
  get coreX() {
    return this.body.x + 10;
  }
  get vulnerable() {
    return this.state === 'p1' || this.state === 'p2';
  }
  get active() {
    return this.state !== 'enter' && this.state !== 'dying' && this.state !== 'dead';
  }

  hitTest(x: number, y: number, dmg: number): HitResult {
    const dx = this.x - x;
    const dy = this.y - y;
    // elliptical hull: wide, a bit shorter
    if ((dx * dx) / (120 * 120) + (dy * dy) / (85 * 85) >= 1) return null;
    return this.damage(dmg) ? 'hit' : 'block';
  }

  touches(x: number, y: number) {
    const dx = this.x - x;
    const dy = this.y - y;
    return (dx * dx) / (100 * 100) + (dy * dy) / (70 * 70) < 1;
  }

  bomb(dmg: number) {
    this.damage(dmg);
  }

  enter(onArrive: () => void) {
    this.g.tweens.add({
      targets: this.body,
      x: 760,
      duration: 2600,
      ease: 'Cubic.Out',
      onComplete: () => {
        this.state = 'p1';
        this.atkT = 0.6;
        onArrive();
      },
    });
  }

  update(dt: number) {
    const g = this.g;
    this.t += dt;
    const b = this.body;

    if (this.state === 'p1') {
      b.y = this.baseY + Math.sin(this.t * 0.7) * 120;
      this.atkT -= dt;
      if (this.atkT <= 0) this.attackP1();
    } else if (this.state === 'p2') {
      if (!this.dashing) b.y = this.baseY + Math.sin(this.t * 1.1) * 150;
      this.spiral += dt;
      if (this.spiral > 0.12) {
        this.spiral = 0;
        const a = this.t * 2.2;
        for (let k = 0; k < 3; k++) {
          const ang = a + (k * Math.PI * 2) / 3;
          g.shoot(this.coreX, b.y, Math.cos(ang) * 165, Math.sin(ang) * 165, 'eb', 6);
        }
      }
      this.atkT -= dt;
      if (this.atkT <= 0) this.attackP2();
    }

    // core pulse
    const pulse = 1 + Math.sin(this.t * (this.state === 'p2' ? 14 : 6)) * 0.12;
    this.core.setPosition(this.coreX, b.y).setScale(pulse * (this.state === 'p2' || this.state === 'dying' ? 1.25 : 1));

    this.flashCd -= dt;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.body.clearTint();
    }
  }

  private attackP1() {
    const g = this.g;
    const b = this.body;
    switch (this.pattern % 3) {
      case 0:
        // three aimed fans
        for (let i = 0; i < 3; i++) {
          g.time.delayedCall(i * 220, () => this.vulnerable && g.aimed(b.x - 100, b.y, 230, 9, 0.11, 'eb'));
        }
        this.atkT = 1.9;
        break;
      case 1:
        // twin turret streams
        for (let i = 0; i < 8; i++) {
          g.time.delayedCall(i * 110, () => {
            if (!this.vulnerable) return;
            g.aimed(b.x - 84, b.y - 28, 300, 1, 0, 'eb_big', 10);
            g.aimed(b.x - 84, b.y + 28, 300, 1, 0, 'eb_big', 10);
          });
        }
        this.atkT = 1.8;
        break;
      case 2:
        // offset rings
        for (let i = 0; i < 3; i++) {
          g.time.delayedCall(i * 300, () => this.vulnerable && g.ring(b.x - 40, b.y, 24, 140 + i * 20, i * 0.13, 'eb_blue'));
        }
        this.atkT = 2.2;
        break;
    }
    this.pattern++;
  }

  private attackP2() {
    const g = this.g;
    const b = this.body;
    if (this.pattern % 2 === 0) {
      // telegraphed dash
      this.dashing = true;
      const ty = Phaser.Math.Clamp(g.player.y, 110, H - 110);
      g.tweens.chain({
        targets: b,
        tweens: [
          { y: ty, x: 820, duration: 450, ease: 'Sine.InOut' },
          {
            x: 420,
            duration: 380,
            ease: 'Cubic.In',
            onComplete: () => {
              g.juice.shake(220, 0.012);
              g.sfx.impact();
              g.ring(b.x - 60, b.y, 20, 200, 0, 'eb_big', 10);
            },
          },
          { x: 760, duration: 900, ease: 'Cubic.Out', onComplete: () => (this.dashing = false) },
        ],
      });
      this.atkT = 3.2;
    } else {
      for (let i = 0; i < 4; i++) g.time.delayedCall(i * 160, () => this.vulnerable && g.aimed(b.x - 60, b.y, 280, 5, 0.16, 'eb_big', 10));
      this.atkT = 2.0;
    }
    this.pattern++;
  }

  damage(n: number) {
    if (!this.vulnerable) return false;
    this.hp -= n;
    if (this.flashCd <= 0) {
      this.body.setTintFill(0xffffff);
      this.flashT = 0.035;
      this.flashCd = 0.1;
    }
    if (this.state === 'p1' && this.hp <= this.maxHp * 0.5) this.shift();
    else if (this.state === 'p2' && this.hp <= 0) {
      this.hp = 0;
      this.state = 'dying';
      this.g.onBossDying();
    }
    return true;
  }

  private shift() {
    const g = this.g;
    this.state = 'shift';
    g.cancelBullets(false);
    g.juice.stop(160);
    g.juice.flash(260, 0xff4d6d, 0.5);
    g.juice.shake(500, 0.016);
    g.sfx.impact();
    g.sfx.explodeMid();
    // armour plates blow off
    for (const [dx, dy] of [[-40, -60], [-40, 60], [70, -70], [70, 70]]) {
      g.fx.explosion(this.x + dx, this.y + dy, 'm', COLOR.boss);
    }
    this.core.setTint(0xff3030);
    this.body.setTint(0xff9090);
    g.hud.banner('CORE EXPOSED', '', 1400, '#ff4d6d');
    g.time.delayedCall(1300, () => {
      this.body.clearTint();
      this.state = 'p2';
      this.atkT = 1.0;
    });
  }

  destroy() {
    this.state = 'dead';
    this.body.destroy();
    this.core.destroy();
  }
}
