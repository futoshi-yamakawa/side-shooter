import Phaser from 'phaser';
import { COLOR, DEPTH, H, W } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { ControlState } from '../systems/controls';
import type { Bullet } from './bullets';

export type Weapon = 'spread' | 'laser';
export type Loadout = { power: number; weapon: Weapon; missile: number; options: number; shield: boolean; bombs: number };

const SPEED = 330;
const MISSILE_INTERVAL = 0.42;
const FOCUS_SPEED = 160;
const FIRE_INTERVAL = 0.07;
export const MAX_OPTIONS = 3;
export const MAX_BOMBS = 5;
// Options trail the ship along its recent path, this many recorded steps apart.
const OPTION_SPACING = 7;
const TRAIL_STEP = 6;
const HISTORY = OPTION_SPACING * MAX_OPTIONS + 1;

export class Player {
  sprite: Phaser.GameObjects.Image;
  private hitbox: Phaser.GameObjects.Image;
  private muzzle: Phaser.GameObjects.Image;
  private shieldImg: Phaser.GameObjects.Image;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  private options: Phaser.GameObjects.Image[] = [];
  private history: { x: number; y: number }[] = [];
  readonly r = 3;
  alive = true;
  controllable = true;
  invuln = 0;
  power = 1;
  weapon: Weapon = 'spread';
  missile = 0;
  shield = false;
  bombs = 2;
  private fireCd = 0;
  private missileCd = 0;
  private bank = 0;
  private shotIndex = 0;
  private t = 0;

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
    this.shieldImg = g.add.image(0, 0, 'shield').setDepth(DEPTH.player + 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.resetHistory();
  }

  get x() {
    return this.sprite.x;
  }
  get y() {
    return this.sprite.y;
  }
  get optionCount() {
    return this.options.length;
  }

  setTimeScale(s: number) {
    this.trail.timeScale = s;
  }

  private resetHistory() {
    this.history = Array.from({ length: HISTORY }, () => ({ x: this.sprite.x, y: this.sprite.y }));
  }

  update(dt: number, input: ControlState) {
    this.t += dt;
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
      this.missileCd -= dt;
      if (input.fire && this.missile > 0 && this.missileCd <= 0) {
        this.fireMissiles();
        this.missileCd = MISSILE_INTERVAL;
      }
    }

    // Record the path only while moving, so options bunch up when the ship stops
    // and stretch out behind it when it moves (Gradius / TwinBee feel).
    // Samples are taken every TRAIL_STEP px of travel (interpolated), so the
    // spacing is the same at any frame rate.
    const head = this.history[0];
    const dist = Math.hypot(s.x - head.x, s.y - head.y);
    if (dist >= TRAIL_STEP) {
      const n = Math.floor(dist / TRAIL_STEP);
      for (let k = 1; k <= n; k++) {
        const f = (k * TRAIL_STEP) / dist;
        this.history.unshift({ x: head.x + (s.x - head.x) * f, y: head.y + (s.y - head.y) * f });
      }
      this.history.length = HISTORY;
    }
    this.options.forEach((o, i) => {
      const h = this.history[(i + 1) * OPTION_SPACING];
      o.setPosition(h.x - 8, h.y);
      o.rotation += dt * 6;
      o.setScale(1 + Math.sin(this.t * 10 + i) * 0.08);
    });

