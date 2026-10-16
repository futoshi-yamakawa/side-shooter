import Phaser from 'phaser';
import { COLOR, DEPTH, FONT, H, W } from '../config';
import { audio, AudioEngine } from '../systems/audio';
import { Background } from '../systems/background';
import { Fx } from '../systems/fx';
import { Hud } from '../systems/hud';
import { Juice } from '../systems/juice';
import { BulletPool } from '../entities/bullets';
import { Player } from '../entities/player';
import { Capsule } from '../entities/capsule';
import { Controls } from '../systems/controls';
import { Enemy, EnemyKind, EnemyParams } from '../entities/enemy';
import { Boss, BOSS_NAME } from '../entities/boss';
import { STAGE1 } from '../stage/stage1';

type Star = Phaser.GameObjects.Image & { vx: number; vy: number; t: number };

type Mode = 'play' | 'warning' | 'boss' | 'clear' | 'over';

const HI_KEY = 'side-shooter.hi';

export class GameScene extends Phaser.Scene {
  sfx!: AudioEngine;
  juice!: Juice;
  fx!: Fx;
  hud!: Hud;
  player!: Player;
  pBullets!: BulletPool;
  eBullets!: BulletPool;
  private bg!: Background;
  private enemies: Enemy[] = [];
  private stars: Star[] = [];
  private capsules: Capsule[] = [];
  private groups = new Map<number, { left: number; escaped: boolean }>();
  private paused = false;
  private pauseUi: Phaser.GameObjects.GameObject[] = [];
  private boss: Boss | null = null;
  private mode: Mode = 'play';
  private stageT = 0;
  private waveIdx = 0;
  private score = 0;
  private lives = 3;
  private hi = 0;
  private controls!: Controls;

  constructor() {
    super('Game');
  }

  create(data: { boss?: boolean; startAt?: number }) {
    this.enemies = [];
    this.stars = [];
    this.capsules = [];
    this.groups.clear();
    this.paused = false;
    this.boss = null;
    this.mode = 'play';
    this.stageT = 0;
    this.waveIdx = 0;
    this.score = 0;
    this.lives = 3;
    try {
      this.hi = Number(localStorage.getItem(HI_KEY)) || 0;
    } catch {
      this.hi = 0;
    }

    this.sfx = audio();
    this.bg = new Background(this);
    this.fx = new Fx(this);
    this.pBullets = new BulletPool(this, DEPTH.pBullets, Phaser.BlendModes.ADD);
    this.eBullets = new BulletPool(this, DEPTH.eBullets);
    this.player = new Player(this);
    this.hud = new Hud(this, this.hi);
    this.juice = new Juice(this);

    this.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.35);
    this.cameras.main.fadeIn(500);

    this.controls = new Controls(this);
    const onPad = () => this.hud.toast('GAMEPAD CONNECTED');
    window.addEventListener('gamepadconnected', onPad);
    this.events.once('shutdown', () => window.removeEventListener('gamepadconnected', onPad));

    this.sfx.music.play('stage');
    this.hud.banner('STAGE 1', 'NEON OUTSKIRTS', 1800);

