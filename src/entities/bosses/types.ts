// 'hit' = damage landed, 'block' = absorbed by armour, null = missed entirely.
export type HitResult = 'hit' | 'block' | null;

export interface BossLike {
  readonly name: string;
  readonly color: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly x: number;
  readonly y: number;
  // half-extent used to scatter the death explosions
  readonly size: { w: number; h: number };
  // can be shot at all (not entering, not exploding)
  readonly active: boolean;
  update(dt: number): void;
  hitTest(x: number, y: number, dmg: number): HitResult;
  touches(x: number, y: number): boolean;
  bomb(dmg: number): void;
  enter(onArrive: () => void): void;
  destroy(): void;
}
