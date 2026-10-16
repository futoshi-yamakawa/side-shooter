import Phaser from 'phaser';
import { COLOR, DEPTH, H, W } from '../config';
import type { GameScene } from '../scenes/GameScene';

export type EnemyKind = 'dart' | 'pod' | 'carrier';

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
};

type Spec = { tex: string; hp: number; r: number; score: number; color: number };

export const SPECS: Record<EnemyKind, Spec> = {
  dart: { tex: 'dart', hp: 2, r: 16, score: 100, color: COLOR.enemyHot },
  pod: { tex: 'pod', hp: 12, r: 22, score: 400, color: COLOR.pod },
  carrier: { tex: 'carrier', hp: 70, r: 34, score: 1500, color: COLOR.carrier },
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
  p: EnemyParams;

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
    return this.x < -120 || this.y < -120 || this.y > H + 120;
  }
}

const BEHAVIOR: Record<EnemyKind, (e: Enemy, dt: number, g: GameScene) => void> = {
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
