// Gera js/levels.js com fases em 4 níveis de dificuldade.
//
// 1. Enumera TODAS as disposições do conjunto de peças (1 bloco 2x2, 5 peças 1x2
//    em qualquer orientação, 4 peças 1x1 e 2 casas vazias): 363.480 estados.
// 2. Calcula, por busca em largura a partir das posições resolvidas, o número
//    mínimo de movimentos de cada estado.
// 3. Escolhe as fases de cada faixa com filtros anti-repetição:
//    - nenhuma fase pode ser espelho de outra;
//    - nenhuma fase pode estar no caminho de solução de outra, nem a até
//      BLOCK_RADIUS movimentos do início de outra;
//    - a disposição precisa diferir em pelo menos MIN_DIFF casas de todas as
//      fases já escolhidas (comparando também com o espelho).
//
// Uso: node tools/gen-levels.mjs [semente=2026]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
vm.runInThisContext(readFileSync(join(root, 'js/solver.js'), 'utf8'));
const { isGoal, neighbors, mirror } = globalThis.Solver;

const TIERS = [
  { name: 'Fácil', lcd: 'FACIL', lo: 12, hi: 30, count: 100 },
  { name: 'Médio', lcd: 'MEDIO', lo: 31, hi: 55, count: 100 },
  { name: 'Difícil', lcd: 'DIFICIL', lo: 56, hi: 85, count: 100 },
  { name: 'Ultra', lcd: 'ULTRA', lo: 86, hi: 138, count: 100 },
];
const MIN_DIFF = 7;
const BLOCK_RADIUS = 2;

let seed = +(process.argv[2] || 2026);
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// ---------- 1. enumeração ----------
function enumerate(nV, nH) {
  const out = [], grid = new Array(20).fill(null);
  const left = { B: 1, V: nV, H: nH, S: 4, '.': 2 };
  const dims = { B: [2, 2], V: [1, 2], H: [2, 1], S: [1, 1], '.': [1, 1] };
  (function rec() {
    const i = grid.indexOf(null);
    if (i < 0) { out.push(grid.join('')); return; }
    const r = (i / 4) | 0, c = i % 4;
    for (const t of ['B', 'V', 'H', 'S', '.']) {
      if (!left[t]) continue;
      const [w, h] = dims[t];
      if (c + w > 4 || r + h > 5) continue;
      let ok = true;
      for (let dy = 0; dy < h && ok; dy++) for (let dx = 0; dx < w; dx++) if (grid[(r + dy) * 4 + c + dx] !== null) { ok = false; break; }
      if (!ok) continue;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) grid[(r + dy) * 4 + c + dx] = t;
      left[t]--;
      rec();
      left[t]++;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) grid[(r + dy) * 4 + c + dx] = null;
    }
  })();
  return out;
}

// ---------- 2. distâncias ----------
const dist = new Map();
const seen = new Set();
let total = 0;
for (let nV = 0; nV <= 5; nV++) {
  for (const s0 of enumerate(nV, 5 - nV)) {
    total++;
    if (seen.has(s0)) continue;
    const comp = [s0];
    seen.add(s0);
    for (let i = 0; i < comp.length; i++) for (const nb of neighbors(comp[i])) if (!seen.has(nb)) { seen.add(nb); comp.push(nb); }
    const q = comp.filter(isGoal);
    for (const s of q) dist.set(s, 0);
    for (let i = 0; i < q.length; i++) {
      const d = dist.get(q[i]);
      for (const nb of neighbors(q[i])) if (!dist.has(nb)) { dist.set(nb, d + 1); q.push(nb); }
    }
  }
}
console.log(`estados: ${total}  solucionáveis: ${dist.size}`);

// ---------- 3. seleção ----------
const byD = new Map();
for (const [s, d] of dist) {
  if (d < TIERS[0].lo) continue;
  if (s > mirror(s)) continue; // um representante por par espelhado
  if (!byD.has(d)) byD.set(d, []);
  byD.get(d).push(s);
}
// embaralha e prioriza o bloco grande longe da saída (linha 0, depois 1...)
for (const arr of byD.values()) {
  const keyed = arr.map((s) => [((s.indexOf('B') / 4) | 0) + rand() * 0.9, s]);
  keyed.sort((a, b) => a[0] - b[0]);
  arr.length = 0;
  for (const [, s] of keyed) arr.push(s);
}

