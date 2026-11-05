/*
 * Núcleo do quebra-cabeça (compartilhado entre o jogo e o gerador de níveis).
 *
 * Tabuleiro 4 colunas x 5 linhas. Um estado é uma string de 20 caracteres
 * (linha a linha):  '.' vazio · 'B' bloco grande 2x2 · 'V' peça vertical 1x2
 *                   'H' peça horizontal 2x1 · 'S' peça pequena 1x1
 * A leitura é inequívoca: varrendo em ordem, a primeira célula encontrada de
 * cada peça é sempre o seu canto superior esquerdo.
 *
 * Métrica de movimento: mover UMA peça qualquer distância (inclusive virando
 * esquina) conta como 1 movimento — a métrica clássica do Klotski.
 */
(function (g) {
  'use strict';
  const W = 4, H = 5, N = W * H;
  const DIM = { B: [2, 2], V: [1, 2], H: [2, 1], S: [1, 1] };
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const GOAL_R = 3, GOAL_C = 1;

  function parse(s) {
    const seen = new Uint8Array(N), ps = [];
    for (let i = 0; i < N; i++) {
      const t = s[i];
      if (t === '.' || seen[i]) continue;
      const [w, h] = DIM[t];
      const r = (i / W) | 0, c = i % W;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) seen[(r + dy) * W + c + dx] = 1;
      ps.push({ t, r, c, w, h });
    }
    return ps;
  }

  function isGoal(s) {
    return s[13] === 'B' && s[14] === 'B' && s[17] === 'B' && s[18] === 'B';
  }

  function fill(grid, p, r, c, ch) {
    for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) grid[(r + dy) * W + c + dx] = ch;
  }

  function fits(grid, p, r, c) {
    if (r < 0 || c < 0 || r + p.h > H || c + p.w > W) return false;
    for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) if (grid[(r + dy) * W + c + dx] !== '.') return false;
    return true;
  }

  /**
   * Posições alcançáveis pela peça p (com as demais fixas), com caminho célula a célula.
   * grid deve estar SEM a peça p. Retorna [{r,c,path:[[r,c],...]}] (exclui a origem).
   */
  function reach(grid, p) {
    const key = (r, c) => r * W + c;
    const prev = new Map([[key(p.r, p.c), null]]);
    const q = [[p.r, p.c]], out = [];
    for (let qi = 0; qi < q.length; qi++) {
      const [r, c] = q[qi];
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc, k = key(nr, nc);
        if (prev.has(k) || !fits(grid, p, nr, nc)) continue;
        prev.set(k, key(r, c));
        q.push([nr, nc]);
        const path = [];
        for (let x = k; x !== null; x = prev.get(x)) path.push([(x / W) | 0, x % W]);
        path.reverse();
        out.push({ r: nr, c: nc, path });
      }
    }
    return out;
  }

  /** Estados vizinhos (1 movimento de peça). */
  function neighbors(s) {
    const ps = parse(s), grid = s.split(''), out = [];
    for (const p of ps) {
      fill(grid, p, p.r, p.c, '.');
      const prev = new Uint8Array(N);
      prev[p.r * W + p.c] = 1;
      const q = [p.r * W + p.c];
      for (let qi = 0; qi < q.length; qi++) {
        const r = (q[qi] / W) | 0, c = q[qi] % W;
        for (const [dr, dc] of DIRS) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
          const k = nr * W + nc;
          if (prev[k] || !fits(grid, p, nr, nc)) continue;
          prev[k] = 1;
          q.push(k);
          fill(grid, p, nr, nc, p.t);
          out.push(grid.join(''));
          fill(grid, p, nr, nc, '.');
        }
      }
      fill(grid, p, p.r, p.c, p.t);
    }
    return out;
  }

  function mirror(s) {
    const ps = parse(s), grid = new Array(N).fill('.');
    for (const p of ps) fill(grid, p, p.r, W - p.c - p.w, p.t);
    return grid.join('');
  }

  /**
   * Analisador incremental: explora o componente do estado inicial e calcula a
   * distância (em movimentos) de cada estado até a solução. Rodado em fatias
   * para não travar a interface.
   */
  class Analyzer {
    constructor(start) {
      this.start = start;
      this.seen = new Set([start]);
      this.queue = [start];
      this.qi = 0;
      this.phase = 0; // 0 explorando, 1 distâncias, 2 pronto
      this.dist = new Map();
    }
    step(budgetMs) {
      const t0 = Date.now();
      let n = 0;
      while (this.phase < 2) {
        if ((++n & 63) === 0 && Date.now() - t0 > budgetMs) return false;
        if (this.phase === 0) {
          if (this.qi >= this.queue.length) {
            this.queue = [...this.seen].filter(isGoal);
            for (const s of this.queue) this.dist.set(s, 0);
            this.qi = 0;
            this.phase = 1;
            continue;
          }
          for (const nb of neighbors(this.queue[this.qi++])) {
            if (!this.seen.has(nb)) { this.seen.add(nb); this.queue.push(nb); }
          }
        } else {
          if (this.qi >= this.queue.length) { this.phase = 2; this.seen = null; this.queue = null; break; }
          const s = this.queue[this.qi++], d = this.dist.get(s);
          for (const nb of neighbors(s)) {
            if (!this.dist.has(nb)) { this.dist.set(nb, d + 1); this.queue.push(nb); }
          }
        }
      }
      return true;
    }
    get done() { return this.phase === 2; }
    run() { while (!this.step(1e9)); return this; }
  }

  g.Solver = { W, H, N, DIM, GOAL_R, GOAL_C, parse, isGoal, neighbors, reach, fill, fits, mirror, Analyzer };
})(typeof globalThis !== 'undefined' ? globalThis : window);
