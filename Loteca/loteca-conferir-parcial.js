/**
 * loteca-conferir-parcial.js
 * Confere resultados parciais do concurso 1255 (Copa da Loteca 2026)
 * Busca placares na football-data.org para jogos já finalizados
 * NÃO marca o concurso como encerrado — apenas atualiza resultado_real dos jogos prontos
 *
 * Uso:
 *   node loteca-conferir-parcial.js 1255
 *
 * Variáveis:
 *   SUPABASE_KEY          = sb_secret_...
 *   FOOTBALL_DATA_TOKEN   = 8daf406ac51644daadfd28e15e294fe2 (já no env ou hardcoded)
 */

'use strict';

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN || '8daf406ac51644daadfd28e15e294fe2';

const NUMERO = parseInt(process.argv[2], 10) || 1255;

if (!SUPABASE_KEY) { console.error('SUPABASE_KEY nao definida'); process.exit(1); }

// ─── Mapeamento nomes Caixa → nomes football-data ─────────────────────────────
const NOMES_MAP = {
  'BRASIL':           ['Brazil', 'Brasil'],
  'MARROCOS':         ['Morocco', 'Marrocos'],
  'HAITI':            ['Haiti'],
  'ESCOCIA':          ['Scotland', 'Escocia'],
  'ESCOCIA/SCT':      ['Scotland', 'Escocia'],
  'ALEMANHA':         ['Germany', 'Alemanha'],
  'CURACAO':          ['Curaçao', 'Curacao'],
  'HOLANDA':          ['Netherlands', 'Holanda'],
  'JAPAO':            ['Japan', 'Japão'],
  'COSTA DO MARFIM':  ['Ivory Coast', 'Côte d\'Ivoire', 'Costa do Marfim'],
  'EQUADOR':          ['Ecuador', 'Equador'],
  'SUECIA':           ['Sweden', 'Suécia'],
  'TUNISIA':          ['Tunisia', 'Tunísia'],
  'ESPANHA':          ['Spain', 'Espanha'],
  'CABO VERDE':       ['Cape Verde', 'Cabo Verde'],
  'BELGICA':          ['Belgium', 'Bélgica'],
  'EGITO':            ['Egypt', 'Egito'],
  'ARABIA SAUDITA':   ['Saudi Arabia', 'Arábia Saudita'],
  'URUGUAI':          ['Uruguay', 'Uruguai'],
  'FRANCA':           ['France', 'França'],
  'SENEGAL':          ['Senegal'],
  'IRAQUE':           ['Iraq', 'Iraque'],
  'NORUEGA':          ['Norway', 'Noruega'],
  'ARGENTINA':        ['Argentina'],
  'ARGELIA':          ['Algeria', 'Argélia'],
  'PORTUGAL':         ['Portugal'],
  'CONGO':            ['DR Congo', 'Congo DR', 'Congo'],
  'INGLATERRA':       ['England', 'Inglaterra'],
  'CROACIA':          ['Croatia', 'Croácia'],
};

