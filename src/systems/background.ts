import Phaser from 'phaser';
import { DEPTH, H, W } from '../config';

export type Theme = 'neon' | 'cave' | 'fortress';

const HORIZON = 392;

type Layer = { sprite: Phaser.GameObjects.TileSprite; speed: number };

// Parallax backdrop. Each stage picks a theme; all of them share the same
// layered-TileSprite approach so scrolling speed can be eased as one value.
export class Background {
  private layers: Layer[] = [];
  private grid?: Phaser.GameObjects.Graphics;
  private nebulas: Phaser.GameObjects.Image[] = [];
  private scroll = 0;
  speed = 1;

  constructor(private scene: Phaser.Scene, readonly theme: Theme = 'neon') {
    if (theme === 'neon') this.neon();
    else if (theme === 'cave') this.cave();
    else this.fortress();
  }

  private layer(key: string, y: number, h: number, speed: number, alpha = 1, tint?: number) {
    const sprite = this.scene.add.tileSprite(0, y, W, h, key).setOrigin(0).setDepth(DEPTH.bg).setAlpha(alpha);
    if (tint !== undefined) sprite.setTint(tint);
    this.layers.push({ sprite, speed });
    return sprite;
  }

  private nebula(x: number, y: number, color: number, scale: number, alpha = 0.13) {
    this.nebulas.push(
      this.scene.add.image(x, y, 'glow').setTint(color).setAlpha(alpha).setScale(scale).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.bg),
    );
  }

  private neon() {
    const s = this.scene;
    s.add.image(0, 0, 'sky').setOrigin(0).setDisplaySize(W, H).setDepth(DEPTH.bg);
    this.nebula(260, 120, 0x5a1aff, 7);
    this.nebula(720, 200, 0xff2aa0, 6);
    this.nebula(880, 60, 0x1ab8ff, 5);
    this.layer('stars_far', 0, HORIZON, 12);
    this.layer('stars_mid', 0, HORIZON, 30);
    this.layer('stars_near', 0, HORIZON, 70);
    this.layer('mountains', HORIZON - 108, 120, 22);
    s.add.rectangle(W / 2, HORIZON + 1, W, 2, 0xff3cc8, 0.8).setDepth(DEPTH.bg).setBlendMode(Phaser.BlendModes.ADD);
    this.grid = s.add.graphics().setDepth(DEPTH.bg);
  }

  private cave() {
    const s = this.scene;
    s.add.image(0, 0, 'sky_cave').setOrigin(0).setDisplaySize(W, H).setDepth(DEPTH.bg);
    this.nebula(300, 270, 0x1affd0, 8, 0.1);
    this.nebula(800, 140, 0x1a8aff, 6, 0.1);
    this.layer('stars_far', 0, H, 8, 0.35, 0x9fffe8);
    this.layer('crystals', 0, H, 18, 0.3);
    this.layer('crystals', 0, H, 40, 0.5).setFlipX(true);
  }

  private fortress() {
    const s = this.scene;
    s.add.image(0, 0, 'sky_fort').setOrigin(0).setDisplaySize(W, H).setDepth(DEPTH.bg);
    // a red giant looming behind the station
    s.add.image(700, 300, 'glow').setTint(0xff3020).setScale(9).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.bg);
    s.add.image(700, 300, 'glow').setTint(0xffa060).setScale(4).setAlpha(0.25).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.bg);
    this.layer('stars_far', 0, H, 10, 0.7, 0xffc0c0);
    this.layer('stars_mid', 0, H, 26, 0.7, 0xffd0d0);
    this.layer('girders', 0, H, 45, 0.45);
  }

  update(dt: number) {
    const s = this.speed;
    this.scroll += dt * s;
    for (const l of this.layers) l.sprite.tilePositionX += l.speed * dt * s;
    for (let i = 0; i < this.nebulas.length; i++) {
      const n = this.nebulas[i];
      n.x -= (4 + i * 2) * dt * s;
      if (n.x < -250) n.x = W + 250;
    }
    if (this.grid) this.drawGrid();
  }

  // Perspective floor: horizontal lines are fixed with quadratic spacing,
  // vertical lines converge on a vanishing point and scroll left.
  private drawGrid() {
    const g = this.grid!;
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
