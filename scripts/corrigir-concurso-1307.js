'use strict';
// scripts/corrigir-concurso-1307.js
// Corrige (ou insere, se estiver faltando) o registro do concurso 1307 direto
// no timemania-historico.json já gerado.
// Fonte da correção: conferência externa — resultado oficial real são 7 dezenas
// (11,17,26,29,32,40,70), sem o "54" espúrio que a API da Caixa retorna para esse concurso.
// Uso: node scripts/corrigir-concurso-1307.js

const fs     = require('fs');
const path   = require('path');
const https  = require('https');
const crypto = require('crypto');
const zlib   = require('zlib');

const ARQUIVO       = path.join(process.cwd(), 'timemania-historico.json');
const BASE_URL      = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/timemania';
const CONCURSO_ALVO = 1307;
const DEZENAS_CORRETAS = [11, 17, 26, 29, 32, 40, 70];

const agent = new https.Agent({
  keepAlive: true,
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

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

function buscarConcurso(num) {
  return new Promise((resolve, reject) => {
    const req = https.get(BASE_URL + '/' + num, {
      agent,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://loterias.caixa.gov.br/Paginas/Timemania.aspx',
        'Origin': 'https://loterias.caixa.gov.br',
        'Connection': 'keep-alive',
      }
    }, async res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      try {
        const body = await lerCorpo(res);
        resolve(JSON.parse(body));
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
    req.setTimeout(25000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function formatarData(d) {
  if (!d) return null;
  const p = d.split('/');
  return p.length === 3 ? p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0') : d;
}

function parsePremios(r) {
  const f = r.listaRateioPremio || [];
  const mF = { 0: '7', 1: '6', 2: '5', 3: '4', 4: '3' };
  const mG = { 0: 'g7', 1: 'g6', 2: 'g5', 3: 'g4', 4: 'g3' };
  const p = {};
  f.forEach((x, i) => {
    if (mF[i] !== undefined) {
      p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
      p[mG[i]] = x.numeroDeGanhadores ?? x.ganhadores ?? 0;
    }
  });
  return p;
}

function calcularStats(draws) {
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
  console.log('=== Corrigir/inserir concurso ' + CONCURSO_ALVO + ' no histórico Timemania ===');

  if (!fs.existsSync(ARQUIVO)) {
    console.error('Arquivo não encontrado: ' + ARQUIVO);
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
  const idx = json.draws.findIndex(d => d[0] === CONCURSO_ALVO);

  if (idx !== -1) {
    // Já existe — só corrige as dezenas
    const antes = json.draws[idx][2];
    console.log('Concurso já existe no arquivo.');
    console.log('Dezenas atuais:   ' + JSON.stringify(antes));
    console.log('Dezenas corretas: ' + JSON.stringify(DEZENAS_CORRETAS));
    if (JSON.stringify(antes) === JSON.stringify(DEZENAS_CORRETAS)) {
      console.log('Já está correto — nada a fazer.');
      return;
    }
    json.draws[idx][2] = DEZENAS_CORRETAS;
  } else {
    // Não existe — busca na API da Caixa e insere
    console.log('Concurso não encontrado no arquivo. Buscando na API da Caixa...');
    let r;
    try {
      r = await buscarConcurso(CONCURSO_ALVO);
    } catch (e) {
      console.error('Falha ao buscar concurso ' + CONCURSO_ALVO + ' na API: ' + e.message);
      process.exit(1);
    }

    const data = formatarData(r.dataApuracao);
    const ganhadores = r.listaRateioPremio?.[0]?.numeroDeGanhadores ?? 0;
    const novoRegistro = [
      CONCURSO_ALVO,
      data,
      DEZENAS_CORRETAS,
      parseInt(ganhadores, 10) || 0,
      parsePremios(r)
    ];

    console.log('Dados obtidos da API — data: ' + data);
    console.log('Inserindo com dezenas corrigidas: ' + JSON.stringify(DEZENAS_CORRETAS));

    // Insere mantendo a ordem crescente por número de concurso
    let posInsercao = json.draws.findIndex(d => d[0] > CONCURSO_ALVO);
    if (posInsercao === -1) posInsercao = json.draws.length;
    json.draws.splice(posInsercao, 0, novoRegistro);
  }

  console.log('Recalculando estatísticas...');
  json.stats = calcularStats(json.draws);
  json.meta.totalConcursos = json.draws.length;
  json.meta.enriquecidoEm = new Date().toISOString().slice(0, 10);
  json.meta.correcoesManuais = json.meta.correcoesManuais || [];
  json.meta.correcoesManuais.push({
    concurso: CONCURSO_ALVO,
    motivo: 'API da Caixa retornava 8 dezenas incluindo "54" espúrio (ou estava ausente do histórico); corrigido/inserido com as 7 dezenas oficiais reais, conferido em fonte externa',
    corrigidoEm: json.meta.enriquecidoEm
  });

  fs.writeFileSync(ARQUIVO, JSON.stringify(json), 'utf8');

  console.log('\n=== CONCLUÍDO ===');
  console.log('Arquivo atualizado: ' + ARQUIVO);
  console.log('Total de concursos no arquivo: ' + json.draws.length);
  console.log('Tamanho: ' + (fs.statSync(ARQUIVO).size / 1024 / 1024).toFixed(2) + ' MB');
}

main().catch(e => { console.error('ERRO FATAL:', e.message); process.exit(1); });

