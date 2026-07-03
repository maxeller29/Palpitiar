'use strict';
// scripts/criar-historico-dupla-sena.js
// Busca toda a série histórica da Dupla Sena (concursos 1-2977)
// e gera dupla-sena-historico.json no formato padrão do Palpitiar.
// Uso: node scripts/criar-historico-dupla-sena.js

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const TOTAL_CONCURSOS = 2977;
const BATCH_SIZE      = 15;
const DELAY_BATCH     = 700;   // ms entre batches
const DELAY_REQ       = 80;    // ms entre requests no batch
const OUT_FILE        = path.join(process.cwd(), 'dupla-sena-historico.json');

function sleep(ms) { return new Promise(ok => setTimeout(ok, ms)); }

function fetchConcurso(num) {
  return new Promise(resolve => {
    const url = `https://servicebus2.caixa.gov.br/portaldeloterias/api/duplasena/${num}`;
    const req = https.get(url, { headers: { Accept: 'application/json', 'User-Agent': 'palpitiar-bot/1.0' } }, res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode !== 200) { res.resume(); return resolve({ _erro: res.statusCode }); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({ _erro: 'parse' }); } });
    });
    req.on('error', e => resolve({ _erro: e.message }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ _erro: 'timeout' }); });
  });
}

function formatarData(d) {
  if (!d) return null;
  const p = d.split('/');
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` : d;
}

function extrairPremios(r) {
  const f = r.listaRateioPremio || [];
  const p = {};
  const mF = { 0:'s1', 1:'q1', 2:'qt1', 3:'t1', 4:'s2', 5:'q2', 6:'qt2', 7:'t2' };
  const mG = { 0:'gs1',1:'gq1',2:'gqt1',3:'gt1',4:'gs2',5:'gq2',6:'gqt2',7:'gt2' };
  f.forEach((x, i) => {
    if (mF[i] !== undefined) {
      p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
      p[mG[i]] = x.numeroDeGanhadores ?? x.ganhadores ?? 0;
    }
  });
  return p;
}

function calcularStats(draws) {
  // combina os dois sorteios para calcular frequência
  const freqMap = {}, ultimoSorteio = {};
  for (let n = 1; n <= 50; n++) freqMap[n] = 0;
  let somaTotal = 0, comAcert = 0, semAcert = 0;
  draws.forEach((d, idx) => {
    const g = d[4] || 0;
    if (g > 0) comAcert++; else semAcert++;
    // soma do 1º sorteio (referência para qualidade de cartão)
    somaTotal += d[2].reduce((s, n) => s + n, 0);
    // frequência combinando ambos os sorteios
    [...d[2], ...d[3]].forEach(n => {
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
  const somas = draws.map(d => d[2].reduce((a, b) => a + b, 0));
  const mediaPares = draws.reduce((s, d) => s + d[2].filter(n => n % 2 === 0).length, 0) / total;
  return {
    comAcertadores: comAcert, semAcertadores: semAcert,
    percentualComAcertadores: Number((comAcert / total * 100).toFixed(1)),
    frequencia, atraso,
    quentes: sorted.slice(0, 10).map(([n]) => Number(n)),
    frias: sorted.slice(-10).map(([n]) => Number(n)),
    somaMedia: Number((somaTotal / total).toFixed(1)),
    somaMin: Math.min(...somas),
    somaMax: Math.max(...somas),
    mediaPares: Number(mediaPares.toFixed(2))
  };
}

async function main() {
  console.log('=== Criar histórico Dupla Sena ===');
  console.log('Concursos: 1 a', TOTAL_CONCURSOS);
  console.log('Lote: ' + BATCH_SIZE, '| Delay: ' + DELAY_BATCH + 'ms\n');

  const draws = [];
  const erros = [];
  let fetched = 0;

  for (let start = 1; start <= TOTAL_CONCURSOS; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, TOTAL_CONCURSOS);
    const nums = [];
    for (let i = start; i <= end; i++) nums.push(i);

    const promises = nums.map(async n => {
      await sleep(Math.random() * DELAY_REQ);
      return { n, r: await fetchConcurso(n) };
    });
    const results = await Promise.all(promises);

    results.forEach(({ n, r }) => {
      if (!r) { erros.push(n); return; }
      if (r._erro) { erros.push(n); return; }
      const dez1 = (r.listaDezenas || []).map(Number).sort((a, b) => a - b);
      const dez2 = (r.listaDezenasSegundoSorteio || []).map(Number).sort((a, b) => a - b);
      if (dez1.length !== 6 || dez2.length !== 6) { erros.push(n); return; }
      const g = r.listaRateioPremio?.[0]?.numeroDeGanhadores ?? 0;
      draws.push([n, formatarData(r.dataApuracao), dez1, dez2, parseInt(g) || 0, extrairPremios(r)]);
      fetched++;
    });

    process.stdout.write(`\r  Lote ${Math.ceil(end / BATCH_SIZE)} de ${Math.ceil(TOTAL_CONCURSOS / BATCH_SIZE)} · ${fetched} ok · ${erros.length} erros   `);
    if (end < TOTAL_CONCURSOS) await sleep(DELAY_BATCH);
  }

  console.log('\n\nObtidos:', fetched, '| Erros:', erros.length);
  if (erros.length > 0) console.log('Erros nos concursos:', erros.slice(0, 20).join(', '), erros.length > 20 ? '...' : '');

  draws.sort((a, b) => a[0] - b[0]);

  const hoje = new Date().toISOString().slice(0, 10);
  const ultimo = draws[draws.length - 1];
  const output = {
    meta: {
      loteria: 'dupla-sena',
      geradoEm: hoje,
      totalConcursos: draws.length,
      ultimoConcurso: ultimo[0],
      ultimaData: ultimo[1],
      enriquecidoEm: hoje
    },
    stats: calcularStats(draws),
    draws
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(output), 'utf8');
  console.log('\nSalvo:', OUT_FILE);
  console.log('Total concursos:', draws.length);
  console.log('Primeiro:', draws[0][0], draws[0][1]);
  console.log('Último:', ultimo[0], ultimo[1]);
}

main().catch(e => { console.error('\nERRO FATAL:', e.message); process.exit(1); });
