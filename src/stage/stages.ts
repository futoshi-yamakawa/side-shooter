import type { GameScene } from '../scenes/GameScene';
import type { EnemyKind, EnemyParams } from '../entities/enemy';
import type { BossLike } from '../entities/bosses/types';
import { HexaBoss } from '../entities/bosses/hexa';
import { BarrierCore } from '../entities/bosses/barrierCore';
import { Overmind } from '../entities/bosses/overmind';
import type { Theme } from '../systems/background';
import type { TerrainStyle } from '../systems/terrain';
import type { MusicName } from '../systems/audio';

export type Wave = { t: number; run: (g: GameScene) => void };

export type StageDef = {
  name: string;
  sub: string;
  theme: Theme;
  music: MusicName;
  terrain?: { style: TerrainStyle; seed: number; speed: number };
  // multiplies enemy bullet speed
  rank: number;
  warning: string;
  boss: (g: GameScene) => BossLike;
  waves: Wave[];
};

let groupSeq = 0;

// A row of enemies released one after another. With `drop`, wiping out the
// whole row leaves a capsule.
const line =
  (kind: EnemyKind, n: number, gap: number, p: EnemyParams | ((i: number) => EnemyParams), drop = false) =>
  (g: GameScene) => {
    const group = drop ? ++groupSeq : undefined;
    for (let i = 0; i < n; i++) {
      const base = typeof p === 'function' ? p(i) : p;
      g.time.delayedCall(i * gap * 1000, () => g.spawn(kind, { ...base, group, groupSize: n }));
    }
  };

const one = (kind: EnemyKind, p: EnemyParams) => (g: GameScene) => g.spawn(kind, p);
const all = (...fns: ((g: GameScene) => void)[]) => (g: GameScene) => fns.forEach((f) => f(g));
const later = (sec: number, fn: (g: GameScene) => void) => (g: GameScene) => g.time.delayedCall(sec * 1000, () => fn(g));

// Gun emplacements on the terrain, one every `gap` seconds.
const turrets = (sides: ('floor' | 'ceil')[], gap: number) => (g: GameScene) =>
  sides.forEach((side, i) => g.time.delayedCall(i * gap * 1000, () => g.spawn('turret', { y: 0, side })));

const boss = (g: GameScene) => g.startWarning();

