import Phaser from 'phaser';
import { buildTextures } from '../systems/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  async create() {
    buildTextures(this);
    // Text is drawn to canvas, so the web font must be ready before any scene renders it.
    try {
      await Promise.race([
        Promise.all([document.fonts.load('700 20px Orbitron'), document.fonts.load('900 20px Orbitron')]),
        new Promise((r) => setTimeout(r, 2500)),
      ]);
    } catch {
      // fall back to the system font
    }
    const params = new URLSearchParams(location.search);
    this.scene.start('Title', { boss: params.has('boss'), startAt: Number(params.get('t')) || 0 });
  }
}
