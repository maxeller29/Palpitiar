/**
 * loteca-conferir.js
 * Conferência automática da Loteca — Palpitiar
 *
 * O que faz:
 *   1. Busca o concurso na API da Caixa
 *   2. Verifica se os resultados já foram publicados (gols disponíveis)
 *   3. Atualiza resultado_real e acertou em cada jogo
 *   4. Grava premiação (ganhadores/rateio faixas 14 e 13)
 *   5. Muda status_analise para 'encerrado'
 *
 * Uso:
 *   node loteca-conferir.js 1255
 *   node loteca-conferir.js          <- confere o concurso mais recente com status != encerrado
 *
 * Variáveis de ambiente:
 *   SUPABASE_KEY = sb_secret_...
 */

'use strict';

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.error('ERRO: defina SUPABASE_KEY.');
  process.exit(1);
}

const CAIXA_BASE = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca';
const args = process.argv.slice(2);
const NUMERO_ARG = parseInt(args.find(a => /^\d+$/.test(a)), 10) || null;

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 404) return reject(new Error('HTTP 404'));
        if (res.statusCode >= 500) return reject(new Error(`HTTP ${res.statusCode} — concurso nao disponivel`));
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Resposta nao-JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')); });
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
        if (res.statusCode >= 400) return reject(new Error(`Supabase ${res.statusCode} em ${table}: ${data.slice(0, 300)}`));
        try { resolve(data ? JSON.parse(data) : []); } catch { resolve([]); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcResultado(g1, g2) {
  if (g1 === null || g1 === undefined) return null;
  if (g1 > g2) return 'coluna1';
  if (g1 === g2) return 'empate';
  return 'coluna2';
}

function fmtBRL(v) {
  if (!v) return 'R$ 0,00';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n' + '='.repeat(68));
  console.log('CONFERENCIA AUTOMATICA — LOTECA');
  console.log('='.repeat(68));

  try {
    // 1. Descobrir qual concurso conferir
    let concursoDb;

    if (NUMERO_ARG) {
      const rows = await supabase('GET', 'loteca_concursos', null, {
        numero: `eq.${NUMERO_ARG}`, select: '*',
      });
      if (rows.length === 0) throw new Error(`Concurso ${NUMERO_ARG} nao encontrado no banco.`);
      concursoDb = rows[0];
    } else {
      // Pegar o mais recente que ainda nao foi encerrado
      const rows = await supabase('GET', 'loteca_concursos', null, {
        status_analise: 'not.eq.encerrado',
        order: 'numero.desc',
        limit: '1',
        select: '*',
      });
      if (rows.length === 0) {
        console.log('\nNenhum concurso pendente de conferencia encontrado.');
        process.exit(0);
      }
      concursoDb = rows[0];
    }

    console.log(`\nConcurso alvo: ${concursoDb.numero} (status atual: ${concursoDb.status_analise})`);

    // 2. Buscar resultado na API da Caixa
    console.log(`\n[1/4] Buscando resultado na API da Caixa...`);
    const dados = await httpGet(`${CAIXA_BASE}/${concursoDb.numero}`);

    const jogosApi = dados.listaResultadoEquipeEsportiva || [];
    if (jogosApi.length === 0) {
      console.log('      Jogos ainda nao disponíveis na API da Caixa. Tente novamente mais tarde.');
      process.exit(0);
    }

    // Verificar se os gols foram publicados (ao menos 1 jogo com placar)
    const temPlacar = jogosApi.some(j =>
      j.nuGolEquipeUm !== null && j.nuGolEquipeUm !== undefined
    );
    if (!temPlacar) {
      console.log('      Resultados ainda nao publicados (gols ausentes). Tente novamente apos o sorteio.');
      process.exit(0);
    }

    const totalJogos = jogosApi.length;
    const comPlacar = jogosApi.filter(j => j.nuGolEquipeUm !== null && j.nuGolEquipeUm !== undefined).length;
    console.log(`      OK — ${comPlacar}/${totalJogos} jogos com placar`);

    // 3. Buscar jogos no banco
    console.log(`\n[2/4] Carregando jogos do banco...`);
    const jogosDb = await supabase('GET', 'loteca_jogos_analise', null, {
      concurso_id: `eq.${concursoDb.id}`,
      select: 'id,ordem,resultado_sugerido,resultado_real',
      order: 'ordem.asc',
    });
    console.log(`      ${jogosDb.length} jogos carregados`);

    // Mapear jogos da API por nuJogo (ordenar para alinhar com ordem 1-14)
    const apiOrdenados = [...jogosApi].sort((a, b) => a.nuJogo - b.nuJogo);

    // 4. Atualizar cada jogo
    console.log(`\n[3/4] Conferindo resultados...`);
    console.log('');

    let acertos = 0;
    let erros = 0;
    let semPlacar = 0;
    const detalhe = [];

    for (let idx = 0; idx < jogosDb.length; idx++) {
      const jogo = jogosDb[idx];
      const api  = apiOrdenados[idx];

      if (!api) { semPlacar++; continue; }

      const g1 = api.nuGolEquipeUm;
      const g2 = api.nuGolEquipeDois;
      const resultadoReal = calcResultado(g1, g2);

      if (resultadoReal === null) { semPlacar++; continue; }

      const acertou = resultadoReal === jogo.resultado_sugerido;
      if (acertou) acertos++; else erros++;

      await supabase('PATCH', 'loteca_jogos_analise', {
        resultado_real: resultadoReal,
        acertou,
      }, { id: `eq.${jogo.id}` });

      const icon = acertou ? '✓' : '✗';
      const placar = `${g1}x${g2}`;
      const res = resultadoReal === 'coluna1' ? 'C1' : resultadoReal === 'empate' ? 'X ' : 'C2';
      const sug = jogo.resultado_sugerido === 'coluna1' ? 'C1' : jogo.resultado_sugerido === 'empate' ? 'X ' : 'C2';

      const linha = `  ${icon} Jogo ${String(jogo.ordem).padStart(2)} | ${placar.padEnd(5)} | Real:${res} | Sug:${sug} | ${acertou ? 'ACERTO' : 'ERRO  '} | ${api.nomeEquipeUm} x ${api.nomeEquipeDois}`;
      console.log(linha);
      detalhe.push({ ordem: jogo.ordem, acertou, resultadoReal, placar });
    }

    // 5. Atualizar premiação e status do concurso
    console.log(`\n[4/4] Atualizando concurso...`);

    const rateioPremio = dados.listaRateioPremio || [];
    const faixa14 = rateioPremio.find(r => r.descricaoFaixa && r.descricaoFaixa.includes('14'));
    const faixa13 = rateioPremio.find(r => r.descricaoFaixa && r.descricaoFaixa.includes('13'));

    await supabase('PATCH', 'loteca_concursos', {
      status_analise: 'encerrado',
      acumulado: dados.acumulado || false,
      arrecadacao: dados.valorArrecadado || null,
      ganhadores_14: faixa14?.numeroDeGanhadores ?? null,
      rateio_14: faixa14?.valorPremio ?? null,
      ganhadores_13: faixa13?.numeroDeGanhadores ?? null,
      rateio_13: faixa13?.valorPremio ?? null,
    }, { id: `eq.${concursoDb.id}` });

    // 6. Relatório final
    const taxa = Math.round(acertos / (acertos + erros) * 100);
    console.log('\n' + '='.repeat(68));
    console.log(`CONCURSO ${concursoDb.numero} — CONFERENCIA CONCLUIDA`);
    console.log('='.repeat(68));
    console.log(`  Acertos:     ${acertos}/${acertos + erros} jogos (${taxa}%)`);
    console.log(`  Sem placar:  ${semPlacar} jogo(s)`);
    if (faixa14) {
      console.log(`  14 acertos:  ${faixa14.numeroDeGanhadores} ganhador(es) — ${fmtBRL(faixa14.valorPremio)}`);
    }
    if (faixa13) {
      console.log(`  13 acertos:  ${faixa13.numeroDeGanhadores} ganhador(es) — ${fmtBRL(faixa13.valorPremio)}`);
    }
    console.log(`  Status:      encerrado`);
    console.log('='.repeat(68));
    console.log('\nProximo passo: rodar loteca-coletar.js para o proximo concurso.');

  } catch (err) {
    console.error(`\nERRO: ${err.message}`);
    process.exit(1);
  }
})();