const blocked = new Set();
const chosen = [];
const hamming = (a, b) => { let n = 0; for (let i = 0; i < 20; i++) if (a[i] !== b[i]) n++; return n; };
const block = (s) => { blocked.add(s); blocked.add(mirror(s)); };

function accept(s) {
  // caminho de solução (descida gulosa pela distância) fica bloqueado
  let cur = s;
  while (dist.get(cur) > 0) {
    block(cur);
    const d = dist.get(cur);
    cur = neighbors(cur).find((nb) => dist.get(nb) === d - 1);
  }
  // vizinhança próxima do início também
  let frontier = [s];
  for (let r = 0; r < BLOCK_RADIUS; r++) {
    const next = [];
    for (const x of frontier) for (const nb of neighbors(x)) if (!blocked.has(nb)) { block(nb); next.push(nb); }
    frontier = next;
  }
  block(s);
  chosen.push(s);
}

function ok(s) {
  if (blocked.has(s)) return false;
  const m = mirror(s);
  for (const c of chosen) if (hamming(s, c) < MIN_DIFF || hamming(m, c) < MIN_DIFF) return false;
  return true;
}

const levels = [];
const tierInfo = [];
// do mais difícil para o mais fácil: os estados raros (muito difíceis) escolhem primeiro
for (const tier of [...TIERS].reverse()) {
  const picks = [];
  for (let k = tier.count - 1; k >= 0; k--) { // alvos mais difíceis primeiro (são mais raros)
    const target = Math.round(tier.lo + ((tier.hi - tier.lo) * k) / (tier.count - 1));
    let pick = null;
    for (let delta = 0; !pick && delta <= tier.hi - tier.lo; delta++) {
      for (const d of delta ? [target + delta, target - delta] : [target]) {
        if (d < tier.lo || d > tier.hi) continue;
        const arr = byD.get(d) || [];
        const i = arr.findIndex(ok);
        if (i >= 0) { pick = [arr[i], d]; arr.splice(i, 1); break; }
      }
    }
    if (!pick) break;
    accept(pick[0]);
    picks.push(pick);
  }
  picks.sort((a, b) => a[1] - b[1]);
  tier.picks = picks;
}
for (const tier of TIERS) {
  tierInfo.push({ name: tier.name, lcd: tier.lcd, from: levels.length, count: tier.picks.length });
  levels.push(...tier.picks);
  const ds = tier.picks.map((p) => p[1]);
  const topRow = tier.picks.filter((p) => p[0].indexOf('B') < 4).length;
  console.log(`${tier.name.padEnd(8)} ${tier.picks.length} fases  ${ds[0]}–${ds.at(-1)} movimentos  bloco no topo: ${topRow}`);
}

// fase de demonstração da tela inicial: uma Fácil com ~18 movimentos, com a solução completa
const demoLevel = TIERS[0].picks.reduce((b, p) => (Math.abs(p[1] - 18) < Math.abs(b[1] - 18) ? p : b));
const demo = [demoLevel[0]];
for (let cur = demoLevel[0]; dist.get(cur) > 0;) {
  const d = dist.get(cur);
  cur = neighbors(cur).find((nb) => dist.get(nb) === d - 1);
  demo.push(cur);
}

const body = levels.map(([s, d]) => `["${s}",${d}]`).join(',\n');
writeFileSync(join(root, 'js/levels.js'),
  `// Gerado por tools/gen-levels.mjs — não editar à mão.\n` +
  `// [estado inicial (4x5, linha a linha), movimentos da solução ótima]\n` +
  `window.TIERS = ${JSON.stringify(tierInfo)};\n` +
  `window.LEVELS = [\n${body}\n];\n` +
  `// demonstração da tela inicial (sequência de estados da solução ótima)\n` +
  `window.DEMO = ${JSON.stringify(demo)};\n`);
console.log(`total: ${levels.length} fases`);
