'use strict';
// scripts/retry-historico-lotomania.js
// Retenta buscar os concursos faltando no lotomania-historico.json (via rate-limit do batch inicial)
// Uso: node scripts/retry-historico-lotomania.js

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const BASE_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotomania';
const DELAY_MS = 1200; // mais devagar para evitar 429
const OUT_FILE = path.join(process.cwd(), 'lotomania-historico.json');

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
  const mF = { 0:'20', 1:'19', 2:'18', 3:'17', 4:'16', 5:'0' };
  const mG = { 0:'g20',1:'g19',2:'g18',3:'g17',4:'g16',5:'g0' };
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
  const MAX = 99;
  const freqMap = {}, ultimoSorteio = {};
  for (let n = 0; n <= MAX; n++) freqMap[n] = 0;

  let somaTotal = 0, comAcert = 0, semAcert = 0;
  draws.forEach((d, idx) => {
    somaTotal += d[2].reduce((s, n) => s + n, 0);
    if ((d[3] || 0) > 0) comAcert++; else semAcert++;
    d[2].forEach(n => { freqMap[n] = (freqMap[n] || 0) + 1; ultimoSorteio[n] = idx; });
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
    comAcertadores: comAcert, semAcertadores: semAcert,
    percentualComAcertadores: Number((comAcert / total * 100).toFixed(1)),
    frequencia, atraso,
    quentes: sorted.slice(0, 10).map(([n]) => Number(n)),
    frias:   sorted.slice(-10).map(([n]) => Number(n)),
    somaMedia: Number((somaTotal / total).toFixed(1)),
    somaMin: Math.min(...somas), somaMax: Math.max(...somas),
    mediaPares: Number(mediaPares.toFixed(2))
  };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  const existing = new Set(data.draws.map(d => d[0]));
  const missing = [];
  for (let i = 1; i <= 2944; i++) if (!existing.has(i)) missing.push(i);

  console.log('=== Retry Lotomania ===');
  console.log('Existentes:', existing.size, '| Faltando:', missing.length);
  if (missing.length === 0) { console.log('Nada a fazer!'); return; }

  const novos = [], erros = [];
  for (let i = 0; i < missing.length; i++) {
    const num = missing[i];
    process.stdout.write('\r  [' + (i+1) + '/' + missing.length + '] Concurso ' + num + '...   ');

    const r = await fetchConcurso(num);
    if (!r) { erros.push(num); }
    else if (r._erro) {
      if (r._erro === 429) {
        // Rate limited — aguarda mais e tenta de novo
        process.stdout.write(' [429 - aguardando 5s] ');
        await sleep(5000);
        const r2 = await fetchConcurso(num);
        if (r2 && !r2._erro) {
          const dezenas = parseDezenas(r2.listaDezenas);
          if (dezenas.length === 20) {
            novos.push([num, formatarData(r2.dataApuracao), dezenas, r2.numeroDeGanhadores ?? 0, parsePremios(r2)]);
          }
        } else { erros.push(num); }
      } else { erros.push(num); }
    } else {
      const dezenas = parseDezenas(r.listaDezenas);
      if (dezenas.length === 20) {
        novos.push([num, formatarData(r.dataApuracao), dezenas, r.numeroDeGanhadores ?? 0, parsePremios(r)]);
      } else { erros.push(num); }
    }

    await sleep(DELAY_MS);
  }

  console.log('\n\nNovos recuperados:', novos.length, '| Erros persistentes:', erros.length);

  if (novos.length > 0) {
    novos.forEach(d => data.draws.push(d));
    data.draws.sort((a, b) => a[0] - b[0]);
    data.stats = calcularStats(data.draws);
    const hoje = new Date().toISOString().slice(0, 10);
    data.meta.totalConcursos = data.draws.length;
    data.meta.ultimoConcurso = data.draws[data.draws.length - 1][0];
    data.meta.ultimaData     = data.draws[data.draws.length - 1][1];
    data.meta.enriquecidoEm  = hoje;
    fs.writeFileSync(OUT_FILE, JSON.stringify(data), 'utf8');
    console.log('Total final:', data.draws.length, 'concursos');
  }

  if (erros.length > 0) {
    console.log('Concursos com erro persistente:', erros.join(', '));
  }
}

main().catch(e => { console.error('\nERRO FATAL:', e.message); process.exit(1); });
