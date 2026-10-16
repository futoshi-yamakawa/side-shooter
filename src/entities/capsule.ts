import Phaser from 'phaser';
import { DEPTH, H } from '../config';
import { CAPSULES } from '../systems/textures';
import type { GameScene } from '../scenes/GameScene';

const HITS_TO_CYCLE = 6;

// TwinBee-style bell: each hit knocks it upward, and every few hits it
// changes type, so the player picks the item by deciding when to stop shooting.
export class Capsule extends Phaser.GameObjects.Image {
  kindIdx = 0;
  vx = -40;
  vy = -140;
  r = 16;
  private hits = 0;
  private cooldown = 0;
  private t = 0;
  gone = false;

  constructor(private g: GameScene, x: number, y: number) {
    super(g, x, y, 'cap_P');
    g.add.existing(this);
    this.setDepth(DEPTH.items);
  }

  get info() {
    return CAPSULES[this.kindIdx];
  }

  update(dt: number) {
    this.t += dt;
    this.cooldown -= dt;
    this.vy = Math.min(this.vy + 160 * dt, 70);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < 30) {
      this.y = 30;
      this.vy = Math.abs(this.vy) * 0.3;
    }
    this.rotation = Math.sin(this.t * 3) * 0.15;
    if (this.x < -40 || this.y > H + 40) this.gone = true;
  }

  shot() {
    this.vy = Math.max(this.vy - 70, -170);
    this.x += 3;
    if (this.cooldown > 0) return;
    this.hits++;
    if (this.hits >= HITS_TO_CYCLE) {
      this.hits = 0;
      this.cooldown = 0.25;
      this.kindIdx = (this.kindIdx + 1) % CAPSULES.length;
      this.setTexture('cap_' + this.info.key);
      this.g.fx.ring(this.x, this.y, 0.5, this.info.tint, 250);
      this.g.sfx.bell();
      this.setScale(1.4);
      this.g.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.Out' });
    }
  }
}