    if (data?.startAt) {
      this.stageT = data.startAt;
      while (this.waveIdx < STAGE1.length - 1 && STAGE1[this.waveIdx].t < data.startAt) this.waveIdx++;
    }
    if (data?.boss) {
      // Debug / demo shortcut: ?boss in the URL jumps straight to the fight.
      this.waveIdx = STAGE1.length;
      this.player.power = 3;
      this.time.delayedCall(800, () => this.startWarning());
    }
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number) {
    const realDt = Math.min(delta / 1000, 1 / 20);
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

    if (this.mode === 'play') {
      this.stageT += dt;
      while (this.waveIdx < STAGE1.length && STAGE1[this.waveIdx].t <= this.stageT) {
        STAGE1[this.waveIdx++].run(this);
      }
    }

    this.player.update(dt, ctl.state);
    if (ctl.pressed.bomb) this.bomb();
    this.pBullets.update(dt);
    this.eBullets.update(dt);
    for (const e of this.enemies) e.tick(dt, this);
    this.boss?.update(dt);
    this.updateItems(dt);
    for (const c of this.capsules) c.update(dt);
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

    const p = this.player;
    this.hud.update(
      realDt,
      this.score,
      Math.max(0, this.lives - 1),
      { power: p.power, options: p.optionCount, speed: p.speedLv, shield: p.shield, bombs: p.bombs },
      this.boss ?? undefined,
    );

    if ((this.mode === 'over' || this.mode === 'clear') && this.retryReady && ctl.pressed.confirm) {
      this.retryReady = false;
      this.sfx.select();
      this.cameras.main.fade(400, 0, 0, 0, true);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title'));
    }
  }
  private retryReady = false;

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
    return this.eBullets.spawn(tex, x, y, vx, vy, r);
  }

  aimed(x: number, y: number, speed: number, n: number, spread: number, tex = 'eb', r = 6) {
    const base = Math.atan2(this.player.y - y, this.player.x - x);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      this.shoot(x, y, Math.cos(a) * speed, Math.sin(a) * speed, tex, r);
    }
    this.fx.bloom(x, y, 0.5, 120, 0xff3ce0);
  }

  ring(x: number, y: number, n: number, speed: number, offset: number, tex = 'eb', r = 6) {
    for (let i = 0; i < n; i++) {
      const a = offset + (i / n) * Math.PI * 2;
      this.shoot(x, y, Math.cos(a) * speed, Math.sin(a) * speed, tex, r);
    }
    this.fx.bloom(x, y, 0.8, 160, 0x4d8bff);
  }

  // ---------------------------------------------------------------- collisions

  private collide() {
    const p = this.player;

    this.pBullets.each((b) => {
      for (const c of this.capsules) {
        const rr = c.r + b.r;
        if ((c.x - b.x) ** 2 + (c.y - b.y) ** 2 < rr * rr) {
          this.pBullets.kill(b);
          c.shot();
          this.fx.spark(b.x, b.y, c.info.tint, 2, { min: 150, max: 210 });
          return;
        }
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        const rr = e.r + b.r;
        if (Math.abs(e.x - b.x) < rr && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) {
          this.pBullets.kill(b);
          this.hitEnemy(e, b.dmg, b.x, b.y);
          return;
        }
      }
      const boss = this.boss;
      if (boss && boss.state !== 'dead' && boss.state !== 'enter') {
        const dx = boss.x - b.x;
        const dy = boss.y - b.y;
        // elliptical hull: wide, a bit shorter
        if ((dx * dx) / (120 * 120) + (dy * dy) / (85 * 85) < 1) {
          this.pBullets.kill(b);
          if (boss.damage(b.dmg)) {
            this.score += 10;
            this.fx.spark(b.x, b.y, COLOR.boss, 3, { min: 150, max: 210 });
            this.sfx.hit();
          } else {
            this.fx.spark(b.x, b.y, 0xffffff, 2, { min: 150, max: 210 });
            this.sfx.armor();
          }
        }
      }
    });

    if (!p.alive || p.invuln > 0 || this.mode === 'clear') return;

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
    if (!hit && this.boss && this.boss.state !== 'dead') {
      const dx = this.boss.x - p.x;
      const dy = this.boss.y - p.y;
      if ((dx * dx) / (100 * 100) + (dy * dy) / (70 * 70) < 1) hit = true;
    }
    if (hit) this.killPlayer();
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
    if (e.kind === 'dart') {
      this.fx.explosion(e.x, e.y, 's', e.color);
      this.sfx.explodeSmall();
    } else if (e.kind === 'pod') {
      this.fx.explosion(e.x, e.y, 'm', e.color);
      this.juice.stop(30);
      this.juice.shake(120, 0.004);
      this.sfx.explodeSmall();
      this.hud.popup(e.x, e.y - 20, e.score);
    } else {
      this.fx.explosion(e.x, e.y, 'l', e.color);
      this.time.delayedCall(90, () => this.fx.explosion(e.x + 30, e.y - 14, 'm', e.color));
      this.juice.stop(70);
      this.juice.shake(300, 0.01);
      this.juice.flash(120, 0xfff0c0, 0.25);
      this.sfx.explodeMid();
      this.hud.popup(e.x, e.y - 30, e.score);
    }
    if (e.p.drop) this.dropCapsule(e.x, e.y);
    if (e.p.group) {
      const g = this.group(e);
      if (--g.left === 0 && !g.escaped) {
        this.dropCapsule(e.x, e.y);
        this.hud.popup(e.x, e.y - 24, 'FORMATION BONUS 2000', '#9fe8ff');
        this.score += 2000;
      }
    }
  }

  private killPlayer() {
    const p = this.player;
    if (p.absorbHit()) {
      this.sfx.shieldBreak();
      this.juice.stop(60);
      this.juice.shake(160, 0.006);
      this.cancelBulletsNear(p.x, p.y, 140);
      return;
    }
    p.hit();
    this.lives--;
    this.fx.explosion(p.x, p.y, 'l', COLOR.player);
    this.juice.stop(180);
    this.juice.slow(500, 0.35);
    this.juice.shake(400, 0.014);
    this.juice.flash(220, 0xffffff, 0.5);
    this.sfx.death();
    // Clearing nearby bullets on death keeps respawns fair.
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
    if (this.boss?.vulnerable) {
      this.boss.damage(90);
      this.fx.explosion(this.boss.x - 40, this.boss.y, 'l', COLOR.boss);
    }
  }

  // ---------------------------------------------------------------- items

  private dropCapsule(x: number, y: number) {
    this.capsules.push(new Capsule(this, Phaser.Math.Clamp(x, 60, W - 60), Phaser.Math.Clamp(y, 60, H - 60)));
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
    const info = c.info;
    const gained = { P: () => p.powerUp(), O: () => p.addOption(), S: () => p.speedUp(), G: () => p.addShield(), B: () => p.addBomb() }[info.key]();
    if (gained) {
      this.sfx.powerup();
      this.hud.popup(p.x, p.y - 34, info.label, info.color);
      this.score += 500;
    } else {
      // Already maxed: pay out score instead.
      this.sfx.item();
      this.hud.popup(p.x, p.y - 34, 5000, info.color);
      this.score += 5000;
    }
    this.fx.ring(c.x, c.y, 0.8, info.tint, 300);
    c.gone = true;
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
    this.time.delayedCall(900, () => this.warningSequence());
  }

  private warningSequence() {
    const s = this;
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
      .text(W / 2, H / 2 + 44, 'A HUGE BATTLESHIP IS APPROACHING FAST', { fontFamily: FONT, fontSize: '14px', color: '#ffc0c8', fontStyle: '500' })
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
      s.bossEntrance();
    });
  }

  private bossEntrance() {
    this.mode = 'boss';
    this.enemies.forEach((e) => (e.dead = true));
    const boss = new Boss(this);
    this.boss = boss;
    this.sfx.rumble(2.6);
    this.juice.shake(2600, 0.004);
    this.tweens.add({ targets: this.bg, speed: 0.35, duration: 2000 });
    boss.enter(() => {
      this.juice.shake(250, 0.012);
      this.sfx.impact();
      this.fx.ring(boss.x, boss.y, 3, COLOR.boss, 600);
      this.hud.showBoss(BOSS_NAME);
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
    // Chain of explosions across the hull, then the big one.
    for (let i = 0; i < 14; i++) {
      this.time.delayedCall(i * 110, () => {
        const x = boss.x + Phaser.Math.Between(-110, 110);
        const y = boss.y + Phaser.Math.Between(-80, 80);
        this.fx.explosion(x, y, i % 3 === 0 ? 'l' : 'm', i % 2 ? COLOR.boss : 0xffb040);
        this.juice.shake(150, 0.008);
        this.sfx.explodeSmall();
      });
    }
    this.time.delayedCall(14 * 110 + 150, () => {
      this.juice.stop(260);
      this.juice.flash(900, 0xffffff, 1);
      this.juice.shake(900, 0.03);
      this.fx.explosion(boss.x, boss.y, 'xl', 0xffffff);
      this.fx.explosion(boss.x, boss.y, 'xl', COLOR.boss);
      this.fx.ring(boss.x, boss.y, 6, 0xffffff, 1200);
      this.sfx.explodeBig();
      boss.destroy();
      this.hud.hideBoss();
      this.score += 50000;
      this.tweens.add({ targets: this.bg, speed: 1, duration: 1500 });
      this.time.delayedCall(1600, () => this.stageClear());
    });
  }

  private stageClear() {
    this.sfx.clear();
    this.saveHi();
    this.hud.banner('STAGE CLEAR', `BOSS BONUS 50000   ·   SCORE ${this.score}`, 60000, '#3cf0ff');
    this.time.delayedCall(1800, () => this.showRetry('PRESS Z TO RETURN TO TITLE'));
  }

  private gameOver() {
    this.mode = 'over';
    this.sfx.music.fadeOut(1.5);
    this.saveHi();
    this.time.delayedCall(1200, () => {
      this.hud.banner('GAME OVER', `SCORE ${this.score}`, 60000, '#ff4d6d');
      this.time.delayedCall(1200, () => this.showRetry('PRESS Z TO CONTINUE'));
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
