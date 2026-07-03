'use strict';
// scripts/retry-historico-dupla-sena.js
// Busca sequencialmente os concursos ausentes do dupla-sena-historico.json
// (tipicamente os mais recentes que ficaram de fora por rate-limit).
// Uso: node scripts/retry-historico-dupla-sena.js

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const OUT_FILE  = path.join(process.cwd(), 'dupla-sena-historico.json');
const DELAY_MS  = 1400;   // ms entre requests
const RATE_LIMIT_PAUSE = 6000; // ms quando receber 429/503

function sleep(ms) { return new Promise(ok => setTimeout(ok, ms)); }

function fetchConcurso(num) {
  return new Promise(resolve => {
    const url = `https://servicebus2.caixa.gov.br/portaldeloterias/api/duplasena/${num}`;
    const req = https.get(url, { headers: { Accept: 'application/json', 'User-Agent': 'palpitiar-bot/1.0' } }, res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode === 429 || res.statusCode === 503) { res.resume(); return resolve({ _rate: true, code: res.statusCode }); }
      if (res.statusCode !== 200) { res.resume(); return resolve({ _erro: res.statusCode }); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({ _erro: 'parse' }); } });
    });
    req.on('error', e => resolve({ _erro: e.message }));
    req.setTimeout(25000, () => { req.destroy(); resolve({ _erro: 'timeout' }); });
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
  const freqMap = {}, ultimoSorteio = {};
  for (let n = 1; n <= 50; n++) freqMap[n] = 0;
  let somaTotal = 0, comAcert = 0, semAcert = 0;
  draws.forEach((d, idx) => {
    const g = d[4] || 0;
    if (g > 0) comAcert++; else semAcert++;
    somaTotal += d[2].reduce((s, n) => s + n, 0);
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
  const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const draws = existing.draws;
  const existingNums = new Set(draws.map(d => d[0]));
  const ultimoExistente = draws[draws.length - 1][0];

  console.log('=== Retry histórico Dupla Sena ===');
  console.log(`Concursos existentes: ${draws.length} (último: ${ultimoExistente})`);
  console.log(`Buscando de ${ultimoExistente + 1} a 2977...\n`);

  let novos = 0, erros = 0, skip404 = 0;
  const TOTAL_MAX = 2977;

  for (let n = ultimoExistente + 1; n <= TOTAL_MAX; n++) {
    process.stdout.write(`  Concurso ${n}/${TOTAL_MAX}... `);
    let resultado = await fetchConcurso(n);

    if (resultado && resultado._rate) {
      console.log(`RATE LIMIT (${resultado.code}). Aguardando ${RATE_LIMIT_PAUSE}ms...`);
      await sleep(RATE_LIMIT_PAUSE);
      resultado = await fetchConcurso(n);
    }

    if (!resultado) { console.log('404 (não existe)'); skip404++; await sleep(DELAY_MS); continue; }
    if (resultado._erro) { console.log(`ERRO: ${resultado._erro}`); erros++; await sleep(DELAY_MS); continue; }

    const dez1 = (resultado.listaDezenas || []).map(Number).sort((a, b) => a - b);
    const dez2 = (resultado.listaDezenasSegundoSorteio || []).map(Number).sort((a, b) => a - b);
    if (dez1.length !== 6 || dez2.length !== 6) { console.log(`dezenas inválidas (${dez1.length}/${dez2.length})`); erros++; await sleep(DELAY_MS); continue; }

    const data = formatarData(resultado.dataApuracao);
    const g = parseInt(resultado.listaRateioPremio?.[0]?.numeroDeGanhadores) || 0;
    draws.push([n, data, dez1, dez2, g, extrairPremios(resultado)]);
    novos++;
    console.log(`OK (${data})`);
    await sleep(DELAY_MS);
  }

  draws.sort((a, b) => a[0] - b[0]);

  const hoje = new Date().toISOString().slice(0, 10);
  const ultimo = draws[draws.length - 1];
  existing.draws = draws;
  existing.stats = calcularStats(draws);
  existing.meta = Object.assign({}, existing.meta, {
    geradoEm: hoje, totalConcursos: draws.length,
    ultimoConcurso: ultimo[0], ultimaData: ultimo[1], enriquecidoEm: hoje
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(existing), 'utf8');
  console.log(`\n=== Concluído ===`);
  console.log(`Novos: ${novos} | 404: ${skip404} | Erros: ${erros}`);
  console.log(`Total final: ${draws.length} concursos (último: ${ultimo[0]} em ${ultimo[1]})`);
}

main().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });
