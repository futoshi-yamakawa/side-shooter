import Phaser from 'phaser';
import { COLOR, DEPTH, FONT, H, W } from '../config';
import { audio, AudioEngine } from '../systems/audio';
import { Background } from '../systems/background';
import { Fx } from '../systems/fx';
import { Hud } from '../systems/hud';
import { Juice } from '../systems/juice';
import { BulletPool } from '../entities/bullets';
import { Player, Input } from '../entities/player';
import { Enemy, EnemyKind, EnemyParams } from '../entities/enemy';
import { Boss, BOSS_NAME } from '../entities/boss';
import { STAGE1 } from '../stage/stage1';

type Item = Phaser.GameObjects.Image & { kind: 'power' | 'score'; vx: number; vy: number; t: number; homing: boolean };

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
  private items: Item[] = [];
  private boss: Boss | null = null;
  private mode: Mode = 'play';
  private stageT = 0;
  private waveIdx = 0;
  private score = 0;
  private lives = 3;
  private hi = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor() {
    super('Game');
  }

  create(data: { boss?: boolean; startAt?: number }) {
    this.enemies = [];
    this.items = [];
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

    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = kb.addKeys('W,A,S,D,Z,X,SHIFT,SPACE,ENTER') as Record<string, Phaser.Input.Keyboard.Key>;

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

    this.player.update(dt, this.readInput());
    this.pBullets.update(dt);
    this.eBullets.update(dt);
    for (const e of this.enemies) e.tick(dt, this);
    this.boss?.update(dt);
    this.updateItems(dt);
    this.collide();
    this.enemies = this.enemies.filter((e) => {
      if (e.dead || e.offscreen) {
        e.destroy();
        return false;
      }
      return true;
    });

    this.hud.update(realDt, this.score, Math.max(0, this.lives - 1), this.player.power, this.boss ?? undefined);

    if ((this.mode === 'over' || this.mode === 'clear') && this.retryReady && [this.keys.Z, this.keys.ENTER, this.keys.SPACE].some((k) => Phaser.Input.Keyboard.JustDown(k))) {
      this.retryReady = false;
      this.sfx.select();
      this.cameras.main.fade(400, 0, 0, 0, true);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Title'));
    }
  }
  private retryReady = false;

  private readInput(): Input {
    const k = this.keys;
    const c = this.cursors;
    let x = 0;
    let y = 0;
    if (c.left.isDown || k.A.isDown) x -= 1;
    if (c.right.isDown || k.D.isDown) x += 1;
    if (c.up.isDown || k.W.isDown) y -= 1;
    if (c.down.isDown || k.S.isDown) y += 1;
    return { x, y, fire: k.Z.isDown || k.SPACE.isDown, focus: k.X.isDown || k.SHIFT.isDown };
  }

  // ---------------------------------------------------------------- spawning

  spawn(kind: EnemyKind, p: EnemyParams) {
    if (this.mode !== 'play') return;
    this.enemies.push(new Enemy(this, kind, p));
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
    if (e.p.drop) this.dropItem('power', e.x, e.y);
  }

  private killPlayer() {
    const p = this.player;
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
      if (toScore) this.dropItem('score', b.x, b.y);
      this.eBullets.kill(b);
    });
  }

  // ---------------------------------------------------------------- items

  private dropItem(kind: 'power' | 'score', x: number, y: number) {
    const it = this.add.image(x, y, kind === 'power' ? 'powerup' : 'star').setDepth(DEPTH.items) as Item;
    it.kind = kind;
    it.t = 0;
    it.vx = kind === 'power' ? -45 : Phaser.Math.Between(-60, 60);
    it.vy = kind === 'power' ? -80 : Phaser.Math.Between(-60, 60);
    it.homing = kind === 'score';
    this.items.push(it);
  }

  private updateItems(dt: number) {
    const p = this.player;
    this.items = this.items.filter((it) => {
      it.t += dt;
      const dx = p.x - it.x;
      const dy = p.y - it.y;
      const d = Math.hypot(dx, dy);
      if (p.alive && (it.homing && it.t > 0.25 || d < 110)) {
        const sp = 900 * Math.min(1, it.t);
        it.x += (dx / d) * sp * dt;
        it.y += (dy / d) * sp * dt;
      } else if (it.kind === 'power') {
        // Pops up, then drifts left on a slow bob so it never leaves the playfield vertically.
        it.vy *= Math.pow(0.1, dt);
        it.x += it.vx * dt;
        it.y = Phaser.Math.Clamp(it.y + it.vy * dt + Math.sin(it.t * 3) * 30 * dt, 40, H - 40);
      } else {
        it.x += it.vx * dt;
        it.y += it.vy * dt;
      }
      it.rotation += it.kind === 'score' ? dt * 6 : 0;
      if (p.alive && d < 26) {
        if (it.kind === 'power') {
          p.powerUp();
          this.sfx.powerup();
          this.score += 1000;
          this.hud.popup(it.x, it.y - 16, 1000, '#7dff9a');
        } else {
          this.score += 50;
          this.sfx.item();
        }
        it.destroy();
        return false;
      }
      if (it.x < -40) {
        it.destroy();
        return false;
      }
      return true;
    });
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
