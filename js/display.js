/* Visor de matriz de pontos (64 x 24) desenhado em canvas, com fonte 3x5 própria. */
(function () {
  'use strict';
  const COLS = 64, ROWS = 24;
  const FONT = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
    '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
    '8': '111101111101111', '9': '111101111001111',
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
    E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
    I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
    Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111',
    ' ': '000000000000000', ':': '000010000010000', '.': '000000000000010', '-': '000000111000000',
    '!': '010010010000010', '/': '001001010100100', '>': '100010001010100', '<': '001010100010001',
    '+': '000010111010000', '?': '110001010000010',
  };
  const COLOR = {
    B: '#ff8a2a', V: '#2fd0bf', H: '#2fd0bf', S: '#b39bff',
    text: '#eaf6ff', dim: '#ffffff12', warn: '#ff5470', good: '#7dffa8', hint: '#ffffff',
  };

  class Display {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.buf = new Array(COLS * ROWS);
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = this.canvas.clientWidth || 256;
      this.dot = (w * dpr) / COLS;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(this.dot * ROWS);
    }
    clear() { this.buf.fill(null); }
    px(x, y, color) { if (x >= 0 && y >= 0 && x < COLS && y < ROWS) this.buf[y * COLS + x] = color; }
    rect(x, y, w, h, color) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, color); }
    text(str, x, y, color = COLOR.text) {
      for (const ch of String(str).toUpperCase()) {
        const g = FONT[ch] || FONT['?'];
        for (let i = 0; i < 15; i++) if (g[i] === '1') this.px(x + (i % 3), y + ((i / 3) | 0), color);
        x += 4;
      }
      return x;
    }
    /** mini tabuleiro: cada casa = 4x4 pontos */
    board(pieces, x0, y0, opts = {}) {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) this.rect(x0 + c * 4, y0 + r * 4, 3, 3, '#ffffff1c');
      if (opts.ghost) {
        const g = opts.ghost;
        this.rect(x0 + g.c * 4, y0 + g.r * 4, g.w * 4 - 1, g.h * 4 - 1, '#ffffff55');
      }
      for (const p of pieces) {
        if (p.hidden) continue;
        let col = COLOR[p.t];
        if (opts.blink === p) col = COLOR.hint;
        this.rect(x0 + p.c * 4, y0 + p.r * 4, p.w * 4 - 1, p.h * 4 - 1, col);
      }
      // saída
      this.rect(x0 + 4, y0 + 21, 7, 1, opts.exitColor || '#ff8a2a66');
    }
    flush() {
      const { ctx, dot } = this;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const r = dot * 0.36;
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const c = this.buf[y * COLS + x];
        ctx.fillStyle = c || COLOR.dim;
        ctx.beginPath();
        ctx.arc((x + 0.5) * dot, (y + 0.5) * dot, c ? r * 1.12 : r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  Display.COLOR = COLOR;
  window.Display = Display;
})();
