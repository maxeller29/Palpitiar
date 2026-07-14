'use strict';
// scripts/preencher-lacunas-lotomania.js
// Lê o lotomania-historico.json já existente, identifica quais concursos estão
// faltando dentro do intervalo [primeiro..ultimo], e busca SÓ esses — bem mais
// devagar e sequencial — para não disparar o bloqueio 403 do WAF (Azion) que
// aconteceu na corrida original com paralelismo alto.
// Uso: node scripts/preencher-lacunas-lotomania.js

const fs     = require('fs');
const path   = require('path');
const https  = require('https');
const crypto = require('crypto');
const zlib   = require('zlib');

const BASE_URL   = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotomania';
const ARQUIVO    = path.join(process.cwd(), 'lotomania-historico.json');
const DEBUG_FILE = path.join(process.cwd(), 'debug-lotomania-lacunas.log');
const DELAY_MS   = 2000; // bem mais devagar que a corrida original (que usava batch 15 / 600ms)

const agent = new https.Agent({
  keepAlive: true,
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

function sleep(ms) { return new Promise(ok => setTimeout(ok, ms)); }

function descomprimir(res) {
  const enc = (res.headers['content-encoding'] || '').toLowerCase();
  if (enc === 'gzip') return res.pipe(zlib.createGunzip());
  if (enc === 'br')   return res.pipe(zlib.createBrotliDecompress());
  if (enc === 'deflate') return res.pipe(zlib.createInflate());
  return res;
}

function lerCorpo(res) {
  return new Promise((resolve, reject) => {
    const stream = descomprimir(res);
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

function logDiag(tag, texto) {
  fs.appendFileSync(DEBUG_FILE, '=== ' + tag + ' (' + new Date().toISOString() + ') ===\n' + texto + '\n================================\n', 'utf8');
}

function fetchConcurso(num, tentativa = 0) {
  return new Promise((resolve) => {
    const url = BASE_URL + '/' + num;
    const req = https.get(url, {
      agent,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://loterias.caixa.gov.br/Paginas/Lotomania.aspx',
        'Origin': 'https://loterias.caixa.gov.br',
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
      }
    }, async res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }

      if (res.statusCode !== 200) {
        let corpoErro = '';
        try { corpoErro = await lerCorpo(res); } catch (e) { corpoErro = '[erro ao descomprimir: ' + e.message + ']'; }
        logDiag('HTTP_' + res.statusCode, 'concurso: ' + num + ' tentativa: ' + tentativa + '\ncorpo: ' + corpoErro.slice(0, 800));
        if (tentativa < 5) {
          const espera = res.statusCode === 403 ? 8000 * (tentativa + 1) : 2000 * (tentativa + 1);
          return setTimeout(() => fetchConcurso(num, tentativa + 1).then(resolve), espera);
        }
        return resolve({ _erro: res.statusCode, _num: num });
      }

      let body = '';
      try { body = await lerCorpo(res); }
      catch (e) {
        logDiag('ERRO_DESCOMPRIMIR', 'concurso: ' + num + '\nerro: ' + e.message);
        return resolve({ _erro: 'descompressao', _num: num });
      }

      try { resolve(JSON.parse(body)); }
      catch(e) {
        logDiag('JSON_INVALIDO', 'concurso: ' + num + '\ncorpo bruto:\n' + body.slice(0, 1000));
        resolve({ _erro: 'parse', _num: num });
      }
    });
    req.on('error', (err) => {
      logDiag('ERRO_DE_REDE', 'concurso: ' + num + '\ncode: ' + err.code + '\nmessage: ' + err.message);
      if (tentativa < 5) {
        return setTimeout(() => fetchConcurso(num, tentativa + 1).then(resolve), 2000 * (tentativa + 1));
      }
      resolve({ _erro: 'network:' + (err.code || err.message), _num: num });
    });
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
    const dezenas = d[2];
    somaTotal += dezenas.reduce((s, n) => s + n, 0);
    const ganhou = (d[3] || 0) > 0;
    if (ganhou) comAcert++; else semAcert++;
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
    comAcertadores: comAcert,
    semAcertadores: semAcert,
    percentualComAcertadores: Number((comAcert / total * 100).toFixed(1)),
    frequencia, atraso,
    quentes: sorted.slice(0, 10).map(([n]) => Number(n)),
    frias:   sorted.slice(-10).map(([n]) => Number(n)),
    somaMedia: Number((somaTotal / total).toFixed(1)),
    somaMin: Math.min(...somas),
    somaMax: Math.max(...somas),
    mediaPares: Number(mediaPares.toFixed(2))
  };
}

async function main() {
  console.log('=== Preencher lacunas — Lotomania ===');

  if (!fs.existsSync(ARQUIVO)) {
    console.error('Arquivo não encontrado: ' + ARQUIVO);
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
  const existentes = new Set(json.draws.map(d => d[0]));
  const primeiro = Math.min(...json.draws.map(d => d[0]));
  const ultimo   = Math.max(...json.draws.map(d => d[0]));

  const faltando = [];
  for (let n = primeiro; n <= ultimo; n++) {
    if (!existentes.has(n)) faltando.push(n);
  }

  console.log('Intervalo no arquivo: ' + primeiro + ' a ' + ultimo);
  console.log('Concursos existentes: ' + json.draws.length);
  console.log('Concursos faltando:   ' + faltando.length);

  if (faltando.length === 0) {
    console.log('Nenhuma lacuna encontrada — nada a fazer.');
    return;
  }

  console.log('Buscando sequencialmente (delay ' + DELAY_MS + 'ms, até 5 tentativas por concurso)...\n');

  const novosRegistros = [];
  const aindaFaltando = [];

  for (let i = 0; i < faltando.length; i++) {
    const num = faltando[i];
    const r = await fetchConcurso(num);

    if (!r || r._erro) {
      aindaFaltando.push({ num, erro: r ? r._erro : 'not_found' });
    } else {
      const dezenas = parseDezenas(r.listaDezenas);
      if (dezenas.length !== 20) {
        aindaFaltando.push({ num, erro: 'dezenas_invalidas_' + dezenas.length });
      } else {
        const data = formatarData(r.dataApuracao);
        const ganhadores = r.listaRateioPremio?.[0]?.numeroDeGanhadores ?? r.numeroDeGanhadores ?? r.ganhadores ?? 0;
        novosRegistros.push([num, data, dezenas, parseInt(ganhadores, 10) || 0, parsePremios(r)]);
      }
    }

    process.stdout.write('\r  [' + (i + 1) + '/' + faltando.length + '] concurso ' + num + ' | preenchidos: ' + novosRegistros.length + ' | ainda faltando: ' + aindaFaltando.length + '   ');

    if (i < faltando.length - 1) await sleep(DELAY_MS);
  }

  console.log('\n\nMesclando com o histórico existente...');
  const todosDraws = json.draws.concat(novosRegistros);
  todosDraws.sort((a, b) => a[0] - b[0]);

  console.log('Recalculando estatísticas...');
  json.draws = todosDraws;
  json.stats = calcularStats(todosDraws);
  json.meta.totalConcursos = todosDraws.length;
  json.meta.primeiroConcurso = todosDraws[0][0];
  json.meta.ultimoConcurso = todosDraws[todosDraws.length - 1][0];
  json.meta.primeiraData = todosDraws[0][1];
  json.meta.ultimaData = todosDraws[todosDraws.length - 1][1];
  json.meta.enriquecidoEm = new Date().toISOString().slice(0, 10);

  fs.writeFileSync(ARQUIVO, JSON.stringify(json), 'utf8');

  console.log('\n=== CONCLUÍDO ===');
  console.log('Arquivo atualizado: ' + ARQUIVO);
  console.log('Total de concursos agora: ' + todosDraws.length);
  console.log('Preenchidos nesta rodada: ' + novosRegistros.length);
  if (aindaFaltando.length > 0) {
    console.log('\nAinda faltando (' + aindaFaltando.length + ') — rode este script de novo mais tarde:');
    aindaFaltando.slice(0, 20).forEach(e => console.log('  Concurso ' + e.num + ': ' + e.erro));
  }
  console.log('Tamanho: ' + (fs.statSync(ARQUIVO).size / 1024 / 1024).toFixed(2) + ' MB');
}

main().catch(e => { console.error('\nERRO FATAL:', e.message); process.exit(1); });
