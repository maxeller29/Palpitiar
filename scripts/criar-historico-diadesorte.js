'use strict';
// scripts/criar-historico-diadesorte.js
// Busca TODA a série histórica do Dia de Sorte (concursos 1-N) da API oficial da Caixa.
// Usa batches paralelos para ser rápido. Salva em diadesorte-historico.json na raiz.
// Uso: node scripts/criar-historico-diadesorte.js

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const BASE_URL        = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/diadesorte';
const CONCURSO_INICIO = 1;
const CONCURSO_FIM    = 1500; // atualizar se houver mais (iniciou em mai/2018)
const BATCH_SIZE      = 8;    // requisições paralelas por batch
const DELAY_BATCH     = 800;  // ms entre batches
const OUT_FILE        = path.join(process.cwd(), 'diadesorte-historico.json');

function sleep(ms) { return new Promise(ok => setTimeout(ok, ms)); }

function fetchConcurso(num, tentativa = 0) {
  return new Promise((resolve) => {
    const url = BASE_URL + '/' + num;
    const req = https.get(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://loterias.caixa.gov.br/',
        'Origin': 'https://loterias.caixa.gov.br',
      }
    }, res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode !== 200) {
        res.resume();
        if (tentativa < 3) {
          return setTimeout(() => fetchConcurso(num, tentativa + 1).then(resolve), 1500 * (tentativa + 1));
        }
        return resolve({ _erro: res.statusCode, _num: num });
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { resolve({ _erro: 'parse', _num: num }); }
      });
    });
    req.on('error', () => {
      if (tentativa < 3) {
        return setTimeout(() => fetchConcurso(num, tentativa + 1).then(resolve), 1500 * (tentativa + 1));
      }
      resolve({ _erro: 'network', _num: num });
    });
    req.setTimeout(25000, () => { req.destroy(); resolve({ _erro: 'timeout', _num: num }); });
  });
}

function parseDezenas(raw) {
  return (raw || []).map(d => parseInt(d, 10)).sort((a, b) => a - b);
}

function parsePremios(r) {
  const f = r.listaRateioPremio || [];
  // Faixas Dia de Sorte: [0]=7ac [1]=6ac [2]=5ac [3]=4ac [4]=mes_da_sorte
  const mF = { 0:'7', 1:'6', 2:'5', 3:'4', 4:'mes' };
  const mG = { 0:'g7', 1:'g6', 2:'g5', 3:'g4', 4:'gmes' };
  const p = {};
  f.forEach((x, i) => {
    if (mF[i] !== undefined) {
      p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
      p[mG[i]] = x.numeroDeGanhadores ?? x.ganhadores ?? 0;
    }
  });
  return p;
}

function formatarData(d) {
  if (!d) return null;
  const p = d.split('/');
  return p.length === 3 ? p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0') : d;
}

function calcularStats(draws) {
  // Dia de Sorte: números 1-31, 7 dezenas sorteadas
  const MAX = 31;
  const freqMap = {}, ultimoSorteio = {};
  for (let n = 1; n <= MAX; n++) freqMap[n] = 0;

  let somaTotal = 0;
  draws.forEach((d, idx) => {
    const dezenas = d[2];
    somaTotal += dezenas.reduce((s, n) => s + n, 0);
    dezenas.forEach(n => {
      freqMap[n] = (freqMap[n] || 0) + 1;
      ultimoSorteio[n] = idx;
    });
  });

  const total = draws.length, last = total - 1;
  const frequencia = {}, atraso = {};
  Object.keys(freqMap).forEach(n => {
    frequencia[n] = freqMap[n];
    atraso[n] = last - (ultimoSorteio[n] !== undefined ? ultimoSorteio[n] : -1);
  });

  const sorted = Object.entries(freqMap).sort((a, b) => b[1] - a[1]);
  const somas  = draws.map(d => d[2].reduce((a, b) => a + b, 0));
  const mediaPares = draws.reduce((s, d) => s + d[2].filter(n => n % 2 === 0).length, 0) / total;

  return {
    frequencia, atraso,
    quentes: sorted.slice(0, 7).map(([n]) => Number(n)),
    frias:   sorted.slice(-7).map(([n]) => Number(n)),
    somaMedia: Number((somaTotal / total).toFixed(1)),
    somaMin: Math.min(...somas),
    somaMax: Math.max(...somas),
    mediaPares: Number(mediaPares.toFixed(2)),
    totalConcursos: total,
  };
}

