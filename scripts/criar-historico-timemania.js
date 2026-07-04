'use strict';
// scripts/criar-historico-timemania.js
// Busca TODA a série histórica da Timemania (concursos 1-N) da API oficial da Caixa.
// Usa batches paralelos para ser rápido. Salva em timemania-historico.json na raiz.
// Uso: node scripts/criar-historico-timemania.js

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const BASE_URL        = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/timemania';
const CONCURSO_INICIO = 1;
const CONCURSO_FIM    = 2500; // atualizar se houver mais
const BATCH_SIZE      = 15;   // requisições paralelas por batch
const DELAY_BATCH     = 600;  // ms entre batches
const OUT_FILE        = path.join(process.cwd(), 'timemania-historico.json');

function sleep(ms) { return new Promise(ok => setTimeout(ok, ms)); }

function fetchConcurso(num) {
  return new Promise((resolve) => {
    const url = BASE_URL + '/' + num;
    const req = https.get(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'palpitiar-bot/1.0' }
    }, res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode !== 200) { res.resume(); return resolve({ _erro: res.statusCode, _num: num }); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { resolve({ _erro: 'parse', _num: num }); }
      });
    });
    req.on('error', () => resolve({ _erro: 'network', _num: num }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ _erro: 'timeout', _num: num }); });
  });
}

function parseDezenas(raw) {
  return (raw || []).map(d => parseInt(d, 10)).sort((a, b) => a - b);
}

function parsePremios(r) {
  const f = r.listaRateioPremio || [];
  // Faixas Timemania: [0]=7ac [1]=6ac [2]=5ac [3]=4ac [4]=3ac
  const mF = { 0:'7', 1:'6', 2:'5', 3:'4', 4:'3' };
  const mG = { 0:'g7', 1:'g6', 2:'g5', 3:'g4', 4:'g3' };
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
  // Timemania: números 1-80, 10 dezenas sorteadas
  const MAX = 80;
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
    quentes: sorted.slice(0, 10).map(([n]) => Number(n)),
    frias:   sorted.slice(-10).map(([n]) => Number(n)),
    somaMedia: Number((somaTotal / total).toFixed(1)),
    somaMin: Math.min(...somas),
    somaMax: Math.max(...somas),
    mediaPares: Number(mediaPares.toFixed(2)),
    totalConcursos: total,
  };
}

async function main() {
  console.log('=== Criar histórico Timemania ===');
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
      if (!r) {
        algumNulo = true;
        return;
      }
      if (r._erro) { erros.push({ num, erro: r._erro }); return; }

      const dezenas = parseDezenas(r.listaDezenas);
      if (dezenas.length !== 10) { erros.push({ num, erro: 'dezenas_invalidas_' + dezenas.length }); return; }

      const data = formatarData(r.dataApuracao);
      const ganhadores = r.listaRateioPremio?.[0]?.numeroDeGanhadores ?? 0;
      draws.push([num, data, dezenas, parseInt(ganhadores, 10) || 0, parsePremios(r)]);
      ultimoEncontrado = num;
      processados++;
    });

    const pct = Math.round((fim / CONCURSO_FIM) * 100);
    process.stdout.write('\r  [' + pct + '%] ' + fim + ' | OK:' + processados + ' Erros:' + erros.length + '   ');

    // Para se encontrar muitos 404s consecutivos (além do último concurso)
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
      loteria: 'Timemania',
      fonte: 'Caixa Econômica Federal — série histórica oficial',
      geradoEm: hoje,
      totalConcursos: draws.length,
      primeiroConcurso: draws[0][0],
      ultimoConcurso: draws[draws.length - 1][0],
      primeiraData: draws[0][1],
      ultimaData: draws[draws.length - 1][1],
      formato: '[numero, "YYYY-MM-DD", [dezenas_1_a_80], ganhadores_7ac, {premios}]',
      regras: {
        universo: '1-80 (80 números)',
        dezenasSorteadas: 10,
        dezenasAposta: 10,
        faixas: ['7ac','6ac','5ac','4ac','3ac']
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
