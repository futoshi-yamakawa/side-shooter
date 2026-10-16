import Phaser from 'phaser';
import { DEPTH, H, W } from '../config';

export type TerrainStyle = 'cave' | 'fortress';

const SEG = 40;
const COUNT = 512;
const MIN_GAP = 250;

type Look = { fill: number; edge: number; inner: number; deco: number };
const LOOKS: Record<TerrainStyle, Look> = {
  cave: { fill: 0x03161a, edge: 0x5affd8, inner: 0x1a6a66, deco: 0x9ffff0 },
  fortress: { fill: 0x3a1420, edge: 0xff5a6a, inner: 0x8a2a36, deco: 0xffb03c },
};

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

// Gradius-style ceiling and floor. Thickness is a precomputed height map
// scrolled at a constant speed; `env` scales it so the walls can grow in at the
// start of a stage and recede before the boss.
export class Terrain {
  private g: Phaser.GameObjects.Graphics;
  private ceil: number[] = [];
  private floor: number[] = [];
  private deco: number[] = [];
  private look: Look;
  scroll = 0;
  env = 0;

  constructor(scene: Phaser.Scene, readonly style: TerrainStyle, seed: number, readonly speed: number) {
    this.look = LOOKS[style];
    this.g = scene.add.graphics().setDepth(DEPTH.terrain);
    const r = rng(seed);
    let c = 70;
    let f = 70;
    let hold = 0;
    for (let i = 0; i < COUNT; i++) {
      if (style === 'cave') {
        c += (r() - 0.5) * 46;
        f += (r() - 0.5) * 46;
        // occasional pinch points
        if (r() < 0.04) (r() < 0.5 ? (c += 60) : (f += 60));
      } else if (--hold <= 0) {
        // blocky steps that hold for a few segments
        hold = 2 + Math.floor(r() * 5);
        c = 30 + Math.floor(r() * 5) * 30;
        f = 30 + Math.floor(r() * 5) * 30;
        if (r() < 0.12) f += 90;
      }
      c = Phaser.Math.Clamp(c, 24, 200);
      f = Phaser.Math.Clamp(f, 24, 200);
      if (c + f > H - MIN_GAP) {
        const k = (H - MIN_GAP) / (c + f);
        c *= k;
        f *= k;
      }
      this.ceil.push(c);
      this.floor.push(f);
      this.deco.push(r());
    }
    if (style === 'cave') {
      // smooth the random walk so the cave reads as rock, not noise
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < COUNT - 1; i++) {
          this.ceil[i] = (this.ceil[i - 1] + this.ceil[i] * 2 + this.ceil[i + 1]) / 4;
          this.floor[i] = (this.floor[i - 1] + this.floor[i] * 2 + this.floor[i + 1]) / 4;
        }
      }
    }
  }

  private thick(arr: number[], screenX: number) {
    const wx = (this.scroll + screenX) / SEG;
    const i = Math.floor(wx);
    const a = arr[((i % COUNT) + COUNT) % COUNT];
    if (this.style === 'fortress') return a * this.env;
    const b = arr[(((i + 1) % COUNT) + COUNT) % COUNT];
    return (a + (b - a) * (wx - i)) * this.env;
  }

  ceilAt(x: number) {
    return this.thick(this.ceil, x);
  }

  floorAt(x: number) {
    return H - this.thick(this.floor, x);
  }

  // True when the point is inside rock (with an optional margin).
  solid(x: number, y: number, margin = 0) {
    if (this.env <= 0.01) return false;
    return y - margin < this.ceilAt(x) || y + margin > this.floorAt(x);
  }

  // Middle of the open gap at x, used to place respawns and spawns.
  gapMid(x: number) {
    return (this.ceilAt(x) + this.floorAt(x)) / 2;
  }

  update(dt: number) {
    this.scroll += this.speed * dt;
    this.draw();
  }

  private draw() {
    const g = this.g;
    g.clear();
    if (this.env <= 0.01) return;
    const L = this.look;
    const step = this.style === 'fortress' ? SEG : SEG / 2;
    const off = this.scroll % step;
    const xs: number[] = [];
    for (let x = -off - step; x <= W + step; x += step) xs.push(x);
    const fortress = this.style === 'fortress';

    const side = (top: boolean) => {
      const edge = (x: number) => (top ? this.ceilAt(x + 0.5) : this.floorAt(x + 0.5));
      const pts: Phaser.Math.Vector2[] = [];
      const base = top ? -10 : H + 10;
      pts.push(new Phaser.Math.Vector2(xs[0], base));
      for (const x of xs) {
        const y = edge(x);
        if (fortress) {
          pts.push(new Phaser.Math.Vector2(x, y), new Phaser.Math.Vector2(x + step, y));
        } else {
          pts.push(new Phaser.Math.Vector2(x, y));
        }
      }
      pts.push(new Phaser.Math.Vector2(xs[xs.length - 1] + step, base));
      g.fillStyle(L.fill, 1);
      g.fillPoints(pts, true);
      const line = pts.slice(1, -1);
      // inner glow band then the bright edge
      g.lineStyle(6, L.inner, 0.5);
      g.strokePoints(line, false);
      g.lineStyle(2, L.edge, 1);
      g.strokePoints(line, false);

      // surface detail: crystals in the cave, rivets/panel seams in the fortress
      for (const x of xs) {
        const wx = Math.floor((this.scroll + x) / step);
        const d = this.deco[((wx % COUNT) + COUNT) % COUNT];
        const y = edge(x);
        if (!fortress && d > 0.72) {
          const h = 8 + d * 18;
          const dir = top ? 1 : -1;
          g.fillStyle(L.deco, 0.8);
          g.fillTriangle(x - 5, y, x + 5, y, x + (d - 0.85) * 20, y + h * dir);
        } else if (fortress) {
          const depth = top ? -1 : 1;
          // hull plating: a seam per block and a darker band near the edge
          g.lineStyle(1, L.inner, 0.9);
          g.lineBetween(x, y + depth * 2, x, y + depth * 200);
          g.fillStyle(0x000000, 0.25);
          g.fillRect(x, top ? y - 200 : y + 8, step, 192);
          if (d > 0.6) {
            g.fillStyle(L.deco, 0.9);
            g.fillRect(x + step / 2 - 2, y + depth * 10 - 2, 4, 4);
          }
        }
      }
    };
    side(true);
    side(false);
  }
}
