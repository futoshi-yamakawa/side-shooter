import Phaser from 'phaser';
import { DEPTH, FONT, H, W } from '../config';

type Button = {
  key: 'powerup' | 'bomb' | 'pause';
  x: number;
  y: number;
  r: number;
  ptr: number | null;
  hit: boolean;
  g: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  color: number;
};

// Ship moves by the finger's travel, not to the finger, so the thumb never covers it.
const DRAG_GAIN = 1.4;

// Smartphone controls. Any finger outside the buttons drags the ship
// (relative, like most mobile shooters) and fires while it is down; the
// buttons on the right spend the gauge and bomb, the small one pauses.
export class TouchInput {
  dragX = 0;
  dragY = 0;
  dragging = false;
  tapped = false;
  private movePtr: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private buttons: Button[] = [];
  private shown = false;

  constructor(private scene: Phaser.Scene, withButtons: boolean) {
    const input = scene.input;
    input.addPointer(2);
    if (withButtons) {
      this.button('powerup', W - 84, H - 128, 52, 'POWER\nUP', 0xff9a3c);
      this.button('bomb', W - 84, H - 262, 40, 'BOMB', 0xff6a5a);
      this.button('pause', W - 36, 56, 20, 'II', 0x9fb4c8);
      if (scene.sys.game.device.input.touch) this.show();
    }
    input.on('pointerdown', this.down, this);
    input.on('pointermove', this.move, this);
    input.on('pointerup', this.up, this);
    input.on('pointerupoutside', this.up, this);
    scene.events.once('shutdown', () => {
      input.off('pointerdown', this.down, this);
      input.off('pointermove', this.move, this);
      input.off('pointerup', this.up, this);
      input.off('pointerupoutside', this.up, this);
    });
  }

  private button(key: Button['key'], x: number, y: number, r: number, text: string, color: number) {
    const g = this.scene.add.graphics().setDepth(DEPTH.hud).setVisible(false);
    const label = this.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: key === 'pause' ? '13px' : '12px', color: '#ffffff', fontStyle: '700', align: 'center' })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud)
      .setAlpha(0.8)
      .setVisible(false);
    this.buttons.push({ key, x, y, r, ptr: null, hit: false, g, label, color });
  }

  private show() {
    if (this.shown || !this.buttons.length) return;
    this.shown = true;
    for (const b of this.buttons) {
      b.g.setVisible(true);
      b.label.setVisible(true);
    }
  }

  private down(p: Phaser.Input.Pointer) {
    if (p.wasTouch) this.show();
    if (this.shown) {
      for (const b of this.buttons) {
        // generous hit area: thumbs land off-centre
        if ((p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (b.r + 18) ** 2) {
          b.ptr = p.id;
          b.hit = true;
          return;
        }
      }
    }
    if (this.movePtr === null) {
      this.movePtr = p.id;
      this.lastX = p.x;
      this.lastY = p.y;
    }
  }

  private move(p: Phaser.Input.Pointer) {
    if (p.id !== this.movePtr) return;
    this.dragX += (p.x - this.lastX) * DRAG_GAIN;
    this.dragY += (p.y - this.lastY) * DRAG_GAIN;
    this.lastX = p.x;
    this.lastY = p.y;
  }

  private up(p: Phaser.Input.Pointer) {
    // confirm on release: browsers only treat a touch's release as a user gesture
    this.tapped = true;
    if (p.id === this.movePtr) this.movePtr = null;
    for (const b of this.buttons) if (b.ptr === p.id) b.ptr = null;
  }

  // Copies this frame's touch input into the shared state and resets the deltas.
  read(s: { dragX: number; dragY: number; fire: boolean; powerup: boolean; bomb: boolean; pause: boolean; confirm: boolean }) {
    s.dragX += this.dragX;
    s.dragY += this.dragY;
    this.dragX = this.dragY = 0;
    this.dragging = this.movePtr !== null;
    if (this.dragging) s.fire = true;
    const pressed = { powerup: false, bomb: false, pause: false, confirm: this.tapped };
    for (const b of this.buttons) {
      if (b.hit) pressed[b.key] = true;
      b.hit = false;
      this.draw(b);
    }
    this.tapped = false;
    return pressed;
  }

  private draw(b: Button) {
    if (!this.shown) return;
    const held = b.ptr !== null;
    b.g.clear();
    b.g.fillStyle(b.color, held ? 0.45 : 0.14).fillCircle(b.x, b.y, b.r);
    b.g.lineStyle(2, b.color, held ? 1 : 0.6).strokeCircle(b.x, b.y, b.r);
  }
}
