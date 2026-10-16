import Phaser from 'phaser';
import { COLOR, DEPTH, H, W } from '../config';
import type { GameScene } from '../scenes/GameScene';

export type EnemyKind = 'dart' | 'pod' | 'carrier' | 'fan' | 'turret' | 'mine';

export type EnemyParams = {
  y: number;
  amp?: number;
  freq?: number;
  speed?: number;
  dive?: boolean;
  shoot?: boolean;
  tx?: number;
  exit?: number;
  drop?: boolean;
  // turret: which surface it is mounted on
  side?: 'floor' | 'ceil';
  // fan: x where the formation turns back
  turnX?: number;
  // Formation id: destroying every member drops a capsule.
  group?: number;
  groupSize?: number;
};

type Spec = { tex: string; hp: number; r: number; score: number; color: number };

export const SPECS: Record<EnemyKind, Spec> = {
  dart: { tex: 'dart', hp: 2, r: 16, score: 100, color: COLOR.enemyHot },
  pod: { tex: 'pod', hp: 12, r: 22, score: 400, color: COLOR.pod },
  carrier: { tex: 'carrier', hp: 70, r: 34, score: 1500, color: COLOR.carrier },
  fan: { tex: 'fan', hp: 1, r: 15, score: 150, color: 0xff9a3c },
  turret: { tex: 'turret', hp: 6, r: 18, score: 300, color: 0x5aff9a },
  mine: { tex: 'mine', hp: 5, r: 17, score: 250, color: 0xff4d6d },
};

export class Enemy extends Phaser.GameObjects.Image {
  kind: EnemyKind;
  hp: number;
  r: number;
  score: number;
  color: number;
  t = 0;
  y0: number;
  vx = 0;
  vy = 0;
  fireT = 0;
  flashT = 0;
  flashCd = 0;
  dead = false;
  // left the screen without being destroyed
  gone = false;
  p: EnemyParams;
  // world-space x for terrain-mounted enemies
  wx = 0;
  barrel?: Phaser.GameObjects.Image;

  constructor(g: GameScene, kind: EnemyKind, p: EnemyParams) {
    const spec = SPECS[kind];
    super(g, W + 60, p.y, spec.tex);
    g.add.existing(this);
    this.setDepth(DEPTH.enemies);
    this.kind = kind;
    this.hp = spec.hp;
    this.r = spec.r;
    this.score = spec.score;
    this.color = spec.color;
    this.y0 = p.y;
    this.p = p;
    if (kind === 'carrier') this.x = W + 90;
    if (kind === 'turret') {
      const t = g.terrain!;
      this.wx = t.scroll + W + 30;
      this.barrel = g.add.image(this.x, this.y, 'barrel').setOrigin(0.1, 0.5).setDepth(DEPTH.enemies - 1);
      if (p.side === 'ceil') this.setFlipY(true);
    }
  }

  destroy(fromScene?: boolean) {
    this.barrel?.destroy();
    super.destroy(fromScene);
  }

  // Strobes white rather than staying white, so sustained fire still reads as hits.
  flash() {
    if (this.flashCd > 0) return;
    this.flashT = 0.035;
    this.flashCd = 0.09;
    this.setTintFill(0xffffff);
  }

  tick(dt: number, g: GameScene) {
    this.t += dt;
    this.flashCd -= dt;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.clearTint();
    }
    BEHAVIOR[this.kind](this, dt, g);
  }

  get offscreen() {
    return this.gone || this.x < -120 || this.y < -120 || this.y > H + 120;
  }
}

