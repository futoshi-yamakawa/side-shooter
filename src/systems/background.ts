import Phaser from 'phaser';
import { DEPTH, H, W } from '../config';

const HORIZON = 392;

export class Background {
  private far: Phaser.GameObjects.TileSprite;
  private mid: Phaser.GameObjects.TileSprite;
  private near: Phaser.GameObjects.TileSprite;
  private hills: Phaser.GameObjects.TileSprite;
  private grid: Phaser.GameObjects.Graphics;
  private nebulas: Phaser.GameObjects.Image[] = [];
  private scroll = 0;
  speed = 1;

  constructor(scene: Phaser.Scene) {
    scene.add.image(0, 0, 'sky').setOrigin(0).setDisplaySize(W, H).setDepth(DEPTH.bg);
    const neb = [
      [260, 120, 0x5a1aff, 7],
      [720, 200, 0xff2aa0, 6],
      [880, 60, 0x1ab8ff, 5],
    ] as const;
    for (const [x, y, c, s] of neb) {
      this.nebulas.push(scene.add.image(x, y, 'glow').setTint(c).setAlpha(0.13).setScale(s).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.bg));
    }
    this.far = scene.add.tileSprite(0, 0, W, HORIZON, 'stars_far').setOrigin(0).setDepth(DEPTH.bg);
    this.mid = scene.add.tileSprite(0, 0, W, HORIZON, 'stars_mid').setOrigin(0).setDepth(DEPTH.bg);
    this.near = scene.add.tileSprite(0, 0, W, HORIZON, 'stars_near').setOrigin(0).setDepth(DEPTH.bg);
    this.hills = scene.add.tileSprite(0, HORIZON - 108, W, 120, 'mountains').setOrigin(0).setDepth(DEPTH.bg);
    // horizon glow line
    scene.add.rectangle(W / 2, HORIZON + 1, W, 2, 0xff3cc8, 0.8).setDepth(DEPTH.bg).setBlendMode(Phaser.BlendModes.ADD);
    this.grid = scene.add.graphics().setDepth(DEPTH.bg);
  }

  update(dt: number) {
    const s = this.speed;
    this.scroll += dt * s;
    this.far.tilePositionX += 12 * dt * s;
    this.mid.tilePositionX += 30 * dt * s;
    this.near.tilePositionX += 70 * dt * s;
    this.hills.tilePositionX += 22 * dt * s;
    for (let i = 0; i < this.nebulas.length; i++) {
      const n = this.nebulas[i];
      n.x -= (4 + i * 2) * dt * s;
      if (n.x < -250) n.x = W + 250;
    }
    this.drawGrid();
  }

  // Perspective floor: horizontal lines are fixed with quadratic spacing,
  // vertical lines converge on a vanishing point and scroll left.
  private drawGrid() {
    const g = this.grid;
    g.clear();
    const depth = H - HORIZON;
    for (let i = 1; i <= 10; i++) {
      const p = i / 10;
      const y = HORIZON + depth * p * p;
      g.lineStyle(1, 0xff3cc8, 0.12 + 0.45 * p);
      g.lineBetween(0, y, W, y);
    }
    const vpX = W / 2;
    const spacing = 90;
    const off = (this.scroll * 260) % spacing;
    for (let x = -W * 2 - off; x < W * 3; x += spacing) {
      const topX = vpX + (x - vpX) * 0.08;
      g.lineStyle(1, 0xff3cc8, 0.35);
      g.lineBetween(topX, HORIZON, x, H);
    }
  }
}
