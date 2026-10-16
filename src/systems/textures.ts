import Phaser from 'phaser';
import { H } from '../config';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

// All art is generated at boot from canvas drawing, so the game ships with no
// third-party image assets and no licensing questions.
function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  draw(ctx, w, h);
  tex.refresh();
}

function poly(ctx: CanvasRenderingContext2D, pts: number[][]) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function neon(ctx: CanvasRenderingContext2D, color: string, width: number, blur: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.stroke();
  ctx.shadowBlur = blur / 2;
  ctx.stroke();
  ctx.restore();
}

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

export function buildTextures(scene: Phaser.Scene) {
  // ---- generic fx ----
  make(scene, 'glow', 64, 64, (c) =>
    radial(c, 32, 32, 32, [
      [0, 'rgba(255,255,255,1)'],
      [0.25, 'rgba(255,255,255,0.8)'],
      [0.6, 'rgba(255,255,255,0.2)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );
  make(scene, 'ring', 128, 128, (c) => {
    c.beginPath();
    c.arc(64, 64, 54, 0, Math.PI * 2);
    neon(c, '#ffffff', 5, 10);
  });
  make(scene, 'debris', 12, 12, (c) => {
    poly(c, [[1, 2], [11, 5], [4, 11]]);
    c.fillStyle = '#ffffff';
    c.fill();
  });
  make(scene, 'pixel', 4, 4, (c) => {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, 4, 4);
  });

  // ---- player ----
  make(scene, 'player', 72, 44, (c) => {
    const body = [[64, 22], [40, 13], [22, 5], [10, 9], [18, 18], [8, 22], [18, 26], [10, 35], [22, 39], [40, 31]];
    poly(c, body);
    const g = c.createLinearGradient(0, 0, 0, 44);
    g.addColorStop(0, '#16314a');
    g.addColorStop(0.5, '#0b1a2b');
    g.addColorStop(1, '#16314a');
    c.fillStyle = g;
    c.fill();
    neon(c, '#3cf0ff', 2, 8);
    // wing accents
    c.beginPath();
    c.moveTo(22, 8); c.lineTo(36, 16);
    c.moveTo(22, 36); c.lineTo(36, 28);
    neon(c, '#9ffbff', 1.5, 4);
    // canopy
    c.beginPath();
    c.ellipse(44, 22, 8, 3.5, 0, 0, Math.PI * 2);
    c.fillStyle = '#d8fdff';
    c.shadowColor = '#3cf0ff';
    c.shadowBlur = 8;
    c.fill();
    c.shadowBlur = 0;
    radial(c, 12, 22, 7, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(60,240,255,0.8)'], [1, 'rgba(60,240,255,0)']]);
  });
  make(scene, 'hitbox', 14, 14, (c) => {
    radial(c, 7, 7, 7, [[0, '#ffffff'], [0.45, '#ffffff'], [0.6, '#ff3c8a'], [1, 'rgba(255,60,138,0)']]);
  });
  make(scene, 'muzzle', 40, 24, (c) => {
    c.save();
    c.translate(4, 12);
    c.scale(1, 0.45);
    radial(c, 0, 0, 30, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(160,250,255,0.9)'], [1, 'rgba(60,240,255,0)']]);
    c.restore();
  });
  make(scene, 'pshot', 34, 12, (c) => {
    c.save();
    c.shadowColor = '#3cf0ff';
    c.shadowBlur = 6;
    c.fillStyle = '#3cf0ff';
    c.beginPath();
    c.roundRect(3, 3, 28, 6, 3);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.roundRect(10, 4.5, 21, 3, 1.5);
    c.fill();
    c.restore();
  });
  make(scene, 'pshot2', 30, 12, (c) => {
    c.save();
    c.shadowColor = '#7dff9a';
    c.shadowBlur = 6;
    c.fillStyle = '#7dff9a';
    c.beginPath();
    c.roundRect(3, 3, 24, 6, 3);
    c.fill();
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.roundRect(9, 4.5, 18, 3, 1.5);
    c.fill();
    c.restore();
  });

  // ---- enemy bullets: dark rim keeps them readable over any background ----
  const orb = (key: string, size: number, rim: string, core: string) =>
    make(scene, key, size, size, (c, w) => {
      const r = w / 2;
      radial(c, r, r, r, [[0, core], [0.45, core], [0.62, rim], [0.85, 'rgba(20,0,20,0.9)'], [1, 'rgba(0,0,0,0)']]);
    });
  orb('eb', 18, '#ff3ce0', '#ffffff');
  orb('eb_big', 28, '#ff8a2a', '#fff4d0');
  orb('eb_blue', 18, '#4d8bff', '#ffffff');

  // ---- enemies ----
  make(scene, 'dart', 52, 36, (c) => {
    poly(c, [[4, 18], [28, 6], [46, 2], [38, 18], [46, 34], [28, 30]]);
    c.fillStyle = '#2a0b0b';
    c.fill();
    neon(c, '#ff5a3c', 2, 7);
    radial(c, 20, 18, 5, [[0, '#ffffff'], [0.4, '#ffb03c'], [1, 'rgba(255,90,60,0)']]);
    radial(c, 44, 18, 5, [[0, 'rgba(255,200,120,0.9)'], [1, 'rgba(255,90,60,0)']]);
  });
  make(scene, 'pod', 56, 56, (c) => {
    const pts: number[][] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      pts.push([28 + Math.cos(a) * 22, 28 + Math.sin(a) * 22]);
    }
    poly(c, pts);
    c.fillStyle = '#1d0a2b';
    c.fill();
    neon(c, '#c86bff', 2, 7);
    c.beginPath();
    c.arc(28, 28, 12, 0, Math.PI * 2);
    neon(c, '#e9b5ff', 1.2, 3);
    radial(c, 28, 28, 8, [[0, '#ffffff'], [0.4, '#ff3ce0'], [1, 'rgba(255,60,224,0)']]);
  });
  make(scene, 'carrier', 132, 80, (c) => {
    const hull = [[6, 40], [26, 22], [60, 14], [104, 10], [126, 22], [118, 40], [126, 58], [104, 70], [60, 66], [26, 58]];
    poly(c, hull);
    const g = c.createLinearGradient(0, 10, 0, 70);
    g.addColorStop(0, '#2d2608');
    g.addColorStop(0.5, '#141004');
    g.addColorStop(1, '#2d2608');
    c.fillStyle = g;
    c.fill();
    neon(c, '#ffd23c', 2, 8);
    c.beginPath();
    c.moveTo(30, 40); c.lineTo(110, 40);
    c.moveTo(60, 20); c.lineTo(70, 40); c.lineTo(60, 60);
    c.moveTo(90, 16); c.lineTo(96, 40); c.lineTo(90, 64);
    neon(c, 'rgba(255,210,60,0.55)', 1, 3);
    radial(c, 22, 40, 9, [[0, '#ffffff'], [0.4, '#ff8a2a'], [1, 'rgba(255,138,42,0)']]);
    for (const y of [20, 60]) radial(c, 80, y, 5, [[0, '#ffffff'], [0.5, '#ffd23c'], [1, 'rgba(255,210,60,0)']]);
  });

  // ---- boss ----
  make(scene, 'boss', 280, 220, (c) => {
    const hull = [[20, 110], [60, 70], [110, 40], [180, 20], [250, 30], [270, 70], [240, 110], [270, 150], [250, 190], [180, 200], [110, 180], [60, 150]];
    poly(c, hull);
    const g = c.createLinearGradient(0, 20, 0, 200);
    g.addColorStop(0, '#2b0812');
    g.addColorStop(0.5, '#10040a');
    g.addColorStop(1, '#2b0812');
    c.fillStyle = g;
    c.fill();
    neon(c, '#ff4d6d', 2.5, 10);
    // armor plates
    const plates = [
      [[70, 78], [120, 52], [170, 40], [160, 80], [110, 92]],
      [[70, 142], [120, 168], [170, 180], [160, 140], [110, 128]],
      [[190, 36], [244, 44], [256, 74], [206, 80]],
      [[190, 184], [244, 176], [256, 146], [206, 140]],
    ];
    for (const p of plates) {
      poly(c, p);
      c.fillStyle = 'rgba(255,77,109,0.08)';
      c.fill();
      neon(c, 'rgba(255,120,150,0.8)', 1.2, 4);
    }
    // core socket
    c.beginPath();
    c.arc(150, 110, 30, 0, Math.PI * 2);
    c.fillStyle = '#05010a';
    c.fill();
    neon(c, '#ff9ab0', 2, 6);
    // gun ports
    for (const [x, y] of [[66, 82], [66, 138], [40, 110]]) {
      radial(c, x, y, 7, [[0, '#ffffff'], [0.5, '#ff4d6d'], [1, 'rgba(255,77,109,0)']]);
    }
    // engines
    for (const y of [70, 150]) radial(c, 268, y, 12, [[0, '#ffffff'], [0.3, '#ff8a2a'], [1, 'rgba(255,138,42,0)']]);
  });
  make(scene, 'boss_core', 64, 64, (c) => {
    radial(c, 32, 32, 32, [[0, '#ffffff'], [0.25, '#ffd0ff'], [0.5, '#ff3ce0'], [0.8, 'rgba(120,0,90,0.6)'], [1, 'rgba(0,0,0,0)']]);
  });

  // ---- items ----
  make(scene, 'powerup', 40, 40, (c) => {
    c.beginPath();
    c.roundRect(6, 8, 28, 24, 8);
    c.fillStyle = '#062a12';
    c.fill();
    neon(c, '#7dff9a', 2, 8);
    c.fillStyle = '#ffffff';
    c.font = 'bold 18px Arial';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = '#7dff9a';
    c.shadowBlur = 6;
    c.fillText('P', 20, 21);
  });
  make(scene, 'star', 16, 16, (c) => {
    c.save();
    c.translate(8, 8);
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 7 : 2.5;
      const a = (i / 8) * Math.PI * 2;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fillStyle = '#ffe08a';
    c.shadowColor = '#ffd23c';
    c.shadowBlur = 5;
    c.fill();
    c.restore();
  });

  // ---- background ----
  make(scene, 'sky', 8, H, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#02010a');
    g.addColorStop(0.45, '#0a0322');
    g.addColorStop(0.68, '#2a0838');
    g.addColorStop(0.72, '#4a0f45');
    g.addColorStop(0.75, '#14041f');
    g.addColorStop(1, '#05010c');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  const stars = (key: string, count: number, maxR: number, seed: number, alpha: number) =>
    make(scene, key, 512, 400, (c) => {
      const r = rng(seed);
      for (let i = 0; i < count; i++) {
        const x = r() * 512;
        const y = r() * 400;
        const s = 0.4 + r() * maxR;
        c.fillStyle = `rgba(${200 + r() * 55},${200 + r() * 55},255,${alpha * (0.4 + r() * 0.6)})`;
        c.beginPath();
        c.arc(x, y, s, 0, Math.PI * 2);
        c.fill();
      }
    });
  stars('stars_far', 140, 0.6, 7, 0.6);
  stars('stars_mid', 60, 1.0, 13, 0.8);
  stars('stars_near', 18, 1.6, 29, 1);
  make(scene, 'mountains', 1024, 120, (c, w, h) => {
    const r = rng(42);
    const pts: number[][] = [[0, h]];
    let y = 80;
    for (let x = 0; x <= w; x += 16) {
      y += (r() - 0.5) * 26;
      y = Math.max(20, Math.min(100, y));
      // make it tile seamlessly
      const edge = Math.min(x, w - x) / 120;
      const yy = edge < 1 ? 80 + (y - 80) * edge : y;
      pts.push([x, yy]);
    }
    pts.push([w, h]);
    poly(c, pts);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1b0630');
    g.addColorStop(1, '#07010f');
    c.fillStyle = g;
    c.fill();
    c.beginPath();
    for (let i = 1; i < pts.length - 1; i++) (i === 1 ? c.moveTo : c.lineTo).call(c, pts[i][0], pts[i][1]);
    neon(c, 'rgba(255,60,200,0.7)', 1.5, 6);
  });
}
