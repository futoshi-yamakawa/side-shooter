import Phaser from 'phaser';
import { DEPTH, H } from '../config';
import type { GameScene } from '../scenes/GameScene';

export type CapsuleKind = 'gauge' | '1up';

// Gradius-style pickup. A gauge capsule advances the power-up cursor; a 1UP
// capsule adds a life. Both pop out of the wreck, then drift left on a bob.
export class Capsule extends Phaser.GameObjects.Image {
  vx = -55;
  vy = -60;
  r = 16;
  private t = 0;
  gone = false;

  constructor(g: GameScene, x: number, y: number, readonly kind: CapsuleKind = 'gauge') {
    super(g, x, y, kind === '1up' ? 'cap_1up' : 'cap_gauge');
    g.add.existing(this);
    this.setDepth(DEPTH.items);
    this.setScale(0.4);
    g.tweens.add({ targets: this, scale: 1, duration: 260, ease: 'Back.Out' });
  }

  update(dt: number) {
    this.t += dt;
    this.vy *= Math.exp(-dt * 2.5);
    this.x += this.vx * dt;
    this.y += (this.vy + Math.cos(this.t * 3) * 22) * dt;
    this.y = Phaser.Math.Clamp(this.y, 30, H - 30);
    this.rotation = Math.sin(this.t * 3) * 0.15;
    if (this.kind === '1up') this.setAlpha(0.75 + Math.sin(this.t * 12) * 0.25);
    if (this.x < -40) this.gone = true;
  }
}
