import Phaser from 'phaser';
import { DEPTH, FONT, W } from '../config';

const text = (scene: Phaser.Scene, x: number, y: number, s: string, size: number, color = '#e8fbff') =>
  scene.add
    .text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: '700' })
    .setDepth(DEPTH.hud)
    .setScrollFactor(0);

export class Hud {
  private scoreText: Phaser.GameObjects.Text;
  private hiText: Phaser.GameObjects.Text;
  private powerText: Phaser.GameObjects.Text;
  private lifeIcons: Phaser.GameObjects.Image[] = [];
  private shown = 0;
  private bossBar: Phaser.GameObjects.Graphics;
  private bossLabel: Phaser.GameObjects.Text;
  private bossShown = 0;
  private bossLag = 0;
  private bossFill = 0;
  private bossVisible = false;

  constructor(private scene: Phaser.Scene, private hi: number) {
    this.scoreText = text(scene, 20, 14, '', 18).setShadow(0, 0, '#3cf0ff', 8, true, true);
    this.hiText = text(scene, W - 20, 14, '', 14, '#9fb4c8').setOrigin(1, 0);
    this.powerText = text(scene, 20, 40, '', 12, '#7dff9a');
    this.bossBar = scene.add.graphics().setDepth(DEPTH.hud);
    this.bossLabel = text(scene, W / 2, 60, '', 11, '#ff9ab0').setOrigin(0.5, 0).setAlpha(0);
  }

  update(dt: number, score: number, lives: number, power: number, boss?: { hp: number; maxHp: number }) {
    // Rolling score counter.
    this.shown += (score - this.shown) * Math.min(1, dt * 12);
    if (Math.abs(score - this.shown) < 1) this.shown = score;
    this.scoreText.setText('SCORE ' + Math.round(this.shown).toString().padStart(8, '0'));
    this.hiText.setText('HI ' + Math.max(this.hi, score).toString().padStart(8, '0'));
    this.powerText.setText('PWR ' + '■'.repeat(power) + '□'.repeat(3 - power));

    while (this.lifeIcons.length < lives) {
      this.lifeIcons.push(this.scene.add.image(0, 0, 'player').setScale(0.36).setDepth(DEPTH.hud));
    }
    while (this.lifeIcons.length > lives) this.lifeIcons.pop()!.destroy();
    this.lifeIcons.forEach((ic, i) => ic.setPosition(36 + i * 28, 70));

    this.drawBoss(dt, boss);
  }

  showBoss(name: string) {
    this.bossVisible = true;
    this.bossLabel.setText(name);
    this.scene.tweens.add({ targets: this, bossFill: 1, duration: 1400, ease: 'Cubic.Out' });
    this.scene.tweens.add({ targets: this.bossLabel, alpha: 1, duration: 400 });
  }

  hideBoss() {
    this.bossVisible = false;
    this.bossBar.clear();
    this.bossLabel.setAlpha(0);
  }

  // Boss bar with a trailing "damage chunk" that drains after the real value.
  private drawBoss(dt: number, boss?: { hp: number; maxHp: number }) {
    const g = this.bossBar;
    g.clear();
    if (!this.bossVisible || !boss) return;
    const ratio = (boss.hp / boss.maxHp) * this.bossFill;
    this.bossShown = ratio;
    if (this.bossLag < ratio) this.bossLag = ratio;
    else this.bossLag = Math.max(ratio, this.bossLag - dt * 0.35);
    const x = W / 2 - 220;
    const y = 44;
    const w = 440;
    g.fillStyle(0x000000, 0.6).fillRect(x - 2, y - 2, w + 4, 14);
    g.fillStyle(0xffffff, 0.85).fillRect(x, y, w * this.bossLag, 10);
    g.fillStyle(0xff4d6d, 1).fillRect(x, y, w * this.bossShown, 10);
    g.fillStyle(0xffb0c0, 1).fillRect(x, y, w * this.bossShown, 2);
    g.lineStyle(1, 0xff9ab0, 0.8).strokeRect(x - 2, y - 2, w + 4, 14);
    g.lineStyle(1, 0xffffff, 0.6).lineBetween(x + w * 0.5, y - 2, x + w * 0.5, y + 12);
  }

  banner(title: string, sub: string, ms: number, color = '#e8fbff') {
    const s = this.scene;
    const t = text(s, W / 2, 230, title, 40, color).setOrigin(0.5).setShadow(0, 0, color, 18, true, true).setDepth(DEPTH.overlay);
    const st = text(s, W / 2, 282, sub, 14, '#c8d8e8').setOrigin(0.5).setDepth(DEPTH.overlay);
    t.setScale(1.6, 0.2).setAlpha(0);
    s.tweens.add({ targets: t, scaleX: 1, scaleY: 1, alpha: 1, duration: 260, ease: 'Back.Out' });
    st.setAlpha(0);
    s.tweens.add({ targets: st, alpha: 1, duration: 300, delay: 200 });
    s.time.delayedCall(ms, () => {
      s.tweens.add({ targets: [t, st], alpha: 0, duration: 300, onComplete: () => (t.destroy(), st.destroy()) });
    });
    return [t, st];
  }

  popup(x: number, y: number, value: number, color = '#ffe08a') {
    const p = text(this.scene, x, y, value.toString(), 13, color).setOrigin(0.5).setDepth(DEPTH.hud - 1);
    this.scene.tweens.add({ targets: p, y: y - 30, alpha: 0, duration: 700, ease: 'Quad.Out', onComplete: () => p.destroy() });
  }
}
