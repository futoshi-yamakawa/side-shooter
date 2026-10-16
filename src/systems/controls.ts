import Phaser from 'phaser';

export type ControlState = {
  x: number;
  y: number;
  fire: boolean;
  focus: boolean;
  bomb: boolean;
  pause: boolean;
  confirm: boolean;
};

const DEADZONE = 0.28;

// Unified keyboard + gamepad input.
//
// Gamepads are read straight from navigator.getGamepads() rather than through
// Phaser's plugin so both layouts of the Logitech F310 work:
// - "standard" mapping (XInput mode, or DirectInput mode that the browser
//   recognises): A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 Back=8 Start=9, D-pad 12-15.
// - raw DirectInput (mapping ""): X=0 A=1 B=2 Y=3, D-pad reported as a hat axis.
export class Controls {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private prev: ControlState = blank();
  state: ControlState = blank();
  pressed: ControlState = blank();
  padName = '';

  constructor(scene: Phaser.Scene) {
    this.keys = scene.input.keyboard!.addKeys(
      'UP,DOWN,LEFT,RIGHT,W,A,S,D,Z,X,C,SHIFT,SPACE,ENTER,ESC,P',
    ) as Record<string, Phaser.Input.Keyboard.Key>;
  }

  update() {
    const k = this.keys;
    const s = blank();
    if (k.LEFT.isDown || k.A.isDown) s.x -= 1;
    if (k.RIGHT.isDown || k.D.isDown) s.x += 1;
    if (k.UP.isDown || k.W.isDown) s.y -= 1;
    if (k.DOWN.isDown || k.S.isDown) s.y += 1;
    s.fire = k.Z.isDown || k.SPACE.isDown;
    s.focus = k.SHIFT.isDown;
    s.bomb = k.X.isDown || k.C.isDown;
    s.pause = k.ESC.isDown || k.P.isDown;
    s.confirm = k.Z.isDown || k.ENTER.isDown || k.SPACE.isDown;

    const pad = firstPad();
    this.padName = pad?.id ?? '';
    if (pad) readPad(pad, s);

    s.x = Phaser.Math.Clamp(s.x, -1, 1);
    s.y = Phaser.Math.Clamp(s.y, -1, 1);

    for (const key of Object.keys(s) as (keyof ControlState)[]) {
      if (key === 'x' || key === 'y') continue;
      (this.pressed[key] as boolean) = (s[key] as boolean) && !(this.prev[key] as boolean);
    }
    // A tap shorter than one frame never shows up in isDown; JustDown latches it.
    const jd = Phaser.Input.Keyboard.JustDown;
    if (jd(k.Z) || jd(k.ENTER) || jd(k.SPACE)) this.pressed.confirm = true;
    if (jd(k.X) || jd(k.C)) this.pressed.bomb = true;
    if (jd(k.ESC) || jd(k.P)) this.pressed.pause = true;
    this.prev = this.state = s;
  }
}

function blank(): ControlState {
  return { x: 0, y: 0, fire: false, focus: false, bomb: false, pause: false, confirm: false };
}

function firstPad(): Gamepad | null {
  if (!navigator.getGamepads) return null;
  for (const p of navigator.getGamepads()) if (p && p.connected) return p;
  return null;
}

function readPad(p: Gamepad, s: ControlState) {
  const b = (i: number) => !!p.buttons[i]?.pressed;
  const ax = p.axes[0] ?? 0;
  const ay = p.axes[1] ?? 0;
  if (Math.hypot(ax, ay) > DEADZONE) {
    s.x += ax;
    s.y += ay;
  }

  if (p.mapping === 'standard') {
    if (b(14)) s.x -= 1;
    if (b(15)) s.x += 1;
    if (b(12)) s.y -= 1;
    if (b(13)) s.y += 1;
    s.fire ||= b(0) || b(2);
    s.bomb ||= b(1) || b(3);
    s.focus ||= b(4) || b(5) || b(6) || b(7);
    s.pause ||= b(9);
    s.confirm ||= b(0) || b(9);
    return;
  }

  // Raw DirectInput layout.
  s.fire ||= b(1) || b(0);
  s.bomb ||= b(2) || b(3);
  s.focus ||= b(4) || b(5) || b(6) || b(7);
  s.pause ||= b(9);
  s.confirm ||= b(1) || b(9);
  // D-pad as a POV hat: -1 = up, stepping 2/7 clockwise, > 1 = centred.
  const hat = p.axes[9];
  if (hat !== undefined && hat >= -1.01 && hat <= 1.01) {
    const dir = Math.round(((hat + 1) * 7) / 2) % 8;
    const DX = [0, 1, 1, 1, 0, -1, -1, -1];
    const DY = [-1, -1, 0, 1, 1, 1, 0, -1];
    s.x += DX[dir];
    s.y += DY[dir];
  }
}