function normMatch(name, caixaNome) {
  const variants = NOMES_MAP[caixaNome.toUpperCase()] || [caixaNome];
  const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return variants.some(v => n.includes(v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: Object.assign({ 'User-Agent': 'Mozilla/5.0' }, headers || {})
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0,200)}`));
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('resposta nao-JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function supabase(method, table, body, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(url, {
      method,
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Supabase ${res.statusCode}: ${data.slice(0,300)}`));
        try { resolve(data ? JSON.parse(data) : []); } catch { resolve([]); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function calcResultado(g1, g2) {
  if (g1 === null || g1 === undefined || g2 === null || g2 === undefined) return null;
  if (g1 > g2) return 'coluna1';
  if (g1 === g2) return 'empate';
  return 'coluna2';
}

// ─── Buscar partidas finalizadas na football-data.org ─────────────────────────

async function buscarPartidas() {
  console.log('  Buscando Copa do Mundo 2026 na football-data.org...');
  const data = await httpGet(
    'https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED',
    { 'X-Auth-Token': FD_TOKEN }
  );
  const matches = data.matches || [];
  console.log(`  ${matches.length} partidas finalizadas encontradas`);
  return matches;
}

// ─── Casar jogo do banco com partida da API ───────────────────────────────────

function casarJogo(jogo, partidas, nomesCasa, nomesVisit) {
  // Extrair nomes do resumo: "BRASIL x MARROCOS"
  const partes = jogo.resumo.split(' x ');
  const nomeCasa  = partes[0].trim();
  const nomeVisit = partes[1]?.trim();
  if (!nomeCasa || !nomeVisit) return null;

  for (const p of partidas) {
    const home = p.homeTeam?.name || p.homeTeam?.shortName || '';
    const away = p.awayTeam?.name || p.awayTeam?.shortName || '';

    const casaBate  = normMatch(home, nomeCasa)  || normMatch(away, nomeCasa);
    const visitBate = normMatch(home, nomeVisit) || normMatch(away, nomeVisit);

    if (casaBate && visitBate) {
      // Determinar se casa/visit estão na ordem certa
      const casaEhHome = normMatch(home, nomeCasa);
      const g1 = casaEhHome ? p.score?.fullTime?.home : p.score?.fullTime?.away;
      const g2 = casaEhHome ? p.score?.fullTime?.away : p.score?.fullTime?.home;
      return { home, away, g1, g2, date: p.utcDate, status: p.status };
    }
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n' + '='.repeat(68));
  console.log(`CONFERENCIA PARCIAL — LOTECA ${NUMERO}`);
  console.log('='.repeat(68));

  try {
    // 1. Concurso no banco
    const concursos = await supabase('GET', 'loteca_concursos', null, {
      numero: `eq.${NUMERO}`, select: '*'
    });
    if (!concursos.length) throw new Error(`Concurso ${NUMERO} nao encontrado no banco`);
    const concurso = concursos[0];
    console.log(`\nConcurso: ${concurso.numero} | Status: ${concurso.status_analise}`);

    // 2. Jogos no banco
    const jogos = await supabase('GET', 'loteca_jogos_analise', null, {
      concurso_id: `eq.${concurso.id}`,
      select: 'id,ordem,resumo,resultado_sugerido,resultado_real,acertou',
      order: 'ordem.asc'
    });
    console.log(`${jogos.length} jogos carregados\n`);

    // 3. Buscar partidas finalizadas
    console.log('[1/3] Buscando resultados externos...');
    const partidas = await buscarPartidas();
    await sleep(500);

    // 4. Casar e atualizar
    console.log('\n[2/3] Conferindo jogos...\n');
    let atualizados = 0, pendentes = 0, jaOk = 0;

    for (const jogo of jogos) {
      const match = casarJogo(jogo, partidas);

      if (!match || match.status !== 'FINISHED') {
        console.log(`  [${String(jogo.ordem).padStart(2)}] ⏳ PENDENTE   ${jogo.resumo}`);
        pendentes++;
        continue;
      }

      const resultadoReal = calcResultado(match.g1, match.g2);
      if (!resultadoReal) {
        console.log(`  [${String(jogo.ordem).padStart(2)}] ⏳ SEM PLACAR ${jogo.resumo}`);
        pendentes++;
        continue;
      }

      // Já estava correto?
      if (jogo.resultado_real === resultadoReal) {
        const acertou = resultadoReal === jogo.resultado_sugerido;
        const icon = acertou ? '✓' : '✗';
        console.log(`  [${String(jogo.ordem).padStart(2)}] ${icon} JA OK     ${match.g1}x${match.g2} | ${resultadoReal} | ${jogo.resumo}`);
        jaOk++;
        continue;
      }

      const acertou = resultadoReal === jogo.resultado_sugerido;
      await supabase('PATCH', 'loteca_jogos_analise', {
        resultado_real: resultadoReal,
        acertou,
      }, { id: `eq.${jogo.id}` });

      const icon = acertou ? '✓' : '✗';
      console.log(`  [${String(jogo.ordem).padStart(2)}] ${icon} ATUALIZADO ${match.g1}x${match.g2} | ${resultadoReal} | ${jogo.resumo}`);
      atualizados++;
    }

    // 5. Resumo
    const finalizados = jogos.filter(j => j.resultado_real || atualizados > 0);
    const totalFinalizados = atualizados + jaOk;
    const totalAcertos = jogos.filter(j => j.acertou).length + 
      (atualizados > 0 ? jogos.filter(j => j.resultado_real && j.resultado_real === j.resultado_sugerido).length : 0);

    console.log('\n' + '='.repeat(68));
    console.log(`RESUMO — Concurso ${NUMERO}`);
    console.log('='.repeat(68));
    console.log(`  Atualizados agora : ${atualizados}`);
    console.log(`  Já estavam ok     : ${jaOk}`);
    console.log(`  Pendentes         : ${pendentes}`);
    console.log(`  Status concurso   : MANTIDO como '${concurso.status_analise}' (nao encerrado)`);
    if (pendentes === 0) {
      console.log('\n  TODOS OS JOGOS FINALIZADOS!');
      console.log('  Rode node loteca-conferir.js 1255 para encerrar oficialmente via API Caixa.');
    } else {
      console.log(`\n  Rode novamente quando mais jogos terminarem.`);
    }
    console.log('='.repeat(68));

  } catch (err) {
    console.error(`\nERRO: ${err.message}`);
    process.exit(1);
  }
})();
