/* Desliza — textos da interface em português, inglês e espanhol.
   O idioma segue o do aparelho (navigator.languages); o jogador pode trocar no menu.
   Idioma sem tradução cai no inglês. Textos do visor (lcd*) usam só A–Z, 0–9 e ! ? : . - */
(function () {
  'use strict';

  const STR = {
    pt: {
      langName: 'Português',
      // tela inicial
      subtitle: 'o quebra-cabeça de blocos deslizantes',
      play: 'JOGAR', continue: 'CONTINUAR',
      difficulty: 'Dificuldade', mode: 'Modo',
      levels: 'Fases', howTo: 'Como jogar', about: 'Sobre', sound: 'Som', language: 'Idioma',
      homeFoot: 'v1.0 · por Aglisson Lopes',
      movShort: 'mov',
      // aparelho
      kPrev: 'ANT', kPrevHold: 'segure: aprender', kPrevAria: 'Fase anterior. Segure para o modo Aprender',
      kNext: 'PRÓX', kNextHold: 'segure: desafio', kNextAria: 'Próxima fase. Segure para o modo Desafio',
      kUndo: 'VOLTA', kUndoHold: 'segure: reiniciar', kUndoAria: 'Desfazer. Segure para reiniciar',
      kMenu: 'MENU', screenTitle: 'Toque para ver as fases', lcdAria: 'Visor',
      tipStart: 'Leve o bloco laranja até a saída',
      // modos e dificuldades
      modes: {
        free: { name: 'Livre', lcd: 'LIVRE', desc: 'sem tempo' },
        learn: { name: 'Aprender', lcd: 'APRENDER', desc: 'passo a passo' },
        challenge: { name: 'Desafio', lcd: 'DESAFIO', desc: 'contra o relógio' },
      },
      tiers: [{ name: 'Fácil', lcd: 'FACIL' }, { name: 'Médio', lcd: 'MEDIO' }, { name: 'Difícil', lcd: 'DIFICIL' }, { name: 'Ultra', lcd: 'ULTRA' }],
      grades: { S: 'Super', A: 'Elite', B: 'Mestre', C: 'Intermediário', D: 'Iniciante', E: 'Falhou' },
      // dicas e avisos
      tipLearn: '▶ executa o próximo passo · ◀ volta',
      tipChallenge: (lim) => `Limite: ${lim} · nota S a E`,
      tipFree: (lvl, opt) => `${lvl} · mínimo de ${opt} movimentos`,
      toastDiff: (n) => 'Dificuldade: ' + n,
      toastMode: (n) => 'Modo ' + n,
      toastRestart: 'Reiniciado',
      toastSoundOn: 'Som ligado', toastSoundOff: 'Som desligado',
      toastSolving: 'Calculando solução…',
      toastReset: 'Progresso apagado',
      winLearn: 'Solução concluída',
      winPerfect: (m) => `Perfeito! ${m} movimentos`,
      winDone: (m, opt, rec) => `Resolvido em ${m} · mínimo ${opt}${rec ? ' · recorde!' : ''}`,
      confirmReset: 'Apagar todo o progresso salvo neste aparelho?',
      // visor
      lcdSolved: 'RESOLVIDO!', lcdGrade: 'NOTA', lcdPerfect: 'PERFEITO', lcdMin: 'MIN', lcdTime: 'TEMPO!',
      lcdLeft: 'FALTAM', lcdSolving: 'CALCULA',
      // menu
      menu: 'Menu', gameMode: 'Modo de jogo', solvedOf: (a, b) => `${a}/${b} resolvidos`,
      homeScreen: 'Tela inicial', haptics: 'Vibração ao mover', resetProgress: 'Apagar progresso', backToGame: 'Voltar ao jogo',
      // fases
      levelAria: (name, opt) => `${name}, ${opt} movimentos`,
      tierRange: (n, a, b) => `${n}: soluções de ${a} a ${b} movimentos.`,
      levelsLegend: 'Verde: resolvido · verde forte: no mínimo de movimentos · letra: melhor nota no Desafio.',
      // resultado
      solved: 'Resolvido!', perfect: 'Perfeito!', timeUp: 'Tempo esgotado',
      resFail: 'Use o modo Aprender para ver a solução passo a passo.',
      resAssisted: 'Resolvido com ajuda: não conta como recorde.',
      resPerfect: 'Você usou o número mínimo de movimentos.',
      resMin: (opt, rec) => `O mínimo é ${opt} movimentos.${rec ? ' Novo recorde pessoal!' : ''}`,
      statMoves: 'movimentos', statMin: 'mínimo', statTime: 'tempo', statOf: (t) => 'de ' + t,
      best: (m, t) => `Melhor: ${m} mov. · ${t}`,
      retry: '↺ Repetir', next: 'Próximo ▶', learnBtn: 'Aprender', tryAgain: 'Tentar de novo',
      // botões gerais
      start: 'Começar', gotIt: 'Entendi', close: 'Fechar',
      // como jogar
      helpHtml: (tiers) => `
        <h2>Como jogar</h2>
        <p><b>Objetivo:</b> deslize as peças até levar o <b style="color:var(--big)">bloco laranja</b> à abertura no centro da borda de baixo.</p>
        <p>Arraste uma peça com o dedo. Ela só anda por casas vazias, e pode virar a esquina no mesmo gesto. Mover a mesma peça várias vezes seguidas conta como <b>um</b> movimento.</p>
        <h3>Modos</h3>
        <ul>
          <li><b>Livre</b>: sem limite de tempo. O visor mostra movimentos e tempo, e a miniatura à esquerda guarda a posição inicial da fase como referência.</li>
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
        <ul>${tiers.map((t) => `<li><b>${t.name}</b>: ${t.count} fases, soluções de ${t.lo} a ${t.hi} movimentos.</li>`).join('')}</ul>
        <p class="note">Não há fases repetidas nem espelhadas, e nenhuma fase é um trecho da solução de outra. O cronômetro começa no primeiro movimento.</p>`,
      // sobre
      aboutHtml: (nl, states) => `
        <h2>Sobre o Desliza</h2>
        <p><b>Desliza</b> é um quebra-cabeça de blocos deslizantes para jogar no celular. A regra cabe numa frase: mova as peças pelo tabuleiro até o bloco laranja escapar pela abertura de baixo.</p>
        <p>Inspirado em clássicos como o <b>Klotski</b> e o chinês <b>Huarong Dao</b>. Nome, visual e fases são originais. As ${nl} fases foram escolhidas por um programa que analisou todas as ${states} posições possíveis e calculou a solução mínima de cada uma.</p>
        <p>Projeto pessoal de <b>Aglisson Lopes</b>, feito com apoio de IA (Claude, da Anthropic).</p>
        <p class="note">Seu progresso fica salvo só neste aparelho. O jogo não coleta dados pessoais nem exibe anúncios.</p>`,
      aboutLevels: (n) => `${n} fases`,
      contactTitle: 'Fale comigo',
      contactText: 'Achou um erro ou tem uma sugestão? Escreva para mim.',
      contactBtn: '✉ Enviar sugestão', codeLink: 'Código no GitHub',
      mailSubject: 'Desliza: sugestão', mailBody: (info) => `\n\n\n---\n${info}`,
    },

    en: {
      langName: 'English',
      subtitle: 'the sliding block puzzle',
      play: 'PLAY', continue: 'CONTINUE',
      difficulty: 'Difficulty', mode: 'Mode',
      levels: 'Levels', howTo: 'How to play', about: 'About', sound: 'Sound', language: 'Language',
      homeFoot: 'v1.0 · by Aglisson Lopes',
      movShort: 'moves',
      kPrev: 'PREV', kPrevHold: 'hold: learn', kPrevAria: 'Previous level. Hold for Learn mode',
      kNext: 'NEXT', kNextHold: 'hold: challenge', kNextAria: 'Next level. Hold for Challenge mode',
      kUndo: 'UNDO', kUndoHold: 'hold: restart', kUndoAria: 'Undo. Hold to restart',
      kMenu: 'MENU', screenTitle: 'Tap to see the levels', lcdAria: 'Display',
      tipStart: 'Get the orange block to the exit',
      modes: {
        free: { name: 'Free', lcd: 'FREE', desc: 'no timer' },
        learn: { name: 'Learn', lcd: 'LEARN', desc: 'step by step' },
        challenge: { name: 'Challenge', lcd: 'CHALLENGE', desc: 'beat the clock' },
      },
      tiers: [{ name: 'Easy', lcd: 'EASY' }, { name: 'Medium', lcd: 'MEDIUM' }, { name: 'Hard', lcd: 'HARD' }, { name: 'Ultra', lcd: 'ULTRA' }],
      grades: { S: 'Super', A: 'Elite', B: 'Master', C: 'Intermediate', D: 'Beginner', E: 'Failed' },
      tipLearn: '▶ plays the next step · ◀ goes back',
      tipChallenge: (lim) => `Limit: ${lim} · grade S to E`,
      tipFree: (lvl, opt) => `${lvl} · minimum ${opt} moves`,
      toastDiff: (n) => 'Difficulty: ' + n,
      toastMode: (n) => n + ' mode',
      toastRestart: 'Restarted',
      toastSoundOn: 'Sound on', toastSoundOff: 'Sound off',
      toastSolving: 'Working out the solution…',
      toastReset: 'Progress erased',
      winLearn: 'Solution complete',
      winPerfect: (m) => `Perfect! ${m} moves`,
      winDone: (m, opt, rec) => `Solved in ${m} · minimum ${opt}${rec ? ' · new best!' : ''}`,
      confirmReset: 'Erase all progress saved on this device?',
      lcdSolved: 'SOLVED!', lcdGrade: 'GRADE', lcdPerfect: 'PERFECT', lcdMin: 'MIN', lcdTime: 'TIME UP!',
      lcdLeft: 'LEFT', lcdSolving: 'SOLVING',
      menu: 'Menu', gameMode: 'Game mode', solvedOf: (a, b) => `${a}/${b} solved`,
      homeScreen: 'Home screen', haptics: 'Vibrate on move', resetProgress: 'Erase progress', backToGame: 'Back to game',
      levelAria: (name, opt) => `${name}, ${opt} moves`,
      tierRange: (n, a, b) => `${n}: solutions from ${a} to ${b} moves.`,
      levelsLegend: 'Green: solved · bright green: in the minimum number of moves · letter: best Challenge grade.',
      solved: 'Solved!', perfect: 'Perfect!', timeUp: "Time's up",
      resFail: 'Use Learn mode to see the solution step by step.',
      resAssisted: 'Solved with help: does not count as a record.',
      resPerfect: 'You used the minimum number of moves.',
      resMin: (opt, rec) => `The minimum is ${opt} moves.${rec ? ' New personal best!' : ''}`,
      statMoves: 'moves', statMin: 'minimum', statTime: 'time', statOf: (t) => 'of ' + t,
      best: (m, t) => `Best: ${m} moves · ${t}`,
      retry: '↺ Retry', next: 'Next ▶', learnBtn: 'Learn', tryAgain: 'Try again',
      start: 'Start', gotIt: 'Got it', close: 'Close',
      helpHtml: (tiers) => `
        <h2>How to play</h2>
        <p><b>Goal:</b> slide the pieces until the <b style="color:var(--big)">orange block</b> reaches the opening in the middle of the bottom edge.</p>
        <p>Drag a piece with your finger. It only moves into empty squares, and it can turn a corner in the same gesture. Moving the same piece several times in a row counts as <b>one</b> move.</p>
        <h3>Modes</h3>
        <ul>
          <li><b>Free</b>: no time limit. The display shows moves and time, and the thumbnail on the left keeps the level's starting position for reference.</li>
          <li><b>Learn</b> (hold ◀): shows the next step of the optimal solution. ▶ plays the step and ◀ goes back one.</li>
          <li><b>Challenge</b> (hold ▶): solve it before time runs out. Grades go from <b>S</b> (super) to <b>E</b> (failed).</li>
        </ul>
        <h3>Buttons</h3>
        <ul>
          <li><b>◀ / ▶</b>: previous or next level. In Learn mode, they step back or forward.</li>
          <li><b>↶</b>: undoes the last move. Hold to restart the level.</li>
          <li><b>●</b>: menu, where you pick the difficulty. Tap the display to open the level list.</li>
          <li><b>◀ + ▶</b> held together: sound on or off.</li>
        </ul>
        <h3>Difficulties</h3>
        <ul>${tiers.map((t) => `<li><b>${t.name}</b>: ${t.count} levels, solutions from ${t.lo} to ${t.hi} moves.</li>`).join('')}</ul>
        <p class="note">No level is repeated or mirrored, and no level is part of another level's solution. The timer starts on your first move.</p>`,
      aboutHtml: (nl, states) => `
        <h2>About Desliza</h2>
        <p><b>Desliza</b> (Portuguese for "slide") is a sliding block puzzle made for your phone. The rule fits in one sentence: move the pieces around the board until the orange block escapes through the opening at the bottom.</p>
        <p>Inspired by classics such as <b>Klotski</b> and the Chinese <b>Huarong Dao</b>. The name, look and levels are original. The ${nl} levels were picked by a program that analyzed all ${states} possible positions and computed the shortest solution for each one.</p>
        <p>A personal project by <b>Aglisson Lopes</b>, built with AI assistance (Claude, by Anthropic).</p>
        <p class="note">Your progress is saved only on this device. The game collects no personal data and shows no ads.</p>`,
      aboutLevels: (n) => `${n} levels`,
      contactTitle: 'Get in touch',
      contactText: 'Found a bug or have a suggestion? Drop me a line.',
      contactBtn: '✉ Send feedback', codeLink: 'Code on GitHub',
      mailSubject: 'Desliza: feedback', mailBody: (info) => `\n\n\n---\n${info}`,
    },

    es: {
      langName: 'Español',
      subtitle: 'el rompecabezas de bloques deslizantes',
      play: 'JUGAR', continue: 'CONTINUAR',
      difficulty: 'Dificultad', mode: 'Modo',
      levels: 'Niveles', howTo: 'Cómo jugar', about: 'Acerca de', sound: 'Sonido', language: 'Idioma',
      homeFoot: 'v1.0 · por Aglisson Lopes',
      movShort: 'mov',
      kPrev: 'ANT', kPrevHold: 'mantén: aprender', kPrevAria: 'Nivel anterior. Mantén pulsado para el modo Aprender',
      kNext: 'SIG', kNextHold: 'mantén: desafío', kNextAria: 'Nivel siguiente. Mantén pulsado para el modo Desafío',
      kUndo: 'DESHACER', kUndoHold: 'mantén: reiniciar', kUndoAria: 'Deshacer. Mantén pulsado para reiniciar',
      kMenu: 'MENÚ', screenTitle: 'Toca para ver los niveles', lcdAria: 'Pantalla',
      tipStart: 'Lleva el bloque naranja hasta la salida',
      modes: {
        free: { name: 'Libre', lcd: 'LIBRE', desc: 'sin tiempo' },
        learn: { name: 'Aprender', lcd: 'APRENDER', desc: 'paso a paso' },
        challenge: { name: 'Desafío', lcd: 'DESAFIO', desc: 'contra reloj' },
      },
      tiers: [{ name: 'Fácil', lcd: 'FACIL' }, { name: 'Medio', lcd: 'MEDIO' }, { name: 'Difícil', lcd: 'DIFICIL' }, { name: 'Ultra', lcd: 'ULTRA' }],
      grades: { S: 'Súper', A: 'Élite', B: 'Maestro', C: 'Intermedio', D: 'Principiante', E: 'Fallido' },
      tipLearn: '▶ ejecuta el siguiente paso · ◀ vuelve',
      tipChallenge: (lim) => `Límite: ${lim} · nota S a E`,
      tipFree: (lvl, opt) => `${lvl} · mínimo de ${opt} movimientos`,
      toastDiff: (n) => 'Dificultad: ' + n,
      toastMode: (n) => 'Modo ' + n,
      toastRestart: 'Reiniciado',
      toastSoundOn: 'Sonido activado', toastSoundOff: 'Sonido desactivado',
      toastSolving: 'Calculando la solución…',
      toastReset: 'Progreso borrado',
      winLearn: 'Solución completada',
      winPerfect: (m) => `¡Perfecto! ${m} movimientos`,
      winDone: (m, opt, rec) => `Resuelto en ${m} · mínimo ${opt}${rec ? ' · ¡récord!' : ''}`,
      confirmReset: '¿Borrar todo el progreso guardado en este dispositivo?',
      lcdSolved: 'RESUELTO!', lcdGrade: 'NOTA', lcdPerfect: 'PERFECTO', lcdMin: 'MIN', lcdTime: 'TIEMPO!',
      lcdLeft: 'FALTAN', lcdSolving: 'CALCULA',
      menu: 'Menú', gameMode: 'Modo de juego', solvedOf: (a, b) => `${a}/${b} resueltos`,
      homeScreen: 'Pantalla de inicio', haptics: 'Vibrar al mover', resetProgress: 'Borrar progreso', backToGame: 'Volver al juego',
      levelAria: (name, opt) => `${name}, ${opt} movimientos`,
      tierRange: (n, a, b) => `${n}: soluciones de ${a} a ${b} movimientos.`,
      levelsLegend: 'Verde: resuelto · verde intenso: con el mínimo de movimientos · letra: mejor nota en Desafío.',
      solved: '¡Resuelto!', perfect: '¡Perfecto!', timeUp: 'Se acabó el tiempo',
      resFail: 'Usa el modo Aprender para ver la solución paso a paso.',
      resAssisted: 'Resuelto con ayuda: no cuenta como récord.',
      resPerfect: 'Usaste el número mínimo de movimientos.',
      resMin: (opt, rec) => `El mínimo es ${opt} movimientos.${rec ? ' ¡Nuevo récord personal!' : ''}`,
      statMoves: 'movimientos', statMin: 'mínimo', statTime: 'tiempo', statOf: (t) => 'de ' + t,
      best: (m, t) => `Mejor: ${m} mov. · ${t}`,
      retry: '↺ Repetir', next: 'Siguiente ▶', learnBtn: 'Aprender', tryAgain: 'Intentar de nuevo',
      start: 'Empezar', gotIt: 'Entendido', close: 'Cerrar',
      helpHtml: (tiers) => `
        <h2>Cómo jugar</h2>
        <p><b>Objetivo:</b> desliza las piezas hasta llevar el <b style="color:var(--big)">bloque naranja</b> a la abertura en el centro del borde inferior.</p>
        <p>Arrastra una pieza con el dedo. Solo avanza por casillas vacías y puede doblar la esquina en el mismo gesto. Mover la misma pieza varias veces seguidas cuenta como <b>un</b> movimiento.</p>
        <h3>Modos</h3>
        <ul>
          <li><b>Libre</b>: sin límite de tiempo. La pantalla muestra movimientos y tiempo, y la miniatura de la izquierda guarda la posición inicial del nivel como referencia.</li>
          <li><b>Aprender</b> (mantén ◀): muestra el siguiente paso de la solución óptima. ▶ ejecuta el paso y ◀ retrocede uno.</li>
          <li><b>Desafío</b> (mantén ▶): resuélvelo antes de que se acabe el tiempo. La nota va de <b>S</b> (súper) a <b>E</b> (fallido).</li>
        </ul>
        <h3>Botones</h3>
        <ul>
          <li><b>◀ / ▶</b>: nivel anterior o siguiente. En el modo Aprender, retroceden o avanzan un paso.</li>
          <li><b>↶</b>: deshace el último movimiento. Mantén pulsado para reiniciar el nivel.</li>
          <li><b>●</b>: menú, donde eliges la dificultad. Toca la pantalla para abrir la lista de niveles.</li>
          <li><b>◀ + ▶</b> pulsados a la vez: activan o desactivan el sonido.</li>
        </ul>
        <h3>Dificultades</h3>
        <ul>${tiers.map((t) => `<li><b>${t.name}</b>: ${t.count} niveles, soluciones de ${t.lo} a ${t.hi} movimientos.</li>`).join('')}</ul>
        <p class="note">No hay niveles repetidos ni reflejados, y ningún nivel es parte de la solución de otro. El cronómetro empieza con el primer movimiento.</p>`,
      aboutHtml: (nl, states) => `
        <h2>Acerca de Desliza</h2>
        <p><b>Desliza</b> es un rompecabezas de bloques deslizantes para jugar en el móvil. La regla cabe en una frase: mueve las piezas por el tablero hasta que el bloque naranja escape por la abertura de abajo.</p>
        <p>Inspirado en clásicos como el <b>Klotski</b> y el chino <b>Huarong Dao</b>. El nombre, el diseño y los niveles son originales. Los ${nl} niveles fueron elegidos por un programa que analizó las ${states} posiciones posibles y calculó la solución mínima de cada una.</p>
        <p>Proyecto personal de <b>Aglisson Lopes</b>, hecho con ayuda de IA (Claude, de Anthropic).</p>
        <p class="note">Tu progreso se guarda solo en este dispositivo. El juego no recoge datos personales ni muestra anuncios.</p>`,
      aboutLevels: (n) => `${n} niveles`,
      contactTitle: 'Contacto',
      contactText: '¿Encontraste un error o tienes una sugerencia? Escríbeme.',
      contactBtn: '✉ Enviar sugerencia', codeLink: 'Código en GitHub',
      mailSubject: 'Desliza: sugerencia', mailBody: (info) => `\n\n\n---\n${info}`,
    },
  };

  const LANGS = Object.keys(STR);
  const LOCALE = { pt: 'pt-BR', en: 'en', es: 'es' };

  function detect() {
    const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (const l of list) {
      const base = String(l).toLowerCase().slice(0, 2);
      if (STR[base]) return base;
    }
    return 'en';
  }

  const I18N = {
    LANGS,
    lang: 'en',
    get s() { return STR[this.lang]; },
    locale() { return LOCALE[this.lang]; },
    num(n) { return n.toLocaleString(LOCALE[this.lang]); },
    name(l) { return STR[l].langName; },
    set(l) { this.lang = STR[l] ? l : detect(); },
    detect,
    /** Aplica os textos fixos do HTML (data-i18n, data-i18n-aria, data-i18n-title). */
    applyStatic(root = document) {
      const s = this.s;
      root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = s[el.dataset.i18n]; });
      root.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', s[el.dataset.i18nAria]));
      root.querySelectorAll('[data-i18n-title]').forEach((el) => el.setAttribute('title', s[el.dataset.i18nTitle]));
      document.documentElement.lang = LOCALE[this.lang];
    },
  };
  window.I18N = I18N;
})();
