# Desliza

Quebra-cabeça de blocos deslizantes (família Klotski / Huarong Dao) num console portátil virtual, feito primeiro para celular.
É HTML, CSS e JavaScript puros, sem dependências e sem build.

## Rodar

```bash
python3 -m http.server 8000      # ou qualquer servidor estático
# abra http://localhost:8000 (no celular: http://IP-do-computador:8000)
```

Também abre direto pelo `index.html`. Nesse caso o modo offline (service worker) não é ativado.

## Publicar (GitHub + Vercel)

1. Crie um repositório no GitHub e envie esta pasta:
   ```bash
   git init && git add . && git commit -m "Desliza v1.0"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/desliza.git
   git push -u origin main
   ```
2. Na Vercel, clique em **Add New → Project**, importe o repositório e escolha **Framework Preset: Other**.
   Não há comando de build nem pasta de saída: o site é estático.
3. Com o endereço `https://….vercel.app` no ar, abra no celular e use **Adicionar à tela inicial**.
   Depois da primeira visita, o jogo funciona offline.

`vercel.json` só garante que o `sw.js` nunca fique em cache. Assim, cada atualização chega aos jogadores na visita seguinte.

## Regras e modos

- Tabuleiro 4×5 com 10 peças: 1 bloco 2×2, 5 peças 1×2 (verticais ou horizontais) e 4 peças 1×1, deixando 2 casas vazias.
- Objetivo: levar o bloco 2×2 até a abertura no centro da borda inferior.
- Movimento: mover uma peça qualquer distância conta como 1 movimento, mesmo virando esquina ou movendo a mesma peça várias vezes seguidas.
- **Livre**: sem limite de tempo.
- **Aprender** (segure ◀): mostra o próximo passo da solução ótima. ▶ executa e ◀ volta.
- **Desafio** (segure ▶): limite de `5 + 2 × mínimo` segundos. A nota vai de S a E pela fração do tempo usada.
- Teclas: ◀/▶ trocam de fase · ↶ desfaz (segure: reinicia) · ● menu · ◀+▶ segurados: som.
- Teclado (desktop): ←/→, Z, R, L, C, M, Esc.

## Fases e dificuldades

São 400 fases em 4 dificuldades, escolhidas pelo número mínimo de movimentos da solução:

| Dificuldade | Fases | Solução mínima |
|---|---|---|
| Fácil | 100 | 12–30 movimentos |
| Médio | 100 | 31–55 |
| Difícil | 100 | 56–85 |
| Ultra | 100 | 86–138 |

`js/levels.js` é gerado por `tools/gen-levels.mjs`. O script enumera as 363.480 disposições possíveis das peças,
calcula a solução ótima de cada uma e escolhe as fases com filtros anti-repetição:
- nenhuma fase é espelho de outra;
- nenhuma fase está no caminho de solução de outra, nem a até 2 movimentos do início de outra;
- toda fase difere em pelo menos 7 das 20 casas de qualquer outra, comparando também com o espelho.

```bash
node tools/gen-levels.mjs 2026   # semente
```

As faixas, quantidades e filtros ficam no topo do script (`TIERS`, `MIN_DIFF`, `BLOCK_RADIUS`).

## Estrutura

| Arquivo | Função |
|---|---|
| `js/solver.js` | regras, vizinhança e solucionador incremental (usado pelo jogo e pelo gerador) |
| `js/game.js` | estado da partida, arrasto, modos, teclas, tela inicial, menus |
| `js/display.js` | visor de matriz de pontos 64×24 com fonte própria |
| `js/audio.js` | efeitos sonoros sintetizados (WebAudio) |
| `sw.js`, `manifest.webmanifest` | instalação como app e uso offline |

O progresso fica só no `localStorage` do aparelho. Nenhum dado pessoal é coletado.