const BEHAVIOR: Record<EnemyKind, (e: Enemy, dt: number, g: GameScene) => void> = {
  // Gradius "fan": streams in, loops back toward the player, exits right.
  fan(e, dt, g) {
    const speed = 330;
    e.rotation -= dt * 12;
    const turnX = e.p.turnX ?? 260;
    if (e.fireT === 0) {
      e.x -= speed * dt;
      if (e.x < turnX) {
        e.fireT = 1;
        e.vy = g.player.y < e.y ? -1 : 1;
        e.t = 0;
      }
    } else {
      // half-circle turn, then straight out to the right
      const a = Math.min(1, e.t / 0.55) * Math.PI;
      e.x += -Math.cos(a) * speed * dt;
      e.y += Math.sin(a) * e.vy * speed * 0.8 * dt;
    }
    if (e.fireT === 1 && e.x > W + 60) e.gone = true;
  },

  // Gun emplacement fixed to the floor or ceiling; tracks and fires at the player.
  turret(e, dt, g) {
    const t = g.terrain!;
    e.x = e.wx - t.scroll;
    const ceil = e.p.side === 'ceil';
    e.y = ceil ? t.ceilAt(e.x) + 12 : t.floorAt(e.x) - 12;
    const aim = Math.atan2(g.player.y - e.y, g.player.x - e.x);
    const b = e.barrel!;
    b.setPosition(e.x, e.y + (ceil ? 2 : -2));
    b.rotation = Phaser.Math.Angle.RotateTo(b.rotation, aim, dt * 3);
    e.fireT -= dt;
    if (e.x < W - 40 && e.x > 80 && e.fireT <= 0) {
      e.fireT = 1.7;
      const sp = 210;
      g.shoot(e.x + Math.cos(b.rotation) * 26, e.y + Math.sin(b.rotation) * 26, Math.cos(b.rotation) * sp, Math.sin(b.rotation) * sp, 'eb_green');
    }
    if (e.x < -60) e.gone = true;
  },

  // Drifting mine; bursts into a ring when destroyed (handled by the scene).
  mine(e, dt) {
    e.x -= (e.p.speed ?? 90) * dt;
    e.y = e.y0 + Math.sin(e.t * 1.6) * (e.p.amp ?? 30);
    e.rotation += dt * 1.5;
  },

  // Fast skimmer. Optional sine weave, optional dive toward the player.
  dart(e, dt, g) {
    const p = e.p;
    const speed = p.speed ?? 380;
    e.x -= speed * dt;
    if (p.dive && e.t > 0.7) {
      const target = g.player.y;
      e.y += Phaser.Math.Clamp(target - e.y, -1, 1) * 220 * dt;
    } else {
      e.y = e.y0 + (p.amp ?? 0) * Math.sin(e.t * (p.freq ?? 3));
    }
    e.rotation = Phaser.Math.Linear(e.rotation, (p.amp ?? 0) ? Math.cos(e.t * (p.freq ?? 3)) * -0.3 : 0, 0.2);
    if (p.shoot && e.fireT === 0 && e.x < W - 160) {
      e.fireT = 1;
      g.aimed(e.x - 10, e.y, 230, 1, 0, 'eb');
    }
  },

  // Slides in, hovers firing aimed triple bursts, then peels away.
  pod(e, dt, g) {
    const p = e.p;
    const tx = p.tx ?? 780;
    const hold = 3.2;
    e.rotation += dt * 1.2;
    if (e.t < hold) {
      e.x += (tx - e.x) * Math.min(1, dt * 3);
      e.fireT -= dt;
      if (e.t > 0.8 && e.fireT <= 0) {
        e.fireT = 0.85;
        g.aimed(e.x, e.y, 210, 3, 0.22, 'eb');
      }
    } else {
      e.vx = Math.min(e.vx + 600 * dt, 360);
      e.x -= e.vx * dt;
      e.y += (p.exit ?? 1) * e.vx * 0.4 * dt;
    }
  },

  // Slow armoured gunship: radial bursts plus aimed heavy shells.
  carrier(e, dt, g) {
    const target = 760;
    if (e.x > target) e.x -= 90 * dt;
    else e.x -= 18 * dt;
    e.y = e.y0 + Math.sin(e.t * 0.9) * 26;
    e.fireT -= dt;
    if (e.x < W - 40 && e.fireT <= 0) {
      const cycle = Math.floor(e.t / 1.3) % 2;
      if (cycle === 0) g.ring(e.x - 10, e.y, 16, 150, e.t, 'eb_blue');
      else g.aimed(e.x - 40, e.y, 250, 3, 0.18, 'eb_big', 10);
      e.fireT = 1.3;
    }
  },
};
