import Phaser from 'phaser';
import { DEPTH, FONT, H, W } from '../config';
import { audio } from '../systems/audio';
import { Background } from '../systems/background';
import { Controls } from '../systems/controls';
import type { GameData } from './GameScene';

export class TitleScene extends Phaser.Scene {
  private bg!: Background;
  private started = false;
  private ship!: Phaser.GameObjects.Image;
  private t = 0;
  private controls!: Controls;
  private startFn: () => void = () => {};
  private padText!: Phaser.GameObjects.Text;

  constructor() {
    super('Title');
  }

  create(data: GameData) {
    this.started = false;
    this.bg = new Background(this);
    this.cameras.main.postFX.addVignette(0.5, 0.5, 0.95, 0.35);
    this.cameras.main.fadeIn(600);

    this.ship = this.add.image(-80, 300, 'player').setScale(1.4).setDepth(DEPTH.player);
    this.add
      .particles(0, 0, 'glow', {
        speedX: { min: -400, max: -200 },
        scale: { start: 0.6, end: 0 },
        lifespan: 260,
        frequency: 14,
        tint: [0xffffff, 0x3cf0ff],
        blendMode: 'ADD',
        follow: this.ship,
        followOffset: { x: -42, y: 0 },
      })
      .setDepth(DEPTH.player - 1);
    this.tweens.add({ targets: this.ship, x: 220, duration: 1400, ease: 'Cubic.Out' });

    const title = this.add
      .text(W / 2 + 60, 170, 'NEON VANGUARD', { fontFamily: FONT, fontSize: '64px', color: '#e8fbff', fontStyle: '900' })
      .setOrigin(0.5)
      .setShadow(0, 0, '#3cf0ff', 22, true, true)
      .setDepth(DEPTH.hud);
    const sub = this.add
      .text(W / 2 + 60, 222, 'HORIZONTAL SHOOTING  ·  3 STAGES', { fontFamily: FONT, fontSize: '13px', color: '#ff7ad8', fontStyle: '700' })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);
    title.setAlpha(0).setScale(1.3);
    sub.setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 700, delay: 300, ease: 'Expo.Out' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 600, delay: 700 });

    const press = this.add
      .text(W / 2 + 60, 330, 'PRESS Z / A BUTTON TO START', { fontFamily: FONT, fontSize: '18px', color: '#ffffff', fontStyle: '700' })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);
    this.tweens.add({ targets: press, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });

    this.add
      .text(W / 2, H - 52, 'KEYBOARD   MOVE: ARROWS / WASD   SHOT: Z   POWER UP: C   BOMB: X   SLOW: SHIFT   PAUSE: ESC', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#9fb4c8',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);
    this.add
      .text(W / 2, H - 32, 'GAMEPAD   MOVE: STICK / D-PAD   SHOT: A   POWER UP: X   BOMB: B   SLOW: RB   PAUSE: START', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#9fb4c8',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);
    this.padText = this.add
      .text(W - 16, 14, '', { fontFamily: FONT, fontSize: '10px', color: '#7dff9a' })
      .setOrigin(1, 0)
      .setDepth(DEPTH.hud);
    this.controls = new Controls(this);

    const start = () => {
      if (this.started) return;
      this.started = true;
      const a = audio();
      a.resume();
      a.select();
      this.tweens.add({ targets: this.ship, x: W + 120, duration: 600, ease: 'Cubic.In' });
      this.cameras.main.flash(200, 120, 240, 255);
      // force=true: the title's own fade-in may still be running if the player starts instantly.
      this.time.delayedCall(450, () => this.cameras.main.fade(300, 0, 0, 0, true));
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', { boss: data?.boss, startAt: data?.startAt, stage: data?.stage } satisfies GameData));
    };
    this.startFn = start;
    this.input.on('pointerdown', start);
  }

  update(_t: number, delta: number) {
    const dt = delta / 1000;
    this.t += dt;
    this.bg.update(dt);
    this.controls.update();
    // Browsers only expose a gamepad after one of its buttons is pressed.
    this.padText.setText(this.controls.padName ? 'GAMEPAD READY' : 'GAMEPAD: PRESS ANY BUTTON TO CONNECT');
    if (this.controls.pressed.confirm && this.t > 0.4) this.startFn();
    if (!this.started) this.ship.y = 300 + Math.sin(this.t * 2) * 8;
  }
}
