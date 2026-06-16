/**
 * reprocessar-premios.js
 * Reprocessa concursos com premiosJson vazio nos JSONs históricos
 * Busca os prêmios na API Caixa e atualiza in-place
 * 
 * Uso: node scripts/reprocessar-premios.js
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const BASE_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api';
const DELAY_MS = 600;

function sleep(ms) { return new Promise(ok => setTimeout(ok, ms)); }

function encontrarJson(nome) {
  const candidatos = [
    path.join(process.cwd(), nome),
    path.join(__dirname, '..', nome),
  ];
  for (const c of candidatos) { if (fs.existsSync(c)) return c; }
  throw new Error('Não encontrei ' + nome);
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'palpitiar-bot/1.0' }
    }, res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
  });
}

function construirPremios(r, cfg) {
  const p = {};
  const f = r.listaRateioPremio || r.premiacoes || [];
  cfg.mF.forEach((chF, i) => {
    const x = f[i];
    if (!x) return;
    p[chF]        = x.valorPremio ?? x.valor ?? 0;
    p[cfg.mG[i]]  = x.numeroDeGanhadores ?? x.numeradorGanhadores ?? x.ganhadores ?? 0;
  });
  return p;
}

const LOTERIAS = [
  { id: 'mega-sena',  slug: 'megasena',  arquivo: 'mega-sena-historico.json',
    mF: ['s','qn','qd'],           mG: ['gs','gqn','gqd'] },
  { id: 'lotofacil',  slug: 'lotofacil', arquivo: 'lotofacil-historico.json',
    mF: ['15','14','13','12','11'], mG: ['g15','g14','g13','g12','g11'] },
  { id: 'quina',      slug: 'quina',     arquivo: 'quina-historico.json',
    mF: ['5','4','3','2'],          mG: ['g5','g4','g3','g2'] },
];

async function reprocessar(cfg) {
  const arquivo = encontrarJson(cfg.arquivo);
  const dados   = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const draws   = dados.draws;

  // Encontrar draws com premiosJson vazio
  const vazios = draws.filter(d =>
    Array.isArray(d) && d.length >= 5 &&
    typeof d[4] === 'object' && d[4] !== null &&
    Object.keys(d[4]).length === 0
  );

  console.log(`\n[${cfg.id}] ${draws.length} concursos | ${vazios.length} com premiosJson vazio`);

  if (vazios.length === 0) {
    console.log(`  Nenhum a reprocessar.`);
    return false;
  }

  let atualizados = 0;
  for (const d of vazios) {
    const num = d[0];
    process.stdout.write(`  Concurso ${num}... `);
    try {
      const r = await fetchJSON(`${BASE_URL}/${cfg.slug}/${num}`);
      if (!r) { console.log('não encontrado'); continue; }
      const premios = construirPremios(r, cfg);
      if (Object.keys(premios).length > 0) {
        d[4] = premios;
        atualizados++;
        console.log(`OK (${Object.keys(premios).length} chaves)`);
      } else {
        console.log('sem prêmios no rateio');
      }
    } catch(e) {
      console.log(`ERRO: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  if (atualizados > 0) {
    fs.writeFileSync(arquivo, JSON.stringify(dados), 'utf8');
    console.log(`  Salvo: ${atualizados} concursos atualizados.`);
    return true;
  }
  return false;
}

(async () => {
  console.log('=== Reprocessar premiosJson vazios ===');
  console.log('Data: ' + new Date().toISOString());
  for (const cfg of LOTERIAS) {
    try { await reprocessar(cfg); }
    catch(e) { console.error(`[${cfg.id}] ERRO FATAL: ${e.message}`); }
  }
  console.log('\n=== Concluído ===');
})();
