import Phaser from 'phaser';
import { COLOR, DEPTH, FONT, H, W } from '../config';
import { audio, AudioEngine } from '../systems/audio';
import { Background } from '../systems/background';
import { Fx } from '../systems/fx';
import { Hud } from '../systems/hud';
import { Juice } from '../systems/juice';
import { Terrain } from '../systems/terrain';
import { Controls } from '../systems/controls';
import { BulletPool, Bullet } from '../entities/bullets';
import { Player, Loadout } from '../entities/player';
import { Capsule, CapsuleKind } from '../entities/capsule';
import { CAPSULES } from '../systems/textures';
import { Enemy, EnemyKind, EnemyParams } from '../entities/enemy';
import type { BossLike } from '../entities/bosses/types';
import { STAGES, StageDef } from '../stage/stages';

type Star = Phaser.GameObjects.Image & { vx: number; vy: number; t: number };

type Mode = 'play' | 'warning' | 'boss' | 'clear' | 'over';

// What survives from one stage into the next.
export type Carry = { score: number; lives: number; loadout: Loadout };

export type GameData = { stage?: number; carry?: Carry; boss?: boolean; startAt?: number };

const HI_KEY = 'side-shooter.hi';
// Frame-time cap. ?maxdt= raises it so automated playtests on slow headless
// renderers still advance at roughly real time.
const MAX_DT = Number(new URLSearchParams(location.search).get('maxdt')) || 1 / 20;

// Rings fire this fraction of the bullets their pattern asks for.
const BULLET_DENSITY = 0.65;
// Score extends, then one every EXTEND_EVERY after the last.
const EXTENDS = [100_000, 300_000];
const EXTEND_EVERY = 300_000;
const MAX_LIVES = 9;
// The Nth carrier destroyed in a stage leaves a 1UP instead of a gauge capsule.
const ONE_UP_CARRIER = 2;

export class GameScene extends Phaser.Scene {
  sfx!: AudioEngine;
  juice!: Juice;
  fx!: Fx;
  hud!: Hud;
  player!: Player;
  pBullets!: BulletPool;
  eBullets!: BulletPool;
  terrain: Terrain | null = null;
  private def!: StageDef;
  private stageNo = 1;
  private bg!: Background;
  private enemies: Enemy[] = [];
  private stars: Star[] = [];
  private capsules: Capsule[] = [];
  private groups = new Map<number, { left: number; escaped: boolean }>();
  private boss: BossLike | null = null;
  private mode: Mode = 'play';
  private stageT = 0;
  private waveIdx = 0;
  private score = 0;
  private lives = 3;
  private nextExtend = 0;
  private carrierKills = 0;
  private hi = 0;
  private paused = false;
  private pauseUi: Phaser.GameObjects.GameObject[] = [];
  private retryReady = false;
  private controls!: Controls;

  constructor() {
    super('Game');
  }

  create(data: GameData) {
    this.stageNo = Phaser.Math.Clamp(data?.stage ?? 1, 1, STAGES.length);
    this.def = STAGES[this.stageNo - 1];
    this.enemies = [];
    this.stars = [];
    this.capsules = [];
    this.groups.clear();
    this.boss = null;
    this.mode = 'play';
    this.stageT = 0;
    this.waveIdx = 0;
    this.paused = false;
    this.retryReady = false;
    this.score = data?.carry?.score ?? 0;
    this.lives = data?.carry?.lives ?? 3;
    this.nextExtend = extendAfter(this.score);
    this.carrierKills = 0;
    try {
      this.hi = Number(localStorage.getItem(HI_KEY)) || 0;
    } catch {
      this.hi = 0;
    }

    this.sfx = audio();
    this.bg = new Background(this, this.def.theme);
    this.terrain = null;
    if (this.def.terrain) {
      const t = this.def.terrain;
      this.terrain = new Terrain(this, t.style, t.seed, t.speed);
      // walls grow in after the stage title
      this.tweens.add({ targets: this.terrain, env: 1, duration: 3500, delay: 1200, ease: 'Sine.InOut' });
    }
    this.fx = new Fx(this);
    this.pBullets = new BulletPool(this, DEPTH.pBullets, Phaser.BlendModes.ADD);
    this.eBullets = new BulletPool(this, DEPTH.eBullets);
    this.player = new Player(this);
    if (data?.carry) this.player.applyLoadout(data.carry.loadout);
    this.hud = new Hud(this, this.hi);
    this.juice = new Juice(this);

    this.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.35);
    this.cameras.main.fadeIn(600);

