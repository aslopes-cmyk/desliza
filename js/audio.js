/* Efeitos sonoros sintetizados (WebAudio), sem arquivos externos. */
(function () {
  'use strict';
  let ctx = null;
  const Sfx = {
    enabled: true,
    unlock() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    tone(freq, dur = 0.05, type = 'square', vol = 0.05, when = 0) {
      if (!this.enabled || !ctx) return;
      const t = ctx.currentTime + when;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    step() { this.tone(1500, 0.025, 'square', 0.03); },
    bump() { this.tone(140, 0.06, 'triangle', 0.08); },
    key() { this.tone(880, 0.03, 'square', 0.035); },
    hold() { this.tone(660, 0.06, 'square', 0.04); this.tone(990, 0.08, 'square', 0.04, 0.07); },
    tick() { this.tone(1200, 0.04, 'sine', 0.06); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.12, 'square', 0.045, i * 0.085)); },
    fail() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.16, 'sawtooth', 0.035, i * 0.13)); },
    boot() { [262, 392, 523].forEach((f, i) => this.tone(f, 0.07, 'square', 0.03, i * 0.06)); },
  };
  window.Sfx = Sfx;
})();
