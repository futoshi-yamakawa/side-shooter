import Phaser from 'phaser';
import { H, W } from '../config';

export class Bullet extends Phaser.GameObjects.Image {
  vx = 0;
  vy = 0;
  r = 4;
  dmg = 1;
  spin = 0;
  t = 0;
  // Piercing shots (laser) remember what they already hit so each target takes one hit.
  pierce = false;
  hitList: object[] = [];
  // Custom motion (missiles); return false to remove the bullet.
  step: ((b: Bullet, dt: number) => boolean) | null = null;
}

// Fixed pool with a free list: the boss can put a few hundred bullets on
// screen and allocating per shot would cause GC hitches mid-fight.
export class BulletPool {
  readonly items: Bullet[] = [];
  private free: Bullet[] = [];

  constructor(private scene: Phaser.Scene, private depth: number, private blend = Phaser.BlendModes.NORMAL) {}

  spawn(tex: string, x: number, y: number, vx: number, vy: number, r: number): Bullet {
    let b = this.free.pop();
    if (!b) {
      b = new Bullet(this.scene, x, y, tex);
      this.scene.add.existing(b);
      b.setDepth(this.depth).setBlendMode(this.blend);
      this.items.push(b);
    }
    b.setTexture(tex).setPosition(x, y).setActive(true).setVisible(true).setScale(1).setAlpha(1);
    b.vx = vx;
    b.vy = vy;
    b.r = r;
    b.dmg = 1;
    b.spin = 0;
    b.t = 0;
    b.pierce = false;
    b.hitList.length = 0;
    b.step = null;
    b.rotation = Math.atan2(vy, vx);
    return b;
  }

  kill(b: Bullet) {
    if (!b.active) return;
    b.setActive(false).setVisible(false);
    this.free.push(b);
  }

  update(dt: number) {
    for (const b of this.items) {
      if (!b.active) continue;
      b.t += dt;
      if (b.step && !b.step(b, dt)) {
        this.kill(b);
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.spin) b.rotation += b.spin * dt;
      if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) this.kill(b);
    }
  }

  each(fn: (b: Bullet) => void) {
    for (const b of this.items) if (b.active) fn(b);
  }

  get count() {
    return this.items.length - this.free.length;
  }
}