    this.controls = new Controls(this);
    const onPad = () => this.hud.toast('GAMEPAD CONNECTED');
    window.addEventListener('gamepadconnected', onPad);
    this.events.once('shutdown', () => window.removeEventListener('gamepadconnected', onPad));

    this.sfx.music.play(this.def.music);
    this.hud.banner(this.def.name, this.def.sub, 1800);

    if (data?.startAt) {
      this.stageT = data.startAt;
      while (this.waveIdx < this.def.waves.length - 1 && this.def.waves[this.waveIdx].t < data.startAt) this.waveIdx++;
    }
    if (data?.boss) {
      // Debug / demo shortcut: ?boss in the URL jumps straight to the fight.
      this.waveIdx = this.def.waves.length;
      this.player.power = 3;
      this.time.delayedCall(800, () => this.startWarning());
    }
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number) {
    const realDt = Math.min(delta / 1000, MAX_DT);
    const ctl = this.controls;
    ctl.update();
    if (ctl.pressed.pause && (this.mode === 'play' || this.mode === 'boss' || this.mode === 'warning')) this.togglePause();
    if (this.paused) {
      this.time.timeScale = 0;
      this.tweens.timeScale = 0;
      this.fx.setTimeScale(0);
      this.player.setTimeScale(0);
      return;
    }
    const scale = this.juice.update(realDt);
    const dt = realDt * scale;
    this.time.timeScale = scale;
    this.tweens.timeScale = scale;
    this.fx.setTimeScale(scale);
    this.player.setTimeScale(scale);

    this.bg.update(dt);
    this.terrain?.update(dt);

    if (this.mode === 'play') {
      this.stageT += dt;
      const waves = this.def.waves;
      while (this.waveIdx < waves.length && waves[this.waveIdx].t <= this.stageT) waves[this.waveIdx++].run(this);
    }

    this.player.update(dt, ctl.state);
    if (ctl.pressed.bomb) this.bomb();
    if (ctl.pressed.powerup) this.usePowerUp();
    if (this.score >= this.nextExtend) {
      this.nextExtend = extendAfter(this.score);
      this.addLife('EXTEND');
    }
    this.pBullets.update(dt);
    this.eBullets.update(dt);
    for (const e of this.enemies) e.tick(dt, this);
    this.boss?.update(dt);
    this.updateItems(dt);
    for (const c of this.capsules) {
      c.update(dt);
      // capsules bounce off the terrain instead of sinking into it
      if (this.terrain && this.terrain.solid(c.x, c.y, 16)) {
        const floor = this.terrain.floorAt(c.x);
        if (c.y > floor - 16) {
          c.y = floor - 16;
          c.vy = -120;
        } else {
          c.y = this.terrain.ceilAt(c.x) + 16;
          c.vy = 40;
        }
      }
    }
    this.collide();
    this.enemies = this.enemies.filter((e) => {
      if (e.dead || e.offscreen) {
        if (!e.dead && e.p.group) this.group(e).escaped = true;
        e.destroy();
        return false;
      }
      return true;
    });
    this.capsules = this.capsules.filter((c) => (c.gone ? (c.destroy(), false) : true));

    this.hud.update(realDt, this.score, Math.max(0, this.lives - 1), this.player.loadout, this.boss ?? undefined);

    if ((this.mode === 'over' || this.mode === 'clear') && this.retryReady && ctl.pressed.confirm) {
      this.retryReady = false;
      this.sfx.select();
      this.cameras.main.fade(400, 0, 0, 0, true);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title'));
    }
  }

  private togglePause() {
    this.paused = !this.paused;
    this.sfx.pause();
    this.sfx.musicBus.gain.setTargetAtTime(this.paused ? 0.15 : 0.55, this.sfx.now, 0.05);
    if (this.paused) {
      const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setDepth(DEPTH.overlay);
      const t = this.add
        .text(W / 2, H / 2 - 10, 'PAUSE', { fontFamily: FONT, fontSize: '44px', color: '#e8fbff', fontStyle: '900' })
        .setOrigin(0.5)
        .setShadow(0, 0, '#3cf0ff', 18, true, true)
        .setDepth(DEPTH.overlay);
      const sub = this.add
        .text(W / 2, H / 2 + 36, 'ESC / START TO RESUME', { fontFamily: FONT, fontSize: '12px', color: '#9fb4c8' })
        .setOrigin(0.5)
        .setDepth(DEPTH.overlay);
      this.pauseUi = [dim, t, sub];
    } else {
      this.pauseUi.forEach((o) => o.destroy());
      this.pauseUi = [];
    }
  }

  // ---------------------------------------------------------------- spawning

  spawn(kind: EnemyKind, p: EnemyParams) {
    if (this.mode !== 'play') return;
    if (kind === 'turret' && !this.terrain) return;
    const e = new Enemy(this, kind, p);
    if (p.group) this.group(e);
    this.enemies.push(e);
  }

  private group(e: Enemy) {
    const id = e.p.group!;
    let g = this.groups.get(id);
    if (!g) this.groups.set(id, (g = { left: e.p.groupSize ?? 1, escaped: false }));
    return g;
  }

  shoot(x: number, y: number, vx: number, vy: number, tex = 'eb', r = 6) {
    if (this.mode === 'clear') return;
    const k = this.def.rank;
    return this.eBullets.spawn(tex, x, y, vx * k, vy * k, r);
  }

  // Wide fans are thinned (5→3, 9→5) but keep their width, so the gaps
  // between bullets open up instead of the pattern shrinking.
  aimed(x: number, y: number, speed: number, n: number, spread: number, tex = 'eb', r = 6) {
    const m = n < 5 ? n : n - 2 * Math.floor((n - 1) / 4);
    if (m > 1) spread *= (n - 1) / (m - 1);
    n = m;
    const base = Math.atan2(this.player.y - y, this.player.x - x);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      this.shoot(x, y, Math.cos(a) * speed, Math.sin(a) * speed, tex, r);
    }
    this.fx.bloom(x, y, 0.5, 120, 0xff3ce0);
  }

  ring(x: number, y: number, n: number, speed: number, offset: number, tex = 'eb', r = 6) {
    n = Math.max(4, Math.round(n * BULLET_DENSITY));
    for (let i = 0; i < n; i++) {
      const a = offset + (i / n) * Math.PI * 2;
      this.shoot(x, y, Math.cos(a) * speed, Math.sin(a) * speed, tex, r);
    }
    this.fx.bloom(x, y, 0.8, 160, 0x4d8bff);
  }

  // ---------------------------------------------------------------- collisions

  // A piercing bullet hits each target once; a normal one is used up.
  private consume(b: Bullet, target: object) {
    if (!b.pierce) {
      this.pBullets.kill(b);
      return true;
    }
    if (b.hitList.includes(target)) return false;
    b.hitList.push(target);
    return true;
  }

  private collide() {
    const p = this.player;
    const terrain = this.terrain;

    this.pBullets.each((b) => {
      if (terrain && !b.step && terrain.solid(b.x, b.y)) {
        this.fx.spark(b.x, b.y, 0xffffff, 2, { min: 120, max: 240 });
        this.pBullets.kill(b);
        return;
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        const rr = e.r + b.r;
        if (Math.abs(e.x - b.x) < rr && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr && this.consume(b, e)) {
          this.hitEnemy(e, b.dmg, b.x, b.y);
          if (!b.active) return;
        }
      }
      const boss = this.boss;
      if (boss && boss.active && !b.hitList.includes(boss)) {
        const res = boss.hitTest(b.x, b.y, b.dmg);
        if (res === 'hit') {
          this.consume(b, boss);
          this.score += 10;
          this.fx.spark(b.x, b.y, boss.color, 3, { min: 150, max: 210 });
          this.sfx.hit();
        } else if (res === 'block') {
          this.pBullets.kill(b);
          this.fx.spark(b.x, b.y, 0xffffff, 2, { min: 150, max: 210 });
          this.sfx.armor();
        }
      }
    });

    if (terrain) {
      this.eBullets.each((b) => {
        if (terrain.solid(b.x, b.y)) this.eBullets.kill(b);
      });
    }

    if (!p.alive || this.mode === 'clear') return;

    // Walls kill regardless of the guard, but not while respawning.
    if (terrain && terrain.solid(p.x, p.y, 7)) {
      // While respawning, or while the walls are still growing in, they push instead of kill.
      if (p.invuln > 0 || (this.mode === 'play' && this.stageT < 6)) p.sprite.y = Phaser.Math.Clamp(p.y, terrain.ceilAt(p.x) + 14, terrain.floorAt(p.x) - 14);
      else {
        this.killPlayer(true);
        return;
      }
    }
    if (p.invuln > 0) return;

    let hit = false;
    this.eBullets.each((b) => {
      if (hit) return;
      const rr = b.r + p.r;
      if ((b.x - p.x - 2) ** 2 + (b.y - p.y) ** 2 < rr * rr) hit = true;
    });
    if (!hit) {
      for (const e of this.enemies) {
        const rr = e.r * 0.8 + p.r + 6;
        if (!e.dead && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) hit = true;
      }
    }
    if (!hit && this.boss && this.boss.active && this.boss.touches(p.x, p.y)) hit = true;
    if (hit) this.killPlayer(false);
  }

  private hitEnemy(e: Enemy, dmg: number, x: number, y: number) {
    e.hp -= dmg;
    e.flash();
    this.fx.spark(x, y, e.color, 3, { min: 150, max: 210 });
    this.sfx.hit();
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy) {
    e.dead = true;
    this.score += e.score;
    if (e.kind === 'dart' || e.kind === 'fan') {
      this.fx.explosion(e.x, e.y, 's', e.color);
      this.sfx.explodeSmall();
    } else if (e.kind === 'carrier') {
      this.fx.explosion(e.x, e.y, 'l', e.color);
      this.time.delayedCall(90, () => this.fx.explosion(e.x + 30, e.y - 14, 'm', e.color));
      this.juice.stop(70);
      this.juice.shake(300, 0.01);
      this.juice.flash(120, 0xfff0c0, 0.25);
      this.sfx.explodeMid();
      this.hud.popup(e.x, e.y - 30, e.score);
    } else {
      this.fx.explosion(e.x, e.y, 'm', e.color);
      this.juice.stop(30);
      this.juice.shake(120, 0.004);
      this.sfx.explodeSmall();
      this.hud.popup(e.x, e.y - 20, e.score);
    }
    // mines take revenge with a ring of bullets
    if (e.kind === 'mine') this.ring(e.x, e.y, 10, 130, Math.random(), 'eb');
    if (e.kind === 'carrier' && ++this.carrierKills === ONE_UP_CARRIER) this.dropCapsule(e.x, e.y, '1up');
    else if (e.p.drop) this.dropCapsule(e.x, e.y);
    if (e.p.group) {
      const g = this.group(e);
      if (--g.left === 0 && !g.escaped) {
        this.dropCapsule(e.x, e.y);
        this.hud.popup(e.x, e.y - 24, 'FORMATION BONUS 2000', '#9fe8ff');
        this.score += 2000;
      }
    }
  }

  private killPlayer(wall: boolean) {
    const p = this.player;
    if (!wall && p.absorbHit()) {
      this.sfx.shieldBreak();
      this.juice.stop(60);
      this.juice.shake(160, 0.006);
      this.cancelBulletsNear(p.x, p.y, 140);
      return;
    }
    p.shield = false;
    p.hit();
    this.lives--;
    this.fx.explosion(p.x, p.y, 'l', COLOR.player);
    this.juice.stop(180);
    this.juice.slow(500, 0.35);
    this.juice.shake(400, 0.014);
    this.juice.flash(220, 0xffffff, 0.5);
    this.sfx.death();
    // Clearing bullets on death keeps respawns fair.
    this.cancelBullets(false);
    if (this.lives <= 0) {
      this.gameOver();
      return;
    }
    this.time.delayedCall(1100, () => p.respawn());
  }

  // Turns every enemy bullet into a spark (and optionally a score star).
  cancelBullets(toScore: boolean) {
    this.eBullets.each((b) => {
      this.fx.spark(b.x, b.y, 0xff9ae6, 1);
      if (toScore) this.dropStar(b.x, b.y);
      this.eBullets.kill(b);
    });
  }

  private cancelBulletsNear(x: number, y: number, r: number) {
    this.eBullets.each((b) => {
      if ((b.x - x) ** 2 + (b.y - y) ** 2 > r * r) return;
      this.fx.spark(b.x, b.y, 0xc8a0ff, 1);
      this.eBullets.kill(b);
    });
  }

  // Screen-clearing bomb: wipes bullets into score stars, hits everything on screen.
  private bomb() {
    const p = this.player;
    if (!p.alive || p.bombs <= 0 || !(this.mode === 'play' || this.mode === 'boss')) return;
    p.bombs--;
    p.invuln = Math.max(p.invuln, 2.2);
    this.sfx.bomb();
    this.juice.stop(90);
    this.juice.flash(500, 0xffd0f0, 0.75);
    this.juice.shake(600, 0.018);
    this.fx.ring(p.x, p.y, 9, 0xff7ad8, 700);
    this.fx.ring(p.x, p.y, 6, 0xffffff, 550);
    this.fx.bloom(p.x, p.y, 6, 500, 0xff7ad8);
    this.cancelBullets(true);
    for (const e of this.enemies) if (!e.dead) this.hitEnemy(e, 40, e.x, e.y);
    if (this.boss?.active) {
      this.boss.bomb(90);
      this.fx.explosion(this.boss.x - 40, this.boss.y, 'l', this.boss.color);
    }
  }

  // ---------------------------------------------------------------- items

  private dropCapsule(x: number, y: number, kind: CapsuleKind = 'gauge') {
    this.capsules.push(new Capsule(this, Phaser.Math.Clamp(x, 60, W - 60), Phaser.Math.Clamp(y, 60, H - 60), kind));
  }

  private dropStar(x: number, y: number) {
    const it = this.add.image(x, y, 'star').setDepth(DEPTH.items) as Star;
    it.t = 0;
    it.vx = Phaser.Math.Between(-60, 60);
    it.vy = Phaser.Math.Between(-60, 60);
    this.stars.push(it);
  }

  private collectCapsule(c: Capsule) {
    const p = this.player;
    c.gone = true;
    if (c.kind === '1up') {
      this.fx.ring(c.x, c.y, 1, 0x5aff8c, 350);
      this.addLife('1UP');
      return;
    }
    p.advanceGauge();
    this.score += 100;
    this.sfx.capsule();
    this.fx.ring(c.x, c.y, 0.6, 0xff9a3c, 250);
  }

  // Spends the lit gauge slot (C key / X button).
  private usePowerUp() {
    const p = this.player;
    if (!p.alive || !(this.mode === 'play' || this.mode === 'boss' || this.mode === 'warning')) return;
    if (p.gauge < 0) return;
    const i = p.activateGauge();
    if (i < 0) {
      this.sfx.armor();
      return;
    }
    const info = CAPSULES[i];
    const label = info.key === 'L' ? (p.weapon === 'laser' ? 'LASER' : 'SPREAD SHOT') : info.key === 'P' ? `POWER LV${p.power}` : info.label;
    this.sfx.powerup();
    this.hud.popup(p.x, p.y - 34, label, info.color);
    this.hud.flashGauge(i);
  }

  private addLife(label: string) {
    const p = this.player;
    if (this.lives >= MAX_LIVES) {
      this.score += 10000;
      this.hud.popup(p.x, p.y - 34, 10000, '#5aff8c');
      this.sfx.item();
      return;
    }
    this.lives++;
    this.sfx.oneUp();
    this.hud.popup(p.x, p.y - 34, label, '#5aff8c');
    this.hud.toast(label + '  LIFE +1');
  }

  private updateItems(dt: number) {
    const p = this.player;
    this.stars = this.stars.filter((it) => {
      it.t += dt;
      const dx = p.x - it.x;
      const dy = p.y - it.y;
      const d = Math.hypot(dx, dy) || 1;
      if (p.alive && it.t > 0.25) {
        const sp = 900 * Math.min(1, it.t);
        it.x += (dx / d) * sp * dt;
        it.y += (dy / d) * sp * dt;
      } else {
        it.x += it.vx * dt;
        it.y += it.vy * dt;
      }
      it.rotation += dt * 6;
      if (p.alive && d < 26) {
        this.score += 50;
        this.sfx.item();
        it.destroy();
        return false;
      }
      return true;
    });
    if (!p.alive) return;
    for (const c of this.capsules) {
      if (!c.gone && (c.x - p.x) ** 2 + (c.y - p.y) ** 2 < 30 * 30) this.collectCapsule(c);
    }
  }

  // ---------------------------------------------------------------- boss flow

  startWarning() {
    if (this.mode !== 'play') return;
    this.mode = 'warning';
    this.sfx.music.fadeOut(1.2);
    // open the arena up: walls shrink to a thin border for the fight
    if (this.terrain) this.tweens.killTweensOf(this.terrain);
    if (this.terrain) this.tweens.add({ targets: this.terrain, env: 0.35, duration: 3000, ease: 'Sine.InOut' });
    this.time.delayedCall(900, () => this.warningSequence());
  }

  private warningSequence() {
    this.sfx.warning();
    const red = this.add.rectangle(W / 2, H / 2, W, H, 0xff0030, 0).setDepth(DEPTH.overlay - 1);
    this.tweens.add({ targets: red, fillAlpha: 0.22, duration: 250, yoyo: true, repeat: 5 });

    const bandTop = this.add.rectangle(W / 2, 170, W, 40, 0x200008, 0.85).setDepth(DEPTH.overlay).setScale(1, 0);
    const bandBot = this.add.rectangle(W / 2, 370, W, 40, 0x200008, 0.85).setDepth(DEPTH.overlay).setScale(1, 0);
    this.tweens.add({ targets: [bandTop, bandBot], scaleY: 1, duration: 200, ease: 'Cubic.Out' });

    const marquee = (y: number, dir: number) => {
      const str = Array(10).fill('WARNING').join('   ◆   ');
      const t = this.add
        .text(dir > 0 ? -1400 : 0, y, str, { fontFamily: FONT, fontSize: '16px', color: '#ff3c5a', fontStyle: '700' })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.overlay);
      this.tweens.add({ targets: t, x: t.x + dir * 500, duration: 3000 });
      return t;
    };
    const m1 = marquee(170, 1);
    const m2 = marquee(370, -1);

    const big = this.add
      .text(W / 2, H / 2 - 12, 'WARNING', { fontFamily: FONT, fontSize: '72px', color: '#ff3c5a', fontStyle: '900' })
      .setOrigin(0.5)
      .setShadow(0, 0, '#ff0030', 24, true, true)
      .setDepth(DEPTH.overlay)
      .setAlpha(0);
    const sub = this.add
      .text(W / 2, H / 2 + 44, this.def.warning, { fontFamily: FONT, fontSize: '14px', color: '#ffc0c8', fontStyle: '500' })
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay)
      .setAlpha(0);
    this.tweens.add({ targets: big, alpha: 1, duration: 250, yoyo: true, hold: 120, repeat: 5 });
    this.tweens.add({ targets: sub, alpha: 1, duration: 400, delay: 300 });

    this.time.delayedCall(3000, () => {
      this.tweens.add({
        targets: [bandTop, bandBot, m1, m2, big, sub],
        alpha: 0,
        duration: 300,
        onComplete: () => [red, bandTop, bandBot, m1, m2, big, sub].forEach((o) => o.destroy()),
      });
      this.bossEntrance();
    });
  }

  private bossEntrance() {
    this.mode = 'boss';
    this.enemies.forEach((e) => (e.dead = true));
    const boss = this.def.boss(this);
    this.boss = boss;
    this.sfx.rumble(2.6);
    this.juice.shake(2600, 0.004);
    this.tweens.add({ targets: this.bg, speed: 0.35, duration: 2000 });
    boss.enter(() => {
      this.juice.shake(250, 0.012);
      this.sfx.impact();
      this.fx.ring(boss.x, boss.y, 3, boss.color, 600);
      this.hud.showBoss(boss.name);
      this.sfx.music.play('boss');
    });
  }

  onBossDying() {
    const boss = this.boss!;
    this.mode = 'clear';
    this.cancelBullets(true);
    this.sfx.music.fadeOut(0.4);
    this.juice.stop(220);
    this.juice.slow(2200, 0.3);
    this.juice.flash(200, 0xffffff, 0.7);
    this.sfx.impact();
    const { w, h } = boss.size;
    // Chain of explosions across the hull, then the big one.
    for (let i = 0; i < 14; i++) {
      this.time.delayedCall(i * 110, () => {
        const x = boss.x + Phaser.Math.Between(-w, w);
        const y = boss.y + Phaser.Math.Between(-h, h);
        this.fx.explosion(x, y, i % 3 === 0 ? 'l' : 'm', i % 2 ? boss.color : 0xffb040);
        this.juice.shake(150, 0.008);
        this.sfx.explodeSmall();
      });
    }
    this.time.delayedCall(14 * 110 + 150, () => {
      this.juice.stop(260);
      this.juice.flash(900, 0xffffff, 1);
      this.juice.shake(900, 0.03);
      this.fx.explosion(boss.x, boss.y, 'xl', 0xffffff);
      this.fx.explosion(boss.x, boss.y, 'xl', boss.color);
      this.fx.ring(boss.x, boss.y, 6, 0xffffff, 1200);
      this.sfx.explodeBig();
      boss.destroy();
      this.hud.hideBoss();
      this.score += this.bossBonus;
      this.tweens.add({ targets: this.bg, speed: 1, duration: 1500 });
      this.time.delayedCall(1600, () => this.stageClear());
    });
  }

  private get bossBonus() {
    return 50000 * this.stageNo;
  }

  private stageClear() {
    this.sfx.clear();
    this.saveHi();
    const last = this.stageNo >= STAGES.length;
    if (last) {
      this.hud.banner('ALL STAGES CLEAR', `CONGRATULATIONS   ·   FINAL SCORE ${this.score}`, 60000, '#ffe08a');
      this.time.delayedCall(2200, () => this.showRetry('PRESS Z / A TO RETURN TO TITLE'));
      return;
    }
    this.hud.banner(`${this.def.name} CLEAR`, `BOSS BONUS ${this.bossBonus}   ·   SCORE ${this.score}`, 3200, '#3cf0ff');
    // Fly off to the right, then carry score, lives and equipment into the next stage.
    this.time.delayedCall(2600, () => {
      const p = this.player;
      p.controllable = false;
      this.tweens.add({ targets: p.sprite, x: W + 120, duration: 900, ease: 'Cubic.In' });
      this.sfx.music.fadeOut(0.8);
      this.time.delayedCall(700, () => this.cameras.main.fade(600, 0, 0, 0, true));
      this.cameras.main.once('camerafadeoutcomplete', () => {
        const carry: Carry = { score: this.score, lives: Math.max(1, this.lives), loadout: p.loadout };
        this.scene.restart({ stage: this.stageNo + 1, carry } satisfies GameData);
      });
    });
  }

  private gameOver() {
    this.mode = 'over';
    this.sfx.music.fadeOut(1.5);
    this.saveHi();
    this.time.delayedCall(1200, () => {
      this.hud.banner('GAME OVER', `${this.def.name}   ·   SCORE ${this.score}`, 60000, '#ff4d6d');
      this.time.delayedCall(1200, () => this.showRetry('PRESS Z / A TO RETURN TO TITLE'));
    });
  }

  private showRetry(msg: string) {
    const t = this.add
      .text(W / 2, 340, msg, { fontFamily: FONT, fontSize: '14px', color: '#e8fbff', fontStyle: '700' })
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);
    this.tweens.add({ targets: t, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });
    this.retryReady = true;
  }

  private saveHi() {
    if (this.score <= this.hi) return;
    this.hi = this.score;
    try {
      localStorage.setItem(HI_KEY, String(this.score));
    } catch {
      // storage can be unavailable (private mode); the hi-score just won't persist
    }
  }
}

// Next score that grants a life, strictly above `score`.
function extendAfter(score: number) {
  for (const e of EXTENDS) if (e > score) return e;
  const last = EXTENDS[EXTENDS.length - 1];
  return last + (Math.floor((score - last) / EXTEND_EVERY) + 1) * EXTEND_EVERY;
}