async function main() {
  console.log('=== Criar histórico Dia de Sorte ===');
  console.log('Concursos: ' + CONCURSO_INICIO + ' a ' + CONCURSO_FIM + ' (até o último disponível)');
  console.log('Batch size: ' + BATCH_SIZE + ' | Delay: ' + DELAY_BATCH + 'ms\n');

  const draws = [];
  const erros = [];
  let processados = 0;
  let ultimoEncontrado = 0;

  for (let inicio = CONCURSO_INICIO; inicio <= CONCURSO_FIM; inicio += BATCH_SIZE) {
    const fim = Math.min(inicio + BATCH_SIZE - 1, CONCURSO_FIM);
    const nums = [];
    for (let n = inicio; n <= fim; n++) nums.push(n);

    const resultados = await Promise.all(nums.map(n => fetchConcurso(n)));

    let algumNulo = false;
    resultados.forEach((r, i) => {
      const num = nums[i];
      if (!r) { algumNulo = true; return; }
      if (r._erro) { erros.push({ num, erro: r._erro }); return; }

      const dezenas = parseDezenas(r.listaDezenas);
      if (dezenas.length !== 7) { erros.push({ num, erro: 'dezenas_invalidas_' + dezenas.length }); return; }

      const data = formatarData(r.dataApuracao);
      const ganhadores = r.listaRateioPremio?.[0]?.numeroDeGanhadores ?? 0;
      draws.push([num, data, dezenas, parseInt(ganhadores, 10) || 0, parsePremios(r)]);
      ultimoEncontrado = num;
      processados++;
    });

    const pct = Math.round((fim / CONCURSO_FIM) * 100);
    process.stdout.write('\r  [' + pct + '%] ' + fim + ' | OK:' + processados + ' Erros:' + erros.length + '   ');

    if (algumNulo && inicio > ultimoEncontrado + BATCH_SIZE * 2) break;
    if (fim < CONCURSO_FIM) await sleep(DELAY_BATCH);
  }

  console.log('\n\nOrdenando...');
  draws.sort((a, b) => a[0] - b[0]);

  if (erros.length > 0) {
    console.log('AVISOS — ' + erros.length + ' erros:');
    erros.slice(0, 20).forEach(e => console.log('  Concurso ' + e.num + ': ' + e.erro));
  }

  if (draws.length === 0) {
    console.error('NENHUM concurso obtido — verifique a URL da API.');
    process.exit(1);
  }

  console.log('Calculando estatísticas...');
  const stats = calcularStats(draws);
  const hoje  = new Date().toISOString().slice(0, 10);

  const json = {
    meta: {
      loteria: 'Dia de Sorte',
      fonte: 'Caixa Econômica Federal — série histórica oficial',
      geradoEm: hoje,
      totalConcursos: draws.length,
      primeiroConcurso: draws[0][0],
      ultimoConcurso: draws[draws.length - 1][0],
      primeiraData: draws[0][1],
      ultimaData: draws[draws.length - 1][1],
      formato: '[numero, "YYYY-MM-DD", [dezenas_1_a_31], ganhadores_7ac, {premios}]',
      regras: {
        universo: '1-31 (31 números)',
        dezenasSorteadas: 7,
        dezenasAposta: 7,
        faixas: ['7ac','6ac','5ac','4ac','mes_da_sorte']
      },
      enriquecidoEm: hoje
    },
    stats,
    draws
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(json), 'utf8');
  console.log('\n=== CONCLUÍDO ===');
  console.log('Arquivo: ' + OUT_FILE);
  console.log('Total concursos: ' + draws.length);
  console.log('Primeiro: ' + draws[0][0] + ' (' + draws[0][1] + ')');
  console.log('Último:   ' + draws[draws.length-1][0] + ' (' + draws[draws.length-1][1] + ')');
  console.log('Tamanho: ' + (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2) + ' MB');
}

main().catch(e => { console.error('\nERRO FATAL:', e.message); process.exit(1); });