export const STAGES: StageDef[] = [
  {
    name: 'STAGE 1',
    sub: 'NEON OUTSKIRTS',
    theme: 'neon',
    music: 'stage1',
    rank: 1,
    warning: 'A HUGE BATTLESHIP IS APPROACHING FAST',
    boss: (g) => new HexaBoss(g),
    waves: [
      { t: 1.5, run: line('dart', 6, 0.18, { y: 150, amp: 40, freq: 4 }, true) },
      { t: 4.0, run: line('dart', 6, 0.18, { y: 390, amp: 40, freq: 4 }, true) },
      { t: 7.0, run: one('pod', { y: 270, tx: 760 }) },
      { t: 9.5, run: line('fan', 6, 0.16, { y: 160, turnX: 300 }, true) },
      { t: 12.5, run: all(one('pod', { y: 150, tx: 800, exit: -1 }), one('pod', { y: 390, tx: 800, exit: 1 })) },
      { t: 16.0, run: line('dart', 8, 0.14, (i) => ({ y: 270, amp: 150, freq: 2.4, speed: 340, shoot: i === 7 }), true) },
      { t: 20.0, run: one('carrier', { y: 270, drop: true }) },
      { t: 24.0, run: line('fan', 6, 0.16, { y: 400, turnX: 260 }, true) },
      { t: 30.0, run: line('dart', 6, 0.16, { y: 120, amp: 30, freq: 5, speed: 420 }, true) },
      { t: 30.6, run: line('dart', 6, 0.16, { y: 420, amp: 30, freq: 5, speed: 420 }, true) },
      { t: 33.0, run: (g) => [0, 1, 2].forEach((i) => g.time.delayedCall(i * 500, () => g.spawn('pod', { y: 140 + i * 130, tx: 820 - i * 60, exit: i === 0 ? -1 : 1 }))) },
      { t: 38.5, run: line('dart', 5, 0.25, (i) => ({ y: 90 + i * 90, dive: true, speed: 280, shoot: true }), true) },
      { t: 42.0, run: all(one('carrier', { y: 160, drop: true }), later(2.5, one('carrier', { y: 390, drop: true }))) },
      { t: 47.0, run: line('dart', 10, 0.12, (i) => ({ y: 270, amp: 180, freq: 3, speed: 360, shoot: i % 3 === 0 }), true) },
      { t: 52.0, run: all(one('pod', { y: 120, tx: 840, exit: -1 }), one('pod', { y: 420, tx: 840, exit: 1 })) },
      // second half: mostly capsule-carrying formations so the ship is built up before the boss
      { t: 56.0, run: line('fan', 6, 0.16, { y: 140, turnX: 300 }, true) },
      { t: 59.0, run: line('fan', 6, 0.16, { y: 400, turnX: 300 }, true) },
      { t: 63.0, run: all(one('pod', { y: 200, tx: 800, exit: -1 }), one('pod', { y: 340, tx: 800, exit: 1 })) },
      { t: 67.0, run: line('dart', 8, 0.14, (i) => ({ y: 270, amp: 160, freq: 2.6, speed: 340, shoot: i === 7 }), true) },
      { t: 71.0, run: one('carrier', { y: 270, drop: true }) },
      { t: 76.0, run: all(line('dart', 6, 0.16, { y: 120, amp: 30, freq: 5, speed: 400 }, true), later(0.6, line('dart', 6, 0.16, { y: 420, amp: 30, freq: 5, speed: 400 }, true))) },
      { t: 80.5, run: line('dart', 5, 0.25, (i) => ({ y: 90 + i * 90, dive: true, speed: 280, shoot: true }), true) },
      { t: 84.0, run: (g) => [0, 1, 2].forEach((i) => g.time.delayedCall(i * 500, () => g.spawn('pod', { y: 140 + i * 130, tx: 820 - i * 60, exit: i === 0 ? -1 : 1 }))) },
      { t: 89.0, run: line('fan', 8, 0.14, { y: 270, turnX: 240 }, true) },
      { t: 93.0, run: line('dart', 10, 0.12, (i) => ({ y: 270, amp: 180, freq: 3, speed: 360, shoot: i % 3 === 0 }), true) },
      { t: 100.0, run: boss },
    ],
  },
  {
    name: 'STAGE 2',
    sub: 'CRYSTAL CAVERN',
    theme: 'cave',
    music: 'stage2',
    terrain: { style: 'cave', seed: 1234, speed: 70 },
    rank: 1.05,
    warning: 'BARRIER CORE DETECTED. AIM FOR THE CHANNEL',
    boss: (g) => new BarrierCore(g),
    waves: [
      { t: 2.0, run: line('fan', 6, 0.16, { y: 230, turnX: 280 }, true) },
      { t: 5.0, run: turrets(['floor', 'floor', 'floor'], 0.9) },
      { t: 8.0, run: line('dart', 6, 0.2, { y: 270, amp: 50, freq: 3 }) },
      { t: 11.0, run: turrets(['ceil', 'ceil', 'ceil'], 0.9) },
      { t: 13.5, run: line('fan', 6, 0.16, { y: 320, turnX: 260 }, true) },
      { t: 17.0, run: all(one('pod', { y: 210, tx: 780, exit: -1 }), one('pod', { y: 330, tx: 780, exit: 1 })) },
      { t: 21.0, run: one('carrier', { y: 270, drop: true }) },
      { t: 25.0, run: turrets(['floor', 'ceil', 'floor', 'ceil'], 0.7) },
      { t: 29.0, run: line('fan', 8, 0.14, { y: 250, turnX: 220 }, true) },
      { t: 33.0, run: line('dart', 5, 0.28, (i) => ({ y: 200 + (i % 2) * 140, dive: true, speed: 280, shoot: true })) },
      { t: 37.0, run: (g) => [0, 1, 2].forEach((i) => g.time.delayedCall(i * 450, () => g.spawn('pod', { y: 190 + i * 80, tx: 820 - i * 50, exit: i === 0 ? -1 : 1 }))) },
      { t: 41.0, run: turrets(['floor', 'floor', 'ceil', 'ceil', 'floor', 'ceil'], 0.55) },
      { t: 45.5, run: all(line('fan', 5, 0.16, { y: 210, turnX: 300 }, true), later(1.4, line('fan', 5, 0.16, { y: 330, turnX: 300 }))) },
      { t: 50.0, run: one('carrier', { y: 270, drop: true }) },
      { t: 55.0, run: turrets(['floor', 'ceil', 'floor'], 0.8) },
      { t: 58.0, run: line('fan', 6, 0.16, { y: 220, turnX: 280 }, true) },
      { t: 61.0, run: turrets(['floor', 'ceil'], 0.8) },
      { t: 64.0, run: line('dart', 6, 0.2, { y: 270, amp: 50, freq: 3 }, true) },
      { t: 68.0, run: all(one('pod', { y: 210, tx: 780, exit: -1 }), one('pod', { y: 330, tx: 780, exit: 1 })) },
      { t: 72.0, run: line('fan', 8, 0.14, { y: 300, turnX: 240 }, true) },
      { t: 76.0, run: turrets(['floor', 'ceil', 'floor', 'ceil'], 0.7) },
      { t: 79.0, run: one('carrier', { y: 270, drop: true }) },
      { t: 84.0, run: all(line('fan', 5, 0.16, { y: 210, turnX: 300 }, true), later(1.4, line('fan', 5, 0.16, { y: 330, turnX: 300 }, true))) },
      { t: 88.0, run: line('dart', 5, 0.28, (i) => ({ y: 200 + (i % 2) * 140, dive: true, speed: 280, shoot: true }), true) },
      { t: 92.0, run: turrets(['floor', 'floor', 'ceil'], 0.7) },
      { t: 95.0, run: line('fan', 6, 0.16, { y: 270, turnX: 260 }, true) },
      { t: 102.0, run: boss },
    ],
  },
  {
    name: 'STAGE 3',
    sub: 'ORBITAL FORTRESS',
    theme: 'fortress',
    music: 'stage3',
    terrain: { style: 'fortress', seed: 4321, speed: 90 },
    rank: 1.1,
    warning: 'FORTRESS CORE IS WAKING UP',
    boss: (g) => new Overmind(g),
    waves: [
      { t: 2.0, run: line('mine', 5, 0.6, (i) => ({ y: 180 + (i % 3) * 90, speed: 90, amp: 30 })) },
      { t: 5.5, run: turrets(['floor', 'ceil', 'floor', 'ceil'], 0.6) },
      { t: 8.5, run: line('fan', 8, 0.13, { y: 240, turnX: 240 }, true) },
      { t: 12.0, run: line('dart', 8, 0.14, (i) => ({ y: 270, amp: 120, freq: 3, speed: 380, shoot: i % 2 === 0 })) },
      { t: 15.0, run: all(one('carrier', { y: 220, drop: true }), turrets(['floor', 'floor'], 1)) },
      { t: 20.0, run: line('mine', 6, 0.45, (i) => ({ y: 160 + (i % 3) * 110, speed: 110, amp: 50 })) },
      { t: 23.0, run: (g) => [0, 1, 2].forEach((i) => g.time.delayedCall(i * 400, () => g.spawn('pod', { y: 170 + i * 100, tx: 820 - i * 50, exit: i === 0 ? -1 : 1 }))) },
      { t: 27.0, run: turrets(['ceil', 'floor', 'ceil', 'floor', 'ceil', 'floor'], 0.5) },
      { t: 31.0, run: all(line('fan', 6, 0.14, { y: 200, turnX: 280 }, true), later(1, line('fan', 6, 0.14, { y: 340, turnX: 280 }, true))) },
      { t: 36.0, run: line('dart', 6, 0.25, (i) => ({ y: 180 + (i % 3) * 80, dive: true, speed: 300, shoot: true })) },
      { t: 40.0, run: all(one('carrier', { y: 200, drop: true }), later(2, one('carrier', { y: 340 }))) },
      { t: 45.0, run: line('mine', 8, 0.35, (i) => ({ y: 150 + (i % 4) * 80, speed: 120, amp: 40 })) },
      { t: 49.0, run: turrets(['floor', 'ceil', 'floor', 'ceil'], 0.5) },
      { t: 52.0, run: line('fan', 10, 0.12, { y: 270, turnX: 220 }, true) },
      { t: 56.0, run: all(one('pod', { y: 200, tx: 820, exit: -1 }), one('pod', { y: 340, tx: 820, exit: 1 })) },
      { t: 59.0, run: line('fan', 8, 0.13, { y: 230, turnX: 240 }, true) },
      { t: 62.0, run: line('mine', 5, 0.6, (i) => ({ y: 180 + (i % 3) * 90, speed: 90, amp: 30 })) },
      { t: 65.0, run: turrets(['floor', 'ceil', 'floor', 'ceil'], 0.6) },
      { t: 68.0, run: line('dart', 8, 0.14, (i) => ({ y: 270, amp: 120, freq: 3, speed: 380, shoot: i % 2 === 0 }), true) },
      { t: 72.0, run: (g) => [0, 1, 2].forEach((i) => g.time.delayedCall(i * 400, () => g.spawn('pod', { y: 170 + i * 100, tx: 820 - i * 50, exit: i === 0 ? -1 : 1 }))) },
      { t: 76.0, run: all(line('fan', 6, 0.14, { y: 200, turnX: 280 }, true), later(1, line('fan', 6, 0.14, { y: 340, turnX: 280 }, true))) },
      { t: 80.0, run: one('carrier', { y: 270, drop: true }) },
      { t: 85.0, run: line('mine', 6, 0.45, (i) => ({ y: 160 + (i % 3) * 110, speed: 110, amp: 50 })) },
      { t: 88.0, run: turrets(['ceil', 'floor', 'ceil', 'floor', 'ceil', 'floor'], 0.5) },
      { t: 91.0, run: line('dart', 6, 0.25, (i) => ({ y: 180 + (i % 3) * 80, dive: true, speed: 300, shoot: true }), true) },
      { t: 95.0, run: line('fan', 10, 0.12, { y: 270, turnX: 220 }, true) },
      { t: 98.0, run: all(one('pod', { y: 200, tx: 820, exit: -1 }), one('pod', { y: 340, tx: 820, exit: 1 })) },
      { t: 104.0, run: boss },
    ],
  },
];
