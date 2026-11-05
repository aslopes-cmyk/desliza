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
  const I = window.I18N;
  let T = I.s; // textos do idioma atual
  let MODES = { free: {}, learn: {}, challenge: {} }; // nomes preenchidos por applyLang()
  const GRADES = [['S', 0.5], ['A', 0.65], ['B', 0.8], ['C', 0.9], ['D', 1]];

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

  // ---------------- idioma ----------------
  function applyLang() {
    I.set(save.lang);
    T = I.s;
    MODES = T.modes;
    TIERS.forEach((t, k) => Object.assign(t, T.tiers[k]));
    I.applyStatic();
  }
  applyLang();

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
  let startPieces = null;

  function layout() {
    const wall = Math.max(8, Math.round(Math.min(areaEl.clientWidth, areaEl.clientHeight * 0.8) * 0.03));
    const availW = areaEl.clientWidth - wall * 2;
    const st = areaEl.querySelector('.status');
    const stH = st && st.offsetHeight ? st.offsetHeight + 10 : 0;
    const availH = areaEl.clientHeight - stH - wall * 2;
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
    if (opts.announce !== false && tierOf(levelIdx) !== prevTier && booted) toast(T.toastDiff(TIERS[tierOf(levelIdx)].name));
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
    frameEl.classList.remove('exiting');
    // se o bloco grande saiu pela abertura, ele reaparece no lugar novo em vez de voltar voando
    if (big.el.classList.contains('escape')) {
      big.el.classList.remove('escape', 'celebrate');
      big.el.style.transition = 'none';
      big.el.style.opacity = '0';
      place(big, false);
      void big.el.offsetWidth;
      big.el.style.transition = '';
    }
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
    if (!analyzer || !analyzer.done) { toast(T.toastSolving); return; }
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
    return ['E', Infinity];
  }

  function win() {
    tElapsed = elapsed();
    status = 'won';
    clearHint();
    boardEl.classList.add('won', 'locked');
    Sfx.win();
    if (save.haptics && navigator.vibrate) navigator.vibrate([20, 40, 20, 40, 60]);
    // o bloco grande pulsa, a saída acende e ele desce pela abertura
    const wonIdx = levelIdx;
    frameEl.classList.add('exiting');
    big.el.classList.add('celebrate');
    setTimeout(() => {
      if (status !== 'won' || levelIdx !== wonIdx) return;
      big.el.classList.remove('celebrate');
      big.el.classList.add('escape');
      const wall = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wall')) || 12;
      big.el.style.transform = `translate(${big.c * cell + gap}px, ${5 * cell + wall + 8}px)`;
    }, 520);

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
        [T.lcdSolved, window.Display.COLOR.good],
        [grade ? T.lcdGrade + ' ' + grade[0] : moves <= opt ? T.lcdPerfect : T.lcdMin + ' ' + opt],
        ['M' + String(moves).padStart(3, '0') + ' ' + fmt(tElapsed)],
      ],
    };
    if (mode === 'challenge') {
      setTimeout(() => showResult({ won: true, grade, opt, record }), 1400);
    } else {
      // Livre e Aprender: depois da saída, a próxima fase se monta sozinha
      const msg = mode === 'learn' ? T.winLearn
        : moves <= opt ? T.winPerfect(moves)
        : T.winDone(moves, opt, record);
      setTimeout(() => { if (status === 'won' && levelIdx === wonIdx) toast(msg); }, 1250);
      setTimeout(() => { if (status === 'won' && levelIdx === wonIdx) loadLevel(levelIdx + 1); }, 2300);
    }
  }

  function fail() {
    tElapsed = timeLimit;
    status = 'failed';
    clearHint();
    boardEl.classList.add('failed', 'locked');
    Sfx.fail();
    if (save.haptics && navigator.vibrate) navigator.vibrate([80, 60, 80]);
    lcdMsg = { lines: [[T.lcdTime, window.Display.COLOR.warn], [T.lcdGrade + ' E', window.Display.COLOR.warn], ['M' + String(moves).padStart(3, '0')]] };
    setTimeout(() => showResult({ won: false, grade: ['E', 0], opt: optimal() }), 700);
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
    if (!opts.silent) toast(T.toastMode(MODES[m].name));
    updateTip();
  }

  function updateTip() {
    const t = $('#tip');
    if (mode === 'learn') t.textContent = T.tipLearn;
    else if (mode === 'challenge') t.textContent = T.tipChallenge(fmt(timeLimit));
    else t.textContent = T.tipFree(levelName(levelIdx), optimal());
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
  bindKey('kUndo', { tap: undo, hold: () => { restart(); toast(T.toastRestart); } });
  bindKey('kMenu', { tap: openMenu });
  $('#screen').addEventListener('click', () => { Sfx.unlock(); openLevels(); });
  $('#mute').addEventListener('click', () => { Sfx.unlock(); toggleSound(); });

  function toggleSound() {
    save.sound = Sfx.enabled = !save.sound;
    persist();
    $('#mute').classList.toggle('off', !save.sound);
    $('#hSound').classList.toggle('off', !save.sound);
    toast(save.sound ? T.toastSoundOn : T.toastSoundOff);
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
  let onSheetClose = null, sheetOpenedAt = 0;
  // no celular, o toque que abre a folha gera um "click" sintético logo depois;
  // ele cairia no fundo escuro e fecharia a folha na hora. Ignora cliques recentes.
  const ghostClick = () => performance.now() - sheetOpenedAt < 450;
  function openSheet(html, onClose) {
    sheetBody.innerHTML = html;
    sheetOpenedAt = performance.now();
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
  backdrop.addEventListener('click', () => { if (!ghostClick()) closeSheet(); });
  sheetBody.addEventListener('click', (e) => {
    if (ghostClick()) return;
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
    diff: (t) => { onSheetClose = null; closeSheet(); selectTier(+t); toast(T.toastDiff(TIERS[+t].name)); },
    lang: () => openLang(),
    mail: () => {
      // endereço montado só no clique, para não ficar legível no código da página
      const to = ['4slop3s', 'gmail.com'].join('@');
      const info = `v1.0 · ${I.lang} · ${levelName(levelIdx)}`;
      location.href = `mailto:${to}?subject=${encodeURIComponent(T.mailSubject)}&body=${encodeURIComponent(T.mailBody(info))}`;
    },
    setlang: (l) => { setLang(l); openMenu(); },
    next: () => { onSheetClose = null; closeSheet(); loadLevel(levelIdx + 1); },
    retry: () => { onSheetClose = null; closeSheet(); loadLevel(levelIdx); },
    learn: () => { onSheetClose = null; closeSheet(); loadLevel(levelIdx); setMode('learn'); },
    haptics: () => { save.haptics = !save.haptics; persist(); openMenu(); },
    reset: () => {
      if (!confirm(T.confirmReset)) return;
      save.best = {}; persist(); closeSheet(); loadLevel(0); toast(T.toastReset);
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
      <h2>${T.menu}</h2>
      <h3>${T.difficulty}</h3>
      <div class="seg seg4">${TIERS.map((t, k) => {
        let n = 0; for (let i = t.from; i < t.from + t.count; i++) if (save.best[i]) n++;
        return `<button data-act="diff:${k}" class="${k === tierOf(levelIdx) ? 'on' : ''}">${t.name}<small>${LEVELS[t.from][1]}–${LEVELS[t.from + t.count - 1][1]} ${T.movShort} · ${n}/${t.count}</small></button>`;
      }).join('')}</div>
      <h3>${T.gameMode}</h3>
      <div class="seg">${m}</div>
      <div class="list-btns">
        <button class="btn" data-act="levels">▦ ${T.levels} <span class="note">· ${T.solvedOf(solvedCount(), NL)}</span></button>
        <button class="btn" data-act="home">⌂ ${T.homeScreen}</button>
        <button class="btn" data-act="help">? ${T.howTo}</button>
        <button class="btn" data-act="about">i ${T.about}</button>
        <button class="btn" data-act="lang">◍ ${T.language} <span class="note">· ${T.langName}</span></button>
        <button class="btn" data-act="haptics">${save.haptics ? '✓' : '○'} ${T.haptics}</button>
        <button class="btn" data-act="reset">↺ ${T.resetProgress}</button>
      </div>
      <div class="btn-row"><button class="btn primary" data-act="close">${T.backToGame}</button></div>`);
  }

  function openLang() {
    openSheet(`
      <h2>${T.language}</h2>
      <div class="list-btns">${I.LANGS.map((l) =>
        `<button class="btn${l === I.lang ? ' primary' : ''}" data-act="setlang:${l}">${l === I.lang ? '✓ ' : ''}${I.name(l)}</button>`).join('')}</div>
      <div class="btn-row"><button class="btn" data-act="close">${T.close}</button></div>`);
  }

  function setLang(l) {
    save.lang = l;
    persist();
    applyLang();
    updateTip();
    renderHome();
  }

  function openLevels(tier) {
    if (tier === undefined) tier = tierOf(levelIdx);
    const tabs = TIERS.map((tr, t) => {
      let n = 0;
      for (let i = tr.from; i < tr.from + tr.count; i++) if (save.best[i]) n++;
      return `<button data-act="tier:${t}" class="${t === tier ? 'on' : ''}">${tr.name}<span>${n}/${tr.count}</span></button>`;
    }).join('');
    let cells = '';
    const TR = TIERS[tier];
    for (let i = TR.from; i < TR.from + TR.count; i++) {
      const b = save.best[i];
      const cls = [b ? 'solved' : '', b && b.moves <= LEVELS[i][1] ? 'perfect' : '', i === levelIdx ? 'current' : ''].join(' ');
      cells += `<button data-act="goto:${i}" class="${cls}" aria-label="${T.levelAria(levelName(i), LEVELS[i][1])}">${i - TR.from + 1}${b && b.grade ? `<em>${b.grade}</em>` : ''}</button>`;
    }
    openSheet(`
      <h2>${T.levels}</h2>
      <div class="tier-tabs">${tabs}</div>
      <p class="note">${T.tierRange(TR.name, LEVELS[TR.from][1], LEVELS[TR.from + TR.count - 1][1])}</p>
      <div class="levels">${cells}</div>
      <p class="note">${T.levelsLegend}</p>`);
  }

  function openHelp(first) {
    const tiers = TIERS.map((t) => ({ name: t.name, count: t.count, lo: LEVELS[t.from][1], hi: LEVELS[t.from + t.count - 1][1] }));
    openSheet(`${T.helpHtml(tiers)}
      <div class="btn-row"><button class="btn primary" data-act="close">${first ? T.start : T.gotIt}</button></div>`,
    first ? () => { save.seenHelp = true; persist(); } : null);
  }

  function openAbout() {
    openSheet(`${T.aboutHtml(NL, I.num(363480))}
      <h3>${T.contactTitle}</h3>
      <p>${T.contactText}</p>
      <div class="btn-row"><button class="btn" data-act="close">${T.close}</button><button class="btn primary" data-act="mail">${T.contactBtn}</button></div>
      <p class="note about-foot">v1.0 · <a class="about-link" href="https://github.com/aslopes-cmyk/desliza" target="_blank" rel="noopener">${T.codeLink} ↗</a></p>`);
  }

  // ---------------- tela inicial ----------------
  const homeEl = $('#home');
  let homeOpen = true;

  function renderHome() {
    const cur = tierOf(levelIdx);
    $('#hDiff').innerHTML = TIERS.map((t, k) => {
      let n = 0;
      for (let i = t.from; i < t.from + t.count; i++) if (save.best[i]) n++;
      return `<button data-tier="${k}" class="${k === cur ? 'on' : ''}"><b>${t.name}</b><small>${LEVELS[t.from][1]}–${LEVELS[t.from + t.count - 1][1]} ${T.movShort}</small><span class="bar"><span style="width:${(100 * n) / t.count}%"></span></span><small>${n}/${t.count}</small></button>`;
    }).join('');
    $('#hMode').innerHTML = Object.entries(MODES).map(([k, v]) =>
      `<button data-mode="${k}" class="${k === mode ? 'on' : ''}">${v.name}<small>${v.desc}</small></button>`).join('');
    const started = status === 'playing' && moves > 0;
    $('#hPlayT').textContent = started ? T.continue : T.play;
    $('#hPlayS').textContent = `${levelName(levelIdx)} · ${MODES[mode].name}`;
    $('#hSound').classList.toggle('off', !save.sound);
    $('#hLang').innerHTML = I.LANGS.map((l) => `<button data-lang="${l}" class="${l === I.lang ? 'on' : ''}" aria-label="${I.name(l)}">${l.toUpperCase()}</button>`).join('');
  }
  $('#hLang').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    Sfx.unlock(); Sfx.key();
    setLang(b.dataset.lang);
  });

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
    const gradeHtml = grade ? `<div class="grade ${grade[0]}">${grade[0]}</div><div class="note">${T.grades[grade[0]]}</div>` : '';
    const title = won ? (mode === 'learn' ? T.winLearn : moves <= opt ? T.perfect : T.solved) : T.timeUp;
    const extra = !won ? T.resFail
      : assisted ? T.resAssisted
      : moves <= opt ? T.resPerfect
      : T.resMin(opt, record);
    openSheet(`
      <div class="result">
        <h2>${title}</h2>
        ${gradeHtml}
        <div class="stats">
          <div><b>${moves}</b><span>${T.statMoves}</span></div>
          <div><b>${opt}</b><span>${T.statMin}</span></div>
          <div><b>${fmt(won ? tElapsed : timeLimit)}</b><span>${mode === 'challenge' ? T.statOf(fmt(timeLimit)) : T.statTime}</span></div>
        </div>
        <p class="note">${extra}${b && !assisted && won ? '<br>' + T.best(b.moves, fmt(b.time)) : ''}</p>
        <div class="btn-row">
          ${won ? `<button class="btn" data-act="retry">${T.retry}</button><button class="btn primary" data-act="next">${T.next}</button>`
            : `<button class="btn" data-act="learn">${T.learnBtn}</button><button class="btn primary" data-act="retry">${T.tryAgain}</button>`}
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
      // miniatura fixa: mostra a posição inicial da fase como referência (como no aparelho)
      if (!startPieces || startPieces.idx !== levelIdx) {
        startPieces = parse(LEVELS[levelIdx][0]);
        startPieces.idx = levelIdx;
      }
      lcd.board(startPieces, 1, 1, {
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
          l3 = hint ? T.lcdLeft + ' ' + hint.remaining : analyzer && analyzer.done ? mv : T.lcdSolving;
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
