/* ================================================================
   PALPITIAR — Stats Engine v1.0
   Motor de análise estatística compartilhado por todas as páginas
   de relatório histórico.
   Uso: inclua este arquivo e chame StatsEngine.init(CFG)
   ================================================================ */
(function (global) {
  'use strict';

  /* ---- utilitários ---- */
  const fmt = (n, dec = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
  const fmtPct = (n) => (n * 100).toFixed(1) + '%';
  const pad2 = (n) => String(n).padStart(2, '0');
  const normDate = (s) => {
    if (!s) return '—';
    if (s.includes('/')) return s;
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---- extração de dezenas ---- */
  function getDz(draw, cfg) {
    return cfg.isDupla ? draw[2] : draw[2]; // sorteio principal
  }

  /* ================================================================
     COMPUTAÇÃO DE ESTATÍSTICAS
     ================================================================ */
  function computeStats(data, cfg) {
    const draws = data.draws || [];
    const N = draws.length;
    if (N === 0) return null;

    const { uMin, uMax, sorteadas, isDupla } = cfg;
    const range = uMax - uMin + 1;

    /* frequência acumulada */
    const freq = new Array(uMax + 1).fill(0);
    const somas = [];
    const paresArr = [];

    draws.forEach(d => {
      const dz = getDz(d, cfg);
      const soma = dz.reduce((a, b) => a + b, 0);
      somas.push(soma);
      paresArr.push(dz.filter(n => n % 2 === 0).length);
      dz.forEach(n => { if (n >= uMin && n <= uMax) freq[n]++; });
    });

    /* atraso atual */
    const lastSeen = new Array(uMax + 1).fill(-1);
    draws.forEach((d, idx) => getDz(d, cfg).forEach(n => { if (n >= uMin && n <= uMax) lastSeen[n] = idx; }));
    const atraso = new Array(uMax + 1).fill(0);
    for (let i = uMin; i <= uMax; i++) {
      atraso[i] = lastSeen[i] === -1 ? N : (N - 1 - lastSeen[i]);
    }

    /* ranking */
    const ranking = [];
    for (let i = uMin; i <= uMax; i++) ranking.push({ n: i, f: freq[i], a: atraso[i] });
    const byFreq = [...ranking].sort((a, b) => b.f - a.f);
    const quentes = byFreq.slice(0, 10);
    const frias = byFreq.slice(-10).reverse();

    /* soma stats */
    const somasSort = [...somas].sort((a, b) => a - b);
    const somaAvg = somas.reduce((a, b) => a + b, 0) / N;
    const somaStd = Math.sqrt(somas.reduce((s, v) => s + (v - somaAvg) ** 2, 0) / N);
    const somaMin = somasSort[0];
    const somaMax = somasSort[N - 1];
    const somaP10 = somasSort[Math.floor(N * 0.10)];
    const somaP25 = somasSort[Math.floor(N * 0.25)];
    const somaP75 = somasSort[Math.floor(N * 0.75)];
    const somaP90 = somasSort[Math.floor(N * 0.90)];

    /* histograma de soma */
    const BINS = 25;
    const binW = (somaMax - somaMin) / BINS || 1;
    const hist = new Array(BINS).fill(0);
    somas.forEach(s => {
      const b = clamp(Math.floor((s - somaMin) / binW), 0, BINS - 1);
      hist[b]++;
    });

    /* paridade */
    const pariDist = new Array(sorteadas + 1).fill(0);
    paresArr.forEach(p => { if (p >= 0 && p <= sorteadas) pariDist[p]++; });
    const paresAvg = paresArr.reduce((a, b) => a + b, 0) / N;

    /* distribuição por faixas */
    const gSize = cfg.groupSize;
    const nGroups = Math.ceil(range / gSize);
    const groupDist = new Array(nGroups).fill(0);
    draws.forEach(d => getDz(d, cfg).forEach(n => {
      const g = Math.floor((n - uMin) / gSize);
      if (g >= 0 && g < nGroups) groupDist[g]++;
    }));

    /* frequência recente (últimos 100) */
    const recentN = Math.min(100, N);
    const recentFreq = new Array(uMax + 1).fill(0);
    draws.slice(-recentN).forEach(d => getDz(d, cfg).forEach(n => {
      if (n >= uMin && n <= uMax) recentFreq[n]++;
    }));

    /* ganhadores */
    const winIdx = isDupla ? 4 : 3;
    const withWinners = draws.filter(d => (d[winIdx] || 0) > 0).length;

    /* streak de acumulação */
    let accStreak = 0;
    for (let i = N - 1; i >= 0; i--) {
      if ((draws[i][winIdx] || 0) === 0) accStreak++;
      else break;
    }

    /* números muito atrasados */
    const avgAtraso = ranking.reduce((s, x) => s + x.a, 0) / ranking.length;
    const atrasados = [...ranking].sort((a, b) => b.a - a.a).slice(0, 12);

    /* pares mais frequentes (apenas primeiros 5000 draws para performance) */
    const pairsMap = new Map();
    const maxForPairs = Math.min(N, 5000);
    draws.slice(-maxForPairs).forEach(d => {
      const dz = getDz(d, cfg).slice().sort((a, b) => a - b);
      for (let i = 0; i < dz.length; i++) {
        for (let j = i + 1; j < dz.length; j++) {
          const key = `${dz[i]}-${dz[j]}`;
          pairsMap.set(key, (pairsMap.get(key) || 0) + 1);
        }
      }
    });
    const topPairs = [...pairsMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => ({ pair: k.split('-').map(Number), count: v }));

    return {
      N, freq, atraso, ranking, byFreq,
      quentes, frias, atrasados, avgAtraso,
      somas, somaAvg, somaStd, somaMin, somaMax,
      somaP10, somaP25, somaP75, somaP90,
      hist, binW,
      pariDist, paresAvg,
      groupDist, nGroups, gSize,
      recentFreq, recentN,
      withWinners, accStreak, winIdx,
      topPairs,
      meta: data.meta || {},
      preStats: data.stats || {},
    };
  }

  /* ================================================================
     RENDERIZAÇÃO
     ================================================================ */

  /* -- cor de calor -- */
  function heatColor(v, accent) {
    // v: 0..1 → interpolate from cold to accent
    const cold = [30, 30, 40];
    const hot = accent;
    const r = Math.round(lerp(cold[0], hot[0], v));
    const g = Math.round(lerp(cold[1], hot[1], v));
    const b = Math.round(lerp(cold[2], hot[2], v));
    return `rgb(${r},${g},${b})`;
  }

  /* -- SVG bar chart horizontal -- */
  function svgHBar(items, maxVal, accentColor, labelW = 40) {
    const H = 28, gap = 8;
    const total = items.length;
    const svgH = total * (H + gap);
    const barMaxW = 320;

    let rects = items.map((item, i) => {
      const w = Math.max(4, (item.value / maxVal) * barMaxW);
      const y = i * (H + gap);
      const label = pad2(item.n);
      const pct = ((item.value / maxVal) * 100).toFixed(1);
      return `
        <text x="${labelW - 6}" y="${y + H * 0.68}" text-anchor="end" font-size="12" fill="var(--ink-dim)" font-family="var(--mono)">${label}</text>
        <rect x="${labelW}" y="${y}" width="${w}" height="${H}" rx="3" fill="${accentColor}" opacity="0.85"/>
        <text x="${labelW + w + 6}" y="${y + H * 0.68}" font-size="12" fill="var(--ink)" font-family="var(--mono)">${item.value}×</text>
      `;
    }).join('');

    return `<svg viewBox="0 0 ${labelW + barMaxW + 80} ${svgH}" style="width:100%;max-width:${labelW + barMaxW + 80}px;overflow:visible">${rects}</svg>`;
  }

  /* -- SVG histogram vertical -- */
  function svgHistogram(hist, binW, somaMin, accentColor) {
    const W = 580, H = 160, padL = 10, padB = 24;
    const maxH = Math.max(...hist);
    const n = hist.length;
    const bw = (W - padL) / n;

    const bars = hist.map((v, i) => {
      const bh = maxH > 0 ? (v / maxH) * (H - padB) : 0;
      const x = padL + i * bw;
      const y = H - padB - bh;
      const label = Math.round(somaMin + i * binW);
      return `<rect x="${x + 1}" y="${y}" width="${bw - 2}" height="${bh}" rx="2" fill="${accentColor}" opacity="0.8"/>`;
    }).join('');

    // axis labels (every 5 bins)
    const axisLabels = hist.map((_, i) => {
      if (i % 5 !== 0) return '';
      const x = padL + i * bw + bw / 2;
      const label = Math.round(somaMin + i * binW);
      return `<text x="${x}" y="${H}" text-anchor="middle" font-size="10" fill="var(--ink-faint)" font-family="var(--mono)">${label}</text>`;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H + 4}" style="width:100%;overflow:visible">${bars}${axisLabels}</svg>`;
  }

  /* -- heatmap de números -- */
  function renderHeatmap(el, freq, cfg, accentRGB) {
    const { uMin, uMax } = cfg;
    const vals = [];
    for (let i = uMin; i <= uMax; i++) vals.push(freq[i] || 0);
    const minF = Math.min(...vals);
    const maxF = Math.max(...vals);
    const acc = accentRGB.split(',').map(Number);

    el.innerHTML = '';
    const cols = Math.min(uMax - uMin + 1, cfg.heatCols || 10);
    el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    for (let i = uMin; i <= uMax; i++) {
      const f = freq[i] || 0;
      const t = maxF > minF ? (f - minF) / (maxF - minF) : 0.5;
      const cell = document.createElement('div');
      cell.className = 'hm-cell';
      cell.textContent = pad2(i);
      const bg = heatColor(t, acc);
      // text contrast
      const lum = 0.2126 * acc[0] / 255 + 0.7152 * acc[1] / 255 + 0.0722 * acc[2] / 255;
      const textColor = t > 0.6 ? (lum < 0.4 ? '#fff' : '#111') : 'rgba(245,235,224,0.7)';
      cell.style.cssText = `background:${bg};color:${textColor};`;
      cell.title = `${pad2(i)}: ${f} sorteios (${((f / (cfg._N || 1)) * 100).toFixed(1)}% dos concursos)`;
      el.appendChild(cell);
    }
  }

  /* -- parity chart -- */
  function renderParity(el, pariDist, sorteadas, accentColor) {
    const total = pariDist.reduce((a, b) => a + b, 0);
    const items = [];
    for (let i = 0; i <= sorteadas; i++) {
      if (pariDist[i] > 0) items.push({ pares: i, impares: sorteadas - i, count: pariDist[i] });
    }
    // top 8 most frequent
    items.sort((a, b) => b.count - a.count);
    const top = items.slice(0, 8);
    const maxC = top[0]?.count || 1;

    el.innerHTML = top.map(it => {
      const w = (it.count / maxC * 100).toFixed(1);
      const pct = (it.count / total * 100).toFixed(1);
      return `
        <div class="pari-row">
          <span class="pari-label">${it.pares}P · ${it.impares}Í</span>
          <div class="pari-bar-wrap">
            <div class="pari-bar" style="width:${w}%;background:${accentColor}"></div>
          </div>
          <span class="pari-pct">${pct}%</span>
          <span class="pari-count">${it.count.toLocaleString('pt-BR')}</span>
        </div>`;
    }).join('');
  }

  /* -- group distribution -- */
  function renderGroups(el, groupDist, cfg, accentColor) {
    const { uMin, gSize } = cfg;
    const maxG = Math.max(...groupDist);
    const total = groupDist.reduce((a, b) => a + b, 0);

    el.innerHTML = groupDist.map((v, i) => {
      const lo = uMin + i * gSize;
      const hi = Math.min(lo + gSize - 1, cfg.uMax);
      const pct = (v / total * 100).toFixed(1);
      const bw = maxG > 0 ? (v / maxG * 100).toFixed(1) : 0;
      return `
        <div class="grp-row">
          <span class="grp-label">${pad2(lo)}–${pad2(hi)}</span>
          <div class="grp-bar-wrap">
            <div class="grp-bar" style="width:${bw}%;background:${accentColor}"></div>
          </div>
          <span class="grp-pct">${pct}%</span>
        </div>`;
    }).join('');
  }

  /* -- conclusões geradas -- */
  function generateConclusions(st, cfg, data) {
    const { N, quentes, frias, somaAvg, somaStd, somaP25, somaP75, paresAvg, accStreak, withWinners, atrasados } = st;
    const meta = data.meta || {};
    const acc = accStreak > 0;
    const q5 = quentes.slice(0, 5).map(x => pad2(x.n)).join(', ');
    const f5 = frias.slice(0, 5).map(x => pad2(x.n)).join(', ');
    const atras5 = atrasados.slice(0, 5).map(x => `${pad2(x.n)} (${x.a} conc.)`).join(', ');
    const winPct = ((withWinners / N) * 100).toFixed(1);
    const paresAvgR = paresAvg.toFixed(1);
    const imparesAvgR = (cfg.sorteadas - paresAvg).toFixed(1);

    const lines = [
      `<strong>Base analisada:</strong> ${N.toLocaleString('pt-BR')} concursos (${normDate(meta.primeiraData)} a ${normDate(meta.ultimaData)}).`,
      `<strong>Números mais sorteados:</strong> ${q5}. Esses números aparecem com maior frequência histórica e recebem peso maior na estratégia equilibrada do gerador.`,
      `<strong>Números menos sorteados:</strong> ${f5}. A estratégia arrojada do gerador privilegia esses números, apostando que a frequência se equilibrará ao longo do tempo.`,
      `<strong>Números mais atrasados:</strong> ${atras5}. Atenção: atraso elevado não implica maior chance — cada sorteio é independente.`,
      `<strong>Soma ideal por cartão:</strong> entre ${Math.round(somaP25)} e ${Math.round(somaP75)} (intervalo P25–P75 histórico). A média histórica é ${fmt(somaAvg)} ± ${fmt(somaStd, 1)}.`,
      `<strong>Paridade:</strong> média de ${paresAvgR} dezenas pares e ${imparesAvgR} ímpares por cartão sorteado. O gerador filtra cartões que fogem dessa faixa.`,
      withWinners > 0 ? `<strong>Prêmio principal:</strong> acertadores em ${winPct}% dos concursos históricos.` : '',
      acc ? `<strong>Status atual:</strong> <span style="color:var(--gold)">acumulada há ${accStreak} concurso${accStreak !== 1 ? 's' : ''}</span>. O prêmio principal não foi pago nos últimos ${accStreak} sorteios.` : `<strong>Status atual:</strong> houve ganhador no último concurso registrado.`,
      `<strong>Nota estatística:</strong> cada sorteio é um evento independente. Frequência histórica e atraso são ferramentas de construção de cartões equilibrados — não garantem nem aumentam a probabilidade de acerto.`,
    ].filter(Boolean);

    return lines.map(l => `<p>${l}</p>`).join('');
  }

  /* ================================================================
     FUNÇÃO PRINCIPAL
     ================================================================ */
  async function init(CFG) {
    const boot = document.getElementById('boot');
    const app  = document.getElementById('app');
    const bootMsg = document.getElementById('bootMsg');

    const setMsg = (m) => { if (bootMsg) bootMsg.textContent = m; };
    setMsg('Carregando série histórica completa…');

    try {
      const resp = await fetch(CFG.jsonFile + '?v=' + Date.now());
      if (!resp.ok) throw new Error('Arquivo não encontrado: ' + CFG.jsonFile);
      setMsg('Processando ' + CFG.jsonFile + '…');
      const data = await resp.json();

      setMsg('Calculando estatísticas…');
      const st = computeStats(data, CFG);
      if (!st) throw new Error('Nenhum concurso encontrado no arquivo.');

      st._N = st.N; // for heatmap pct
      CFG._N = st.N;

      /* ---- sumário ---- */
      const m = st.meta;
      document.getElementById('stat-total').textContent  = st.N.toLocaleString('pt-BR');
      document.getElementById('stat-first').textContent  = normDate(m.primeiraData || '');
      document.getElementById('stat-last').textContent   = normDate(m.ultimaData || '');
      document.getElementById('stat-soma').textContent   = fmt(st.somaAvg);
      document.getElementById('stat-pares').textContent  = fmt(st.paresAvg, 1);
      document.getElementById('stat-winners').textContent = ((st.withWinners / st.N) * 100).toFixed(1) + '%';
      document.getElementById('stat-streak').textContent = st.accStreak > 0
        ? `${st.accStreak} sem ganhador`
        : 'Houve ganhador';

      /* ---- heatmap ---- */
      const hmEl = document.getElementById('heatmap');
      if (hmEl) renderHeatmap(hmEl, st.freq, CFG, CFG.accentRGB);

      /* ---- hot/cold bars ---- */
      const hotEl = document.getElementById('chart-hot');
      const coldEl = document.getElementById('chart-cold');
      if (hotEl) hotEl.innerHTML = svgHBar(
        st.quentes.map(x => ({ n: x.n, value: x.f })),
        st.quentes[0].f, CFG.accentColor);
      if (coldEl) coldEl.innerHTML = svgHBar(
        st.frias.map(x => ({ n: x.n, value: x.f })),
        st.quentes[0].f, 'rgba(245,235,224,0.35)');

      /* ---- atrasados ---- */
      const atrEl = document.getElementById('atrasados-list');
      if (atrEl) {
        atrEl.innerHTML = st.atrasados.map(x => `
          <div class="atr-row">
            <span class="atr-num" style="background:${CFG.accentColor};color:#111">${pad2(x.n)}</span>
            <span class="atr-bar-wrap">
              <span class="atr-bar" style="width:${Math.min(100, x.a / (st.atrasados[0].a || 1) * 100)}%;background:${CFG.accentColor}"></span>
            </span>
            <span class="atr-val">${x.a} concursos</span>
          </div>`).join('');
      }

      /* ---- histograma soma ---- */
      const histEl = document.getElementById('chart-hist');
      if (histEl) {
        histEl.innerHTML = svgHistogram(st.hist, st.binW, st.somaMin, CFG.accentColor);
        document.getElementById('hist-p25').textContent  = Math.round(st.somaP25);
        document.getElementById('hist-p75').textContent  = Math.round(st.somaP75);
        document.getElementById('hist-avg').textContent  = fmt(st.somaAvg);
        document.getElementById('hist-std').textContent  = fmt(st.somaStd, 1);
        document.getElementById('hist-min').textContent  = st.somaMin;
        document.getElementById('hist-max').textContent  = st.somaMax;
      }

      /* ---- paridade ---- */
      const pariEl = document.getElementById('parity-chart');
      if (pariEl) renderParity(pariEl, st.pariDist, CFG.sorteadas, CFG.accentColor);

      /* ---- faixas ---- */
      const grpEl = document.getElementById('groups-chart');
      if (grpEl) renderGroups(grpEl, st.groupDist, CFG, CFG.accentColor);

      /* ---- recentes vs. historico ---- */
      const recEl = document.getElementById('recent-heatmap');
      if (recEl) renderHeatmap(recEl, st.recentFreq, CFG, CFG.accentRGB);

      /* ---- top pares ---- */
      const pairsEl = document.getElementById('top-pairs');
      if (pairsEl) {
        const maxP = st.topPairs[0]?.count || 1;
        pairsEl.innerHTML = st.topPairs.map(p => `
          <div class="pair-row">
            <span class="pair-nums">${pad2(p.pair[0])} + ${pad2(p.pair[1])}</span>
            <div class="pair-bar-wrap">
              <div class="pair-bar" style="width:${(p.count/maxP*100).toFixed(1)}%;background:${CFG.accentColor}"></div>
            </div>
            <span class="pair-count">${p.count}×</span>
          </div>`).join('');
      }

      /* ---- conclusões ---- */
      const concEl = document.getElementById('conclusions');
      if (concEl) concEl.innerHTML = generateConclusions(st, CFG, data);

      /* mostrar app */
      if (boot) boot.style.display = 'none';
      if (app)  { app.style.display = 'block'; app.classList.add('ready'); }

    } catch (err) {
      console.error(err);
      if (bootMsg) bootMsg.innerHTML =
        `<strong style="color:var(--accent)">Erro ao carregar dados</strong><br>
         <span style="font-size:12px;color:rgba(245,235,224,0.5)">${err.message}</span><br><br>
         <span style="font-size:11px;color:rgba(245,235,224,0.4)">Verifique se o arquivo JSON está na mesma pasta ou rode o script de histórico.</span>`;
    }
  }

  global.StatsEngine = { init };

})(window);
