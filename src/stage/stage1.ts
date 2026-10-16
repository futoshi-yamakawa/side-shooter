import type { GameScene } from '../scenes/GameScene';
import type { EnemyKind, EnemyParams } from '../entities/enemy';

export type Wave = { t: number; run: (g: GameScene) => void };

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

// Stage 1 timeline in seconds. The boss warning fires when the last entry runs.
export const STAGE1: Wave[] = [
  { t: 1.5, run: line('dart', 6, 0.18, { y: 150, amp: 40, freq: 4 }) },
  { t: 4.0, run: line('dart', 6, 0.18, { y: 390, amp: 40, freq: 4 }, true) },
  { t: 7.0, run: (g) => g.spawn('pod', { y: 270, tx: 760 }) },
  { t: 9.5, run: line('dart', 5, 0.22, (i) => ({ y: 100 + i * 80, shoot: i % 2 === 0, speed: 300 })) },
  { t: 12.5, run: (g) => (g.spawn('pod', { y: 150, tx: 800, exit: -1 }), g.spawn('pod', { y: 390, tx: 800, exit: 1 })) },
  { t: 16.0, run: line('dart', 8, 0.14, (i) => ({ y: 270, amp: 150, freq: 2.4, speed: 340, shoot: i === 7 }), true) },
  { t: 20.0, run: (g) => g.spawn('carrier', { y: 270, drop: true }) },
  { t: 24.0, run: line('dart', 4, 0.3, (i) => ({ y: i % 2 ? 80 : 460, dive: true, speed: 300 })) },
  { t: 30.0, run: line('dart', 6, 0.16, { y: 120, amp: 30, freq: 5, speed: 420 }) },
  { t: 30.6, run: line('dart', 6, 0.16, { y: 420, amp: 30, freq: 5, speed: 420 }, true) },
  { t: 33.0, run: (g) => ['pod', 'pod', 'pod'].forEach((k, i) => g.time.delayedCall(i * 500, () => g.spawn('pod', { y: 140 + i * 130, tx: 820 - i * 60, exit: i - 1 || 1 }))) },
  { t: 38.5, run: line('dart', 5, 0.25, (i) => ({ y: 90 + i * 90, dive: true, speed: 280, shoot: true }), true) },
  { t: 42.0, run: (g) => (g.spawn('carrier', { y: 160, drop: true }), g.time.delayedCall(2500, () => g.spawn('carrier', { y: 390, drop: true }))) },
  { t: 47.0, run: line('dart', 10, 0.12, (i) => ({ y: 270, amp: 180, freq: 3, speed: 360, shoot: i % 3 === 0 }), true) },
  { t: 52.0, run: (g) => (g.spawn('pod', { y: 120, tx: 840, exit: -1 }), g.spawn('pod', { y: 420, tx: 840, exit: 1 })) },
  { t: 60.0, run: (g) => g.startWarning() },
];