    // Muzzle flash shows for the first half of each fire interval, so it strobes at the fire rate.
    if (this.controllable && input.fire && this.fireCd > FIRE_INTERVAL * 0.5) {
      this.muzzle.setVisible(true).setPosition(s.x + 28, s.y).setScale(0.7 + Math.random() * 0.5, 0.8 + Math.random() * 0.4);
    } else {
      this.muzzle.setVisible(false);
    }
    this.hitbox.setVisible(input.focus).setPosition(s.x + 2, s.y);
    this.shieldImg.setVisible(this.shield).setPosition(s.x, s.y).setScale(1 + Math.sin(this.t * 6) * 0.04).setRotation(this.t);

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
    if (this.weapon === 'laser') {
      this.fireLaser(x, y, 1);
      for (const o of this.options) this.fireLaser(o.x + 14, o.y, 0.7);
      g.sfx.laser();
      return;
    }
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
    for (const o of this.options) {
      const b = g.pBullets.spawn('pshot', o.x + 12, o.y, v, 0, 8);
      b.dmg = 0.8;
    }
    g.sfx.shot();
  }

  // Piercing beam. Power widens it and raises damage; it passes through
  // targets, hitting each once.
  private fireLaser(x: number, y: number, k: number) {
    const lv = this.power;
    const b = this.g.pBullets.spawn('plaser', x + 30, y, 1700, 0, 6 + lv * 2);
    b.pierce = true;
    b.dmg = (0.9 + lv * 0.55) * k;
    b.setScale(1, (0.8 + lv * 0.45) * k);
  }

  private fireMissiles() {
    const sources = [{ x: this.x, y: this.y }, ...this.options.map((o) => ({ x: o.x, y: o.y }))];
    for (const s of sources) {
      this.missileFrom(s.x, s.y + 8, 1);
      if (this.missile >= 2) this.missileFrom(s.x, s.y - 8, -1);
    }
  }

  // Gradius-style missile: drops (or climbs) at an angle, then hugs the
  // terrain surface; with no terrain it levels out into a forward glide.
  private missileFrom(x: number, y: number, dir: 1 | -1) {
    const g = this.g;
    const b = g.pBullets.spawn('missile', x, y, 200, 280 * dir, 7);
    b.dmg = 3;
    b.setFlipY(dir < 0);
    b.step = (m: Bullet, dt: number) => {
      const t = g.terrain;
      const surface = t ? (dir > 0 ? t.floorAt(m.x) : t.ceilAt(m.x)) : dir > 0 ? Infinity : -Infinity;
      const onSurface = dir > 0 ? m.y + 6 >= surface : m.y - 6 <= surface;
      if (t && t.env > 0.05 && onSurface) {
        // ride the surface; a wall in front ends it
        const ahead = dir > 0 ? t.floorAt(m.x + 10) : t.ceilAt(m.x + 10);
        if (Math.abs(ahead - surface) > 24) {
          g.fx.explosion(m.x, m.y, 's', 0xffd23c);
          return false;
        }
        m.vx = 380;
        m.vy = 0;
        m.y = surface - 6 * dir;
        m.rotation = 0;
      } else if (m.t > 0.3 && (!t || t.env <= 0.05)) {
        m.vx = Math.min(m.vx + 900 * dt, 460);
        m.vy = Phaser.Math.Linear(m.vy, 90 * dir, Math.min(1, dt * 4));
        m.rotation = Math.atan2(m.vy, m.vx) * 0.6;
      } else {
        m.rotation = Math.atan2(m.vy, m.vx) * 0.6;
      }
      return true;
    };
  }

  // Returns true when the guard soaked the hit and the ship survives.
  absorbHit() {
    if (!this.shield) return false;
    this.shield = false;
    this.invuln = 1.2;
    this.g.fx.ring(this.x, this.y, 1.6, 0xc8a0ff, 500);
    this.g.fx.spark(this.x, this.y, 0xc8a0ff, 24);
    return true;
  }

  hit() {
    this.alive = false;
    this.sprite.setVisible(false);
    this.hitbox.setVisible(false);
    this.muzzle.setVisible(false);
    this.shieldImg.setVisible(false);
    this.trail.stop();
    // Losing a life costs one level of power, one missile level and one option.
    this.power = Math.max(1, this.power - 1);
    this.missile = Math.max(0, this.missile - 1);
    const lost = this.options.pop();
    if (lost) {
      this.g.fx.explosion(lost.x, lost.y, 's', 0xff7ad8);
      lost.destroy();
    }
  }

  respawn() {
    const s = this.sprite;
    const y = this.g.terrain ? this.g.terrain.gapMid(160) : H / 2;
    s.setPosition(-60, y).setVisible(true).setAlpha(1).setRotation(0).setScale(1);
    this.resetHistory();
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
    if (this.power >= 3) return false;
    this.power++;
    this.g.fx.ring(this.x, this.y, 0.9, COLOR.player, 400);
    return true;
  }

  addOption() {
    if (this.options.length >= MAX_OPTIONS) return false;
    // The new option starts on the ship and peels away along the trail once it moves.
    for (let i = (this.options.length + 1) * OPTION_SPACING - OPTION_SPACING + 1; i < HISTORY; i++) this.history[i] = { x: this.x, y: this.y };
    const o = this.g.add.image(this.x, this.y, 'option').setDepth(DEPTH.player).setBlendMode(Phaser.BlendModes.ADD);
    this.options.push(o);
    this.g.fx.ring(this.x, this.y, 0.7, 0xff7ad8, 400);
    return true;
  }

  // Toggles between spread shot and laser; power level carries over.
  switchWeapon() {
    this.weapon = this.weapon === 'spread' ? 'laser' : 'spread';
    this.g.fx.ring(this.x, this.y, 0.9, this.weapon === 'laser' ? 0x3cf0ff : 0x7dff9a, 400);
    return true;
  }

  addMissile() {
    if (this.missile >= 2) return false;
    this.missile++;
    return true;
  }

  get loadout(): Loadout {
    return { power: this.power, weapon: this.weapon, missile: this.missile, options: this.options.length, shield: this.shield, bombs: this.bombs };
  }

  // Restores equipment carried over from the previous stage.
  applyLoadout(l: Loadout) {
    this.power = l.power;
    this.weapon = l.weapon;
    this.missile = l.missile;
    this.shield = l.shield;
    this.bombs = l.bombs;
    for (let i = 0; i < l.options; i++) this.addOption();
  }

  addShield() {
    if (this.shield) return false;
    this.shield = true;
    this.g.fx.ring(this.x, this.y, 0.8, 0xc8a0ff, 400);
    return true;
  }

  addBomb() {
    if (this.bombs >= MAX_BOMBS) return false;
    this.bombs++;
    return true;
  }
}
