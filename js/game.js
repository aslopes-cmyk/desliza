/* Desliza — lógica do jogo, controles e interface. */
(function () {
  'use strict';
  const { parse, isGoal, reach, fits, Analyzer } = window.Solver;
  const LEVELS = window.LEVELS;
  const NL = LEVELS.length;
  const TIERS = window.TIERS; // [{name, lcd, from, count}]
  const tierOf = (i) => TIERS.findIndex((t) => i >= t.from && i < t.from + t.count);
  const numInTier = (i) => i - TIERS[tierOf(i)].from + 1;
  const levelName = (i) => `${TIERS[tierOf(i)].name} ${numInTier(i)}`;
  const MODES = {
    free: { name: 'Livre', lcd: 'LIVRE', desc: 'sem tempo' },
    learn: { name: 'Aprender', lcd: 'APRENDER', desc: 'passo a passo' },
    challenge: { name: 'Desafio', lcd: 'DESAFIO', desc: 'contra o relógio' },
  };
  const GRADES = [['S', 0.5, 'Super'], ['A', 0.65, 'Elite'], ['B', 0.8, 'Mestre'], ['C', 0.9, 'Intermediário'], ['D', 1, 'Iniciante']];

  const $ = (s) => document.querySelector(s);
  const boardEl = $('#board'), areaEl = $('#boardArea'), frameEl = $('#frame');
  const lcd = new window.Display($('#lcd'));
  const Sfx = window.Sfx;

  // ---------------- progresso salvo ----------------
  const STORE = 'desliza.v2'; // v2: novas fases em 4 dificuldades
  const DEFAULTS = { level: 0, mode: 'free', best: {}, sound: true, haptics: true, seenHelp: false };
  let save;
  try { save = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { save = Object.assign({}, DEFAULTS); }
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) { /* armazenamento indisponível */ } };
  Sfx.enabled = save.sound;

  // ---------------- peças (sempre as mesmas 10, como no aparelho) ----------------
  const pieces = ['B', 'D', 'D', 'D', 'D', 'D', 'S', 'S', 'S', 'S'].map((k, i) => {
    const el = document.createElement('div');
    el.className = 'piece k-' + k;
    el.dataset.i = i;
    boardEl.appendChild(el);
    const t = k === 'D' ? 'V' : k;
    const [w, h] = { B: [2, 2], V: [1, 2], S: [1, 1] }[t];
    // posição inicial "fora" do tabuleiro, para a primeira montagem
    return { i, k, t, w, h, r: 4, c: 1, dx: 0, dy: 0, el };
  });
  const big = pieces[0];
  const ghostEl = document.createElement('div');
  ghostEl.className = 'ghost';
  ghostEl.hidden = true;
  boardEl.appendChild(ghostEl);

  let cell = 64, gap = 3;

  function layout() {
    const wall = Math.max(8, Math.round(Math.min(areaEl.clientWidth, areaEl.clientHeight * 0.8) * 0.03));
    const availW = areaEl.clientWidth - wall * 2;
    const availH = areaEl.clientHeight - wall * 2;
    cell = Math.max(36, Math.floor(Math.min(availW / 4, availH / 5)));
    gap = Math.max(2, Math.round(cell * 0.035));
    const root = document.documentElement.style;
    root.setProperty('--cell', cell + 'px');
    root.setProperty('--gap', gap + 'px');
    root.setProperty('--wall', wall + 'px');
    for (const p of pieces) place(p, false);
    if (hint) showHint(hint);
    lcd.resize();
  }

  function place(p, animate = true) {
    const el = p.el;
    if (!animate) el.style.transition = 'none';
    el.style.width = p.w * cell - gap * 2 + 'px';
    el.style.height = p.h * cell - gap * 2 + 'px';
    el.style.transform = `translate(${p.c * cell + gap + p.dx}px, ${p.r * cell + gap + p.dy}px)`;
    el.classList.toggle('t-V', p.t === 'V');
    el.classList.toggle('t-H', p.t === 'H');
    if (!animate) { void el.offsetWidth; el.style.transition = ''; }
  }

  function gridWithout(skip) {
    const g = new Array(20).fill('.');
    for (const p of pieces) {
      if (p === skip) continue;
      for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) g[(p.r + y) * 4 + p.c + x] = p.t;
    }
    return g;
  }
  const stateString = () => gridWithout(null).join('');
  const snapshot = () => ({ pos: pieces.map((p) => [p.r, p.c]), moves, lastPiece });
  function restore(s) {
    pieces.forEach((p, i) => { [p.r, p.c] = s.pos[i]; p.dx = p.dy = 0; place(p); });
    moves = s.moves;
    lastPiece = s.lastPiece;
  }

  // ---------------- estado da partida ----------------
  let levelIdx = Math.min(save.level, NL - 1);
  let mode = MODES[save.mode] ? save.mode : 'free';
  let status = 'ready'; // ready | playing | won | failed
  let moves = 0, lastPiece = -1, history = [];
  let tStart = 0, tElapsed = 0, timeLimit = 0;
  let assisted = false; // usou o modo Aprender nesta tentativa
  let analyzer = null, hint = null, busy = false;
  let lcdMsg = null; // {lines:[...], until}
  let lastCountdownSec = -1;
  let booted = false;

  const optimal = () => LEVELS[levelIdx][1];
  const challengeLimit = (opt) => Math.round(5 + opt * 2);
  let pausedAt = 0;
  const elapsed = () => (status === 'playing' ? ((pausedAt || performance.now()) - tStart) / 1000 : tElapsed);

  /** Monta o nível: as mesmas peças deslizam até as novas posições (a "montagem" do aparelho). */
  function loadLevel(idx, opts = {}) {
    const prevTier = tierOf(levelIdx);
    levelIdx = (idx + NL) % NL;
    save.level = levelIdx;
    save.tierPos = save.tierPos || {};
    save.tierPos[tierOf(levelIdx)] = levelIdx;
    if (opts.announce !== false && tierOf(levelIdx) !== prevTier && booted) toast('Dificuldade: ' + TIERS[tierOf(levelIdx)].name);
    persist();
    const target = parse(LEVELS[levelIdx][0]);
    const groups = { B: [], D: [], S: [] };
    for (const t of target) groups[t.t === 'V' || t.t === 'H' ? 'D' : t.t].push(t);
    for (const k of Object.keys(groups)) {
      const free = pieces.filter((p) => p.k === k);
      for (const t of groups[k]) {
        let bestI = 0, bestD = Infinity;
        free.forEach((p, i) => { const d = Math.abs(p.r - t.r) + Math.abs(p.c - t.c); if (d < bestD) { bestD = d; bestI = i; } });
        const p = free.splice(bestI, 1)[0];
        Object.assign(p, { t: t.t, r: t.r, c: t.c, w: t.w, h: t.h, dx: 0, dy: 0 });
      }
    }
    boardEl.classList.remove('won', 'failed', 'locked');
    pieces.forEach((p, i) => {
      p.el.classList.remove('escape', 'dragging', 'hinted');
      p.el.style.opacity = '';
      p.el.classList.add('settling');
      p.el.style.transitionDelay = opts.instant ? '' : i * 18 + 'ms';
      place(p, !opts.instant);
    });
    setTimeout(() => pieces.forEach((p) => { p.el.classList.remove('settling'); p.el.style.transitionDelay = ''; }), 700);
    resetRun();
    startAnalyzer(LEVELS[levelIdx][0]);
    updateTip();
  }

  function resetRun() {
    status = 'ready';
    moves = 0; lastPiece = -1; history = [];
    tElapsed = 0; tStart = 0;
    timeLimit = challengeLimit(optimal());
    assisted = mode === 'learn';
    lastCountdownSec = -1;
    clearHint();
    lcdMsg = null;
  }

  function restart() { loadLevel(levelIdx); }

  function startPlaying() {
    if (status !== 'ready') return;
    status = 'playing';
    tStart = performance.now();
  }

  // ---------------- análise / dicas ----------------
  function startAnalyzer(state) {
    const a = (analyzer = new Analyzer(state));
    (function tick() {
      if (a !== analyzer) return;
      if (a.step(8)) { if (mode === 'learn') refreshHint(); }
      else setTimeout(tick, 0);
    })();
  }

  function computeHint() {
    if (!analyzer || !analyzer.done) return null;
    const s = stateString(), d = analyzer.dist.get(s);
    if (d === undefined || d === 0) return null;
    for (const p of pieces) {
      const g = gridWithout(p);
      for (const dest of reach(g, p)) {
        const save = [p.r, p.c];
        p.r = dest.r; p.c = dest.c;
        const ns = stateString();
        p.r = save[0]; p.c = save[1];
        if (analyzer.dist.get(ns) === d - 1) return { p, r: dest.r, c: dest.c, path: dest.path, remaining: d };
      }
    }
    return null;
  }

  function showHint(h) {
    pieces.forEach((p) => p.el.classList.toggle('hinted', p === h.p));
    ghostEl.hidden = false;
    ghostEl.style.width = h.p.w * cell - gap * 2 + 'px';
    ghostEl.style.height = h.p.h * cell - gap * 2 + 'px';
    ghostEl.style.transform = `translate(${h.c * cell + gap}px, ${h.r * cell + gap}px)`;
  }
  function clearHint() {
    hint = null;
    ghostEl.hidden = true;
    pieces.forEach((p) => p.el.classList.remove('hinted'));
  }
  function refreshHint() {
    clearHint();
    if (mode !== 'learn' || status === 'won' || status === 'failed') return;
    hint = computeHint();
    if (hint) showHint(hint);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function autoStep() {
    if (busy || status === 'won' || status === 'failed') return;
    if (!analyzer || !analyzer.done) { toast('Calculando solução…'); return; }
    const h = hint || computeHint();
    if (!h) return;
    busy = true;
    clearHint();
    startPlaying();
    const before = snapshot();
    h.p.el.classList.add('fast');
    for (const [r, c] of h.path.slice(1)) {
      h.p.r = r; h.p.c = c;
      place(h.p);
      Sfx.step();
      await sleep(115);
    }
    h.p.el.classList.remove('fast');
    commitMove(h.p, before);
    busy = false;
    afterMove();
  }

  // ---------------- movimentação ----------------
  function commitMove(p, before) {
    history.push(before);
    if (lastPiece !== p.i) moves++;
    lastPiece = p.i;
  }

  function afterMove() {
    if (isGoal(stateString())) return win();
    refreshHint();
  }

  function undo() {
    if (busy || !history.length || status === 'won' || status === 'failed') { Sfx.bump(); return; }
    restore(history.pop());
    afterMove();
  }

  let drag = null;
  const canInteract = () => !busy && (status === 'ready' || status === 'playing');

  boardEl.addEventListener('pointerdown', (e) => {
    Sfx.unlock();
    const el = e.target.closest('.piece');
    if (!el || drag || !canInteract()) return;
    e.preventDefault();
    const p = pieces[+el.dataset.i];
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    drag = { p, id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: null, before: snapshot(), moved: false };
    el.classList.add('dragging');
  });

  boardEl.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = drag.p;
    let dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    for (let guard = 0; guard < 12; guard++) {
      const ax = Math.abs(dx), ay = Math.abs(dy);
      // histerese: só troca de eixo se o outro dominar com folga
      if (!drag.axis || (drag.axis === 'x' && ay > ax + cell * 0.2) || (drag.axis === 'y' && ax > ay + cell * 0.2)) {
        if (ax > 3 || ay > 3) drag.axis = ax >= ay ? 'x' : 'y';
      }
      if (!drag.axis) break;
      const v = drag.axis === 'x' ? dx : dy;
      const s = Math.sign(v);
      const dr = drag.axis === 'y' ? s : 0, dc = drag.axis === 'x' ? s : 0;
      const can = s !== 0 && fits(gridWithout(p), p, p.r + dr, p.c + dc);
      if (can && Math.abs(v) >= cell * 0.5) {
        p.r += dr; p.c += dc;
        if (dc) { drag.x0 += dc * cell; dx -= dc * cell; } else { drag.y0 += dr * cell; dy -= dr * cell; }
        drag.moved = true;
        startPlaying();
        Sfx.step();
        if (save.haptics && navigator.vibrate) navigator.vibrate(6);
        continue;
      }
      const off = can ? v : s * Math.min(Math.abs(v) * 0.08, 4);
      p.dx = drag.axis === 'x' ? off : 0;
      p.dy = drag.axis === 'y' ? off : 0;
      break;
    }
    place(p);
  });

  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const { p, moved, before } = drag;
    drag = null;
    p.el.classList.remove('dragging');
    p.dx = p.dy = 0;
    place(p);
    if (moved) {
      const [r0, c0] = before.pos[p.i];
      if (r0 !== p.r || c0 !== p.c) { commitMove(p, before); afterMove(); }
    }
  }
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);
  boardEl.addEventListener('lostpointercapture', endDrag);

  // ---------------- fim de partida ----------------
  function gradeFor(t) {
    const f = t / timeLimit;
    for (const g of GRADES) if (f <= g[1]) return g;
    return ['E', Infinity, 'Falhou'];
  }

  function win() {
    tElapsed = elapsed();
    status = 'won';
    clearHint();
    boardEl.classList.add('won', 'locked');
    Sfx.win();
    if (save.haptics && navigator.vibrate) navigator.vibrate([20, 40, 20, 40, 60]);
    // o bloco grande "escapa" pela abertura
    setTimeout(() => {
      big.el.classList.add('escape');
      big.el.style.transform = `translate(${big.c * cell + gap}px, ${(big.r + 2.6) * cell}px)`;
    }, 120);

    const opt = optimal();
    const grade = mode === 'challenge' ? gradeFor(tElapsed) : null;
    const key = String(levelIdx);
    const prev = save.best[key] || {};
    let record = false;
    if (!assisted) {
      const b = Object.assign({}, prev);
      if (!b.moves || moves < b.moves) { b.moves = moves; record = !!prev.moves; }
      if (!b.time || tElapsed < b.time) b.time = Math.round(tElapsed * 10) / 10;
      if (grade && (!b.grade || 'SABCDE'.indexOf(grade[0]) < 'SABCDE'.indexOf(b.grade))) b.grade = grade[0];
      save.best[key] = b;
      persist();
    }
    lcdMsg = {
      lines: [
        ['RESOLVIDO!', window.Display.COLOR.good],
        [grade ? 'NOTA ' + grade[0] : moves <= opt ? 'PERFEITO' : 'MIN ' + opt],
        ['M' + String(moves).padStart(3, '0') + ' ' + fmt(tElapsed)],
      ],
    };
    setTimeout(() => showResult({ won: true, grade, opt, record }), 900);
  }

  function fail() {
    tElapsed = timeLimit;
    status = 'failed';
    clearHint();
    boardEl.classList.add('failed', 'locked');
    Sfx.fail();
    if (save.haptics && navigator.vibrate) navigator.vibrate([80, 60, 80]);
    lcdMsg = { lines: [['TEMPO!', window.Display.COLOR.warn], ['NOTA E', window.Display.COLOR.warn], ['M' + String(moves).padStart(3, '0')]] };
    setTimeout(() => showResult({ won: false, grade: ['E', 0, 'Falhou'], opt: optimal() }), 700);
  }

  // ---------------- modos ----------------
  function setMode(m, opts = {}) {
    if (!MODES[m]) return;
    const was = mode;
    mode = m;
    save.mode = m;
    persist();
    if (m === 'learn') {
      // Aprender continua da posição atual (se a partida não terminou)
      if (status === 'won' || status === 'failed') loadLevel(levelIdx);
      assisted = true;
      refreshHint();
    } else {
      clearHint();
      if (m === 'challenge' || was === 'challenge' || status === 'won' || status === 'failed') loadLevel(levelIdx);
    }
    if (!opts.silent) toast('Modo ' + MODES[m].name);
    updateTip();
  }

  function updateTip() {
    const t = $('#tip');
    if (mode === 'learn') t.textContent = '▶ executa o próximo passo · ◀ volta';
    else if (mode === 'challenge') t.textContent = `Limite: ${fmt(timeLimit)} · nota S a E`;
    else t.textContent = `${levelName(levelIdx)} · mínimo de ${optimal()} movimentos`;
  }

  // ---------------- teclas físicas (toque / segurar) ----------------
  const HOLD_MS = 650;
  const keyState = {};
  function bindKey(id, { tap, hold }) {
    const el = $('#' + id);
    const st = (keyState[id] = { down: false, held: false, timer: 0 });
    el.addEventListener('pointerdown', (e) => {
      Sfx.unlock();
      e.preventDefault();
      st.down = true; st.held = false;
      el.classList.add('down');
      if (comboCheck()) return;
      if (hold) {
        el.classList.add('holding');
        st.timer = setTimeout(() => { st.held = true; el.classList.remove('holding'); Sfx.hold(); hold(); }, HOLD_MS);
      }
    });
    const up = (e) => {
      if (!st.down) return;
      st.down = false;
      clearTimeout(st.timer);
      el.classList.remove('down', 'holding');
      if (e.type === 'pointerup' && !st.held && !st.combo) { Sfx.key(); tap(); }
      st.combo = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // ◀ + ▶ segurados juntos: liga/desliga o som (como no aparelho)
  let comboTimer = 0;
  function comboCheck() {
    const a = keyState.kPrev, b = keyState.kNext;
    if (!(a && b && a.down && b.down)) return false;
    clearTimeout(a.timer); clearTimeout(b.timer);
    a.combo = b.combo = true;
    clearTimeout(comboTimer);
    comboTimer = setTimeout(() => { if (a.down && b.down) toggleSound(); }, HOLD_MS);
    return true;
  }

  bindKey('kPrev', {
    tap: () => (mode === 'learn' ? undo() : loadLevel(levelIdx - 1)),
    hold: () => setMode(mode === 'learn' ? 'free' : 'learn'),
  });
  bindKey('kNext', {
    tap: () => (mode === 'learn' ? autoStep() : loadLevel(levelIdx + 1)),
    hold: () => setMode(mode === 'challenge' ? 'free' : 'challenge'),
  });
  bindKey('kUndo', { tap: undo, hold: () => { restart(); toast('Reiniciado'); } });
  bindKey('kMenu', { tap: openMenu });
  $('#screen').addEventListener('click', () => { Sfx.unlock(); openLevels(); });
  $('#mute').addEventListener('click', () => { Sfx.unlock(); toggleSound(); });

  function toggleSound() {
    save.sound = Sfx.enabled = !save.sound;
    persist();
    $('#mute').classList.toggle('off', !save.sound);
    $('#hSound').classList.toggle('off', !save.sound);
    toast(save.sound ? 'Som ligado' : 'Som desligado');
  }
  $('#mute').classList.toggle('off', !save.sound);

  document.addEventListener('keydown', (e) => {
    if (e.repeat && !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    if (!$('#sheet').hidden) { if (e.key === 'Escape') closeSheet(); return; }
    if (homeOpen) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } return; }
    const k = e.key.toLowerCase();
    if (k === 'arrowleft') mode === 'learn' ? undo() : loadLevel(levelIdx - 1);
    else if (k === 'arrowright') mode === 'learn' ? autoStep() : loadLevel(levelIdx + 1);
    else if (k === 'z' || k === 'backspace') undo();
    else if (k === 'r') restart();
    else if (k === 'l') setMode(mode === 'learn' ? 'free' : 'learn');
    else if (k === 'c') setMode(mode === 'challenge' ? 'free' : 'challenge');
    else if (k === 'm') toggleSound();
    else if (k === 'escape' || k === 'enter') openMenu();
    else return;
    e.preventDefault();
  });

  // ---------------- folhas: menu, níveis, ajuda, resultado ----------------
  const sheet = $('#sheet'), sheetBody = $('#sheetBody'), backdrop = $('#backdrop');
  let onSheetClose = null;
  function openSheet(html, onClose) {
    sheetBody.innerHTML = html;
    sheet.hidden = backdrop.hidden = false;
    sheetBody.scrollTop = 0;
    onSheetClose = onClose || null;
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = backdrop.hidden = true;
    const cb = onSheetClose;
    onSheetClose = null;
    if (cb) cb();
  }
  backdrop.addEventListener('click', closeSheet);
  sheetBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    Sfx.key();
    const [act, arg] = b.dataset.act.split(':');
    ACTIONS[act] && ACTIONS[act](arg, b);
  });

  const ACTIONS = {
    mode: (m) => { closeSheet(); setMode(m); },
    levels: () => openLevels(),
    help: () => openHelp(),
    close: () => closeSheet(),
    goto: (n) => { onSheetClose = null; closeSheet(); loadLevel(+n); if (homeOpen) hideHome(); },
    home: () => { onSheetClose = null; closeSheet(); showHome(); },
    about: () => openAbout(),
    tier: (t) => openLevels(+t),
    diff: (t) => { onSheetClose = null; closeSheet(); selectTier(+t); toast('Dificuldade: ' + TIERS[+t].name); },
    next: () => { onSheetClose = null; closeSheet(); loadLevel(levelIdx + 1); },
    retry: () => { onSheetClose = null; closeSheet(); loadLevel(levelIdx); },
    learn: () => { onSheetClose = null; closeSheet(); loadLevel(levelIdx); setMode('learn'); },
    haptics: () => { save.haptics = !save.haptics; persist(); openMenu(); },
    reset: () => {
      if (!confirm('Apagar todo o progresso salvo neste aparelho?')) return;
      save.best = {}; persist(); closeSheet(); loadLevel(0); toast('Progresso apagado');
    },
  };

  /** Vai para a dificuldade t, na primeira fase não resolvida a partir de onde o jogador parou. */
  function selectTier(t) {
    const tr = TIERS[t];
    let i = save.tierPos && save.tierPos[t] !== undefined ? save.tierPos[t] : tr.from;
    if (save.best[i]) {
      for (let k = 0; k < tr.count; k++) { const j = tr.from + ((i - tr.from + k) % tr.count); if (!save.best[j]) { i = j; break; } }
    }
    loadLevel(i, { announce: false });
  }

  function solvedCount() { return Object.keys(save.best).length; }

  function openMenu() {
    const m = Object.entries(MODES).map(([k, v]) =>
      `<button data-act="mode:${k}" class="${k === mode ? 'on' : ''}">${v.name}<small>${v.desc}</small></button>`).join('');
    openSheet(`
      <h2>Menu</h2>
      <h3>Dificuldade</h3>
      <div class="seg seg4">${TIERS.map((t, k) => {
        let n = 0; for (let i = t.from; i < t.from + t.count; i++) if (save.best[i]) n++;
        return `<button data-act="diff:${k}" class="${k === tierOf(levelIdx) ? 'on' : ''}">${t.name}<small>${LEVELS[t.from][1]}–${LEVELS[t.from + t.count - 1][1]} mov · ${n}/${t.count}</small></button>`;
      }).join('')}</div>
      <h3>Modo de jogo</h3>
      <div class="seg">${m}</div>
      <div class="list-btns">
        <button class="btn" data-act="levels">▦ Fases <span class="note">· ${solvedCount()}/${NL} resolvidos</span></button>
        <button class="btn" data-act="home">⌂ Tela inicial</button>
        <button class="btn" data-act="help">? Como jogar</button>
        <button class="btn" data-act="about">i Sobre</button>
        <button class="btn" data-act="haptics">${save.haptics ? '✓' : '○'} Vibração ao mover</button>
        <button class="btn" data-act="reset">↺ Apagar progresso</button>
      </div>
      <div class="btn-row"><button class="btn primary" data-act="close">Voltar ao jogo</button></div>`);
  }

  function openLevels(tier) {
    if (tier === undefined) tier = tierOf(levelIdx);
    const tabs = TIERS.map((tr, t) => {
      let n = 0;
      for (let i = tr.from; i < tr.from + tr.count; i++) if (save.best[i]) n++;
      return `<button data-act="tier:${t}" class="${t === tier ? 'on' : ''}">${tr.name}<span>${n}/${tr.count}</span></button>`;
    }).join('');
    let cells = '';
    const T = TIERS[tier];
    for (let i = T.from; i < T.from + T.count; i++) {
      const b = save.best[i];
      const cls = [b ? 'solved' : '', b && b.moves <= LEVELS[i][1] ? 'perfect' : '', i === levelIdx ? 'current' : ''].join(' ');
      cells += `<button data-act="goto:${i}" class="${cls}" aria-label="${levelName(i)}, ${LEVELS[i][1]} movimentos">${i - T.from + 1}${b && b.grade ? `<em>${b.grade}</em>` : ''}</button>`;
    }
    openSheet(`
      <h2>Fases</h2>
      <div class="tier-tabs">${tabs}</div>
      <p class="note">${T.name}: soluções de ${LEVELS[T.from][1]} a ${LEVELS[T.from + T.count - 1][1]} movimentos.</p>
      <div class="levels">${cells}</div>
      <p class="note">Verde: resolvido · verde forte: no mínimo de movimentos · letra: melhor nota no Desafio.</p>`);
  }

  function openHelp(first) {
    openSheet(`
      <h2>Como jogar</h2>
      <p><b>Objetivo:</b> deslize as peças, sem tirá-las do tabuleiro, até levar o <b style="color:var(--big)">bloco laranja</b> à abertura no centro da borda de baixo.</p>
      <p>Arraste uma peça com o dedo. Ela só anda por casas vazias, e pode virar a esquina no mesmo gesto. Mover a mesma peça várias vezes seguidas conta como <b>um</b> movimento.</p>
      <h3>Modos</h3>
      <ul>
        <li><b>Livre</b>: sem limite de tempo. O visor mostra movimentos e tempo.</li>
        <li><b>Aprender</b> (segure ◀): mostra o próximo passo da solução ótima. ▶ executa o passo e ◀ volta um.</li>
        <li><b>Desafio</b> (segure ▶): resolva antes de o tempo acabar. A nota vai de <b>S</b> (super) até <b>E</b> (falhou).</li>
      </ul>
      <h3>Teclas</h3>
      <ul>
        <li><b>◀ / ▶</b>: fase anterior ou próxima. No modo Aprender, voltam ou avançam um passo.</li>
        <li><b>↶</b>: desfaz o último movimento. Segure para reiniciar a fase.</li>
        <li><b>●</b>: menu. Escolha ali a dificuldade. Toque no visor para abrir a lista de fases.</li>
        <li><b>◀ + ▶</b> segurados juntos: liga ou desliga o som.</li>
      </ul>
      <h3>Dificuldades</h3>
      <ul>${TIERS.map((t) => `<li><b>${t.name}</b>: ${t.count} fases, soluções de ${LEVELS[t.from][1]} a ${LEVELS[t.from + t.count - 1][1]} movimentos.</li>`).join('')}</ul>
      <p class="note">Não há fases repetidas nem espelhadas, e nenhuma fase é um trecho da solução de outra. O cronômetro começa no primeiro movimento.</p>
      <div class="btn-row"><button class="btn primary" data-act="close">${first ? 'Começar' : 'Entendi'}</button></div>`,
    first ? () => { save.seenHelp = true; persist(); } : null);
  }

  function openAbout() {
    openSheet(`
      <h2>Sobre o Desliza</h2>
      <p><b>Desliza</b> é um quebra-cabeça de blocos deslizantes para jogar no celular. A regra cabe numa frase: mova as peças pelo tabuleiro, sem tirá-las do lugar, até o bloco laranja escapar pela abertura de baixo.</p>
      <h3>Inspiração</h3>
      <p>O jogo se inspira em quebra-cabeças deslizantes consagrados, como o <b>Klotski</b> e o chinês <b>Huarong Dao</b>, que usam essa mesma ideia de um bloco grande preso entre peças menores, e nos consoles de bolso que levaram esse desafio para a palma da mão.</p>
      <p>Nome, visual e fases são originais. O Desliza não tem ligação com nenhum fabricante desses jogos.</p>
      <h3>As fases</h3>
      <p>As ${NL} fases foram selecionadas por um programa que examinou todas as 363.480 disposições possíveis das peças e calculou a solução mínima de cada uma. Por isso o número de movimentos mostrado em cada fase é comprovadamente o menor possível. Nenhuma fase repete, espelha ou faz parte da solução de outra.</p>
      <h3>O projeto</h3>
      <p>Desliza é um projeto pessoal, desenvolvido com apoio de IA (Claude, da Anthropic). Funciona direto no navegador e pode ser instalado na tela inicial para jogar offline.</p>
      <p class="note">Seu progresso fica salvo apenas neste aparelho. O jogo não coleta dados pessoais, não usa cookies de rastreamento e não exibe anúncios.</p>
      <p><span class="about-badge">v1.0</span><span class="about-badge">${NL} fases</span><span class="about-badge">HTML · CSS · JavaScript</span></p>
      <div class="btn-row"><button class="btn primary" data-act="close">Fechar</button></div>`);
  }

  // ---------------- tela inicial ----------------
  const homeEl = $('#home');
  let homeOpen = true;

  function renderHome() {
    const cur = tierOf(levelIdx);
    $('#hDiff').innerHTML = TIERS.map((t, k) => {
      let n = 0;
      for (let i = t.from; i < t.from + t.count; i++) if (save.best[i]) n++;
      return `<button data-tier="${k}" class="${k === cur ? 'on' : ''}"><b>${t.name}</b><small>${LEVELS[t.from][1]}–${LEVELS[t.from + t.count - 1][1]} mov</small><span class="bar"><span style="width:${(100 * n) / t.count}%"></span></span><small>${n}/${t.count}</small></button>`;
    }).join('');
    $('#hMode').innerHTML = Object.entries(MODES).map(([k, v]) =>
      `<button data-mode="${k}" class="${k === mode ? 'on' : ''}">${v.name}<small>${v.desc}</small></button>`).join('');
    const started = status === 'playing' && moves > 0;
    $('#hPlayT').textContent = started ? 'CONTINUAR' : 'JOGAR';
    $('#hPlayS').textContent = `${levelName(levelIdx)} · ${MODES[mode].name}`;
    $('#hSound').classList.toggle('off', !save.sound);
  }

  function showHome() {
    if (status === 'playing' && !pausedAt) pausedAt = performance.now();
    homeOpen = true;
    renderHome();
    homeEl.classList.remove('hide');
    homeEl.scrollTop = 0;
    demo.start();
  }
  function hideHome() {
    if (pausedAt) { tStart += performance.now() - pausedAt; pausedAt = 0; }
    homeOpen = false;
    homeEl.classList.add('hide');
    demo.stop();
  }
  function play() {
    Sfx.unlock();
    Sfx.boot();
    hideHome();
    if (!save.seenHelp) setTimeout(() => openHelp(true), 350);
  }

  $('#hPlay').addEventListener('click', play);
  $('#hDiff').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tier]');
    if (!b) return;
    Sfx.unlock(); Sfx.key();
    selectTier(+b.dataset.tier);
    renderHome();
  });
  $('#hMode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    Sfx.unlock(); Sfx.key();
    setMode(b.dataset.mode, { silent: true });
    renderHome();
  });
  homeEl.querySelector('.h-links').addEventListener('click', (e) => {
    const b = e.target.closest('[data-home]');
    if (!b) return;
    Sfx.unlock();
    const a = b.dataset.home;
    if (a === 'sound') toggleSound();
    else { Sfx.key(); ({ levels: () => openLevels(), help: () => openHelp(), about: openAbout })[a](); }
  });

  /** Demonstração: uma fase sendo resolvida em loop, atrás do menu. */
  const demo = (() => {
    const box = $('#demo');
    const els = [];
    const kinds = ['B', 'D', 'D', 'D', 'D', 'D', 'S', 'S', 'S', 'S'];
    const ps = kinds.map((k) => {
      const el = document.createElement('i');
      el.className = 'k-' + k;
      box.appendChild(el);
      els.push(el);
      return { k, el, r: -9, c: -9, w: 1, h: 1 };
    });
    let timer = 0, idx = 0;
    const DEMO = window.DEMO || [];
    const g = 2;
    function draw(p) {
      p.el.style.width = `calc(var(--dc) * ${p.w} - ${g * 2}px)`;
      p.el.style.height = `calc(var(--dc) * ${p.h} - ${g * 2}px)`;
      p.el.style.transform = `translate(calc(var(--dc) * ${p.c} + ${g}px), calc(var(--dc) * ${p.r} + ${g}px))`;
    }
    function apply(state) {
      const target = parse(state);
      const free = ps.slice();
      const kindOf = (t) => (t.t === 'V' || t.t === 'H' ? 'D' : t.t);
      const rest = [];
      // primeiro, peças que não mudaram de lugar
      for (const t of target) {
        const i = free.findIndex((p) => p.k === kindOf(t) && p.r === t.r && p.c === t.c && p.w === t.w);
        if (i >= 0) free.splice(i, 1); else rest.push(t);
      }
      for (const t of rest) {
        let bi = -1, bd = Infinity;
        free.forEach((p, i) => { if (p.k !== kindOf(t)) return; const d = Math.abs(p.r - t.r) + Math.abs(p.c - t.c); if (d < bd) { bd = d; bi = i; } });
        const p = free.splice(bi, 1)[0];
        Object.assign(p, { r: t.r, c: t.c, w: t.w, h: t.h });
        draw(p);
      }
    }
    function tick() {
      if (idx < DEMO.length) {
        apply(DEMO[idx++]);
        timer = setTimeout(tick, idx === 1 ? 1200 : 650);
      } else {
        const b = ps[0];
        b.el.classList.add('out');
        b.r += 2.5; draw(b);
        timer = setTimeout(() => { b.el.classList.remove('out'); idx = 0; tick(); }, 1800);
      }
    }
    return {
      start() { if (!timer && DEMO.length) { idx = 0; tick(); } },
      stop() { clearTimeout(timer); timer = 0; },
    };
  })();

  function showResult({ won, grade, opt, record }) {
    if (status !== 'won' && status !== 'failed') return;
    const b = save.best[levelIdx];
    const gradeHtml = grade ? `<div class="grade ${grade[0]}">${grade[0]}</div><div class="note">${grade[2]}</div>` : '';
    const title = won ? (mode === 'learn' ? 'Solução concluída' : moves <= opt ? 'Perfeito!' : 'Resolvido!') : 'Tempo esgotado';
    const extra = !won ? 'Use o modo Aprender para ver a solução passo a passo.'
      : assisted ? 'Resolvido com ajuda: não conta como recorde.'
      : moves <= opt ? 'Você usou o número mínimo de movimentos.'
      : `O mínimo é ${opt} movimentos.${record ? ' Novo recorde pessoal!' : ''}`;
    openSheet(`
      <div class="result">
        <h2>${title}</h2>
        ${gradeHtml}
        <div class="stats">
          <div><b>${moves}</b><span>movimentos</span></div>
          <div><b>${opt}</b><span>mínimo</span></div>
          <div><b>${fmt(won ? tElapsed : timeLimit)}</b><span>${mode === 'challenge' ? 'de ' + fmt(timeLimit) : 'tempo'}</span></div>
        </div>
        <p class="note">${extra}${b && !assisted && won ? `<br>Melhor: ${b.moves} mov. · ${fmt(b.time)}` : ''}</p>
        <div class="btn-row">
          ${won ? '<button class="btn" data-act="retry">↺ Repetir</button><button class="btn primary" data-act="next">Próximo ▶</button>'
            : '<button class="btn" data-act="learn">Aprender</button><button class="btn primary" data-act="retry">Tentar de novo</button>'}
        </div>
      </div>`);
  }

  // ---------------- visor ----------------
  function fmt(t) {
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  let bootUntil = performance.now() + 900;
  function frame(now) {
    // relógio do Desafio
    if (status === 'playing' && mode === 'challenge') {
      const left = timeLimit - elapsed();
      const sec = Math.ceil(left);
      if (sec <= 5 && sec > 0 && sec !== lastCountdownSec) { lastCountdownSec = sec; Sfx.tick(); }
      if (left <= 0) fail();
    }

    const C = window.Display.COLOR;
    lcd.clear();
    if (now < bootUntil) {
      // animação de ligar: varredura
      const k = (now - (bootUntil - 900)) / 900;
      const x = Math.floor(k * 70);
      for (let y = 0; y < 24; y++) for (let i = 0; i < 6; i++) lcd.px(x - i, y, i ? '#ff8a2a' + (99 - i * 15) : '#ffffff');
      lcd.text('DESLIZA', 18, 10, '#ffffffaa');
    } else {
      const blinkOn = Math.floor(now / 350) % 2 === 0;
      lcd.board(pieces, 1, 1, {
        blink: hint && blinkOn ? hint.p : null,
        ghost: hint ? { r: hint.r, c: hint.c, w: hint.p.w, h: hint.p.h } : null,
        exitColor: status === 'won' ? (blinkOn ? '#7dffa8' : '#7dffa844') : undefined,
      });
      const X = 21;
      if (lcdMsg) {
        lcdMsg.lines.forEach(([txt, col], i) => lcd.text(txt, X, 1 + i * 8, col || C.text));
      } else {
        lcd.text(MODES[mode].lcd, X, 1, mode === 'challenge' ? '#ffb067' : mode === 'learn' ? '#7fe9dc' : C.text);
        lcd.text(TIERS[tierOf(levelIdx)].lcd + ' ' + String(numInTier(levelIdx)).padStart(3, '0'), X, 9);
        let l3, col = C.text;
        const mv = 'M' + String(moves).padStart(3, '0');
        if (mode === 'challenge') {
          const left = status === 'ready' ? timeLimit : timeLimit - elapsed();
          l3 = mv + ' ' + fmt(Math.ceil(left));
          if (status === 'playing' && left <= 5 && !blinkOn) col = C.warn;
        } else if (mode === 'learn') {
          l3 = hint ? 'FALTAM ' + hint.remaining : analyzer && analyzer.done ? mv : 'CALCULA';
        } else {
          l3 = mv + ' ' + fmt(elapsed());
        }
        lcd.text(l3, X, 17, col);
      }
    }
    lcd.flush();
    requestAnimationFrame(frame);
  }

  // ---------------- utilidades ----------------
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 1400);
  }

  // ---------------- início ----------------
  new ResizeObserver(layout).observe(areaEl);
  layout();
  requestAnimationFrame(frame);
  demo.start();
  setTimeout(() => {
    loadLevel(levelIdx, { announce: false });
    booted = true;
    renderHome();
  }, 250);
  document.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // exposto para testes no console
  window.__desliza = { loadLevel, setMode, stateString, autoStep, get status() { return status; }, get moves() { return moves; } };
})();
