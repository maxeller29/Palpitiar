/**
 * loteca-coletar-numero.js
 * Versão do coletor que aceita um número específico de concurso
 * Uso: node loteca-coletar-numero.js 1257
 */

'use strict';

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const CAIXA_BASE = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca';

const numeroAlvo = parseInt(process.argv[2], 10);
if (!numeroAlvo) { console.error('Uso: node loteca-coletar-numero.js <numero>'); process.exit(1); }
if (!SUPABASE_KEY) { console.error('SUPABASE_KEY nao definida'); process.exit(1); }

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 500) return reject(new Error(`HTTP ${res.statusCode}`));
        if (res.statusCode === 404) return reject(new Error('HTTP 404'));
        try { resolve(JSON.parse(d)); } catch { reject(new Error('nao-JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sb(method, table, body, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    if (params) Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(url, {
      method, headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
      },
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Supabase ${res.statusCode}: ${d.slice(0,200)}`));
        try { resolve(d ? JSON.parse(d) : []); } catch { resolve([]); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function parseDateBR(str) {
  if (!str) return null;
  const [d,m,y] = str.split('/');
  return `${y}-${m}-${d}`;
}

function calcResultado(g1, g2) {
  if (g1 === null || g1 === undefined) return null;
  if (g1 > g2) return 'coluna1';
  if (g1 === g2) return 'empate';
  return 'coluna2';
}

(async () => {
  console.log(`\n=== Coletando concurso ${numeroAlvo} ===\n`);

  const dados = await httpGet(`${CAIXA_BASE}/${numeroAlvo}`);
  const jogosApi = dados.listaResultadoEquipeEsportiva || [];
  if (!jogosApi.length) { console.log('Sem jogos publicados.'); process.exit(0); }

  console.log(`Concurso ${dados.numero} | ${jogosApi.length} jogos`);

  // Verificar se já existe
  const existentes = await sb('GET', 'loteca_concursos', null, { numero: `eq.${numeroAlvo}`, select: 'id' });
  let concursoId;

  if (existentes.length > 0) {
    concursoId = existentes[0].id;
    console.log(`Concurso já existe (id: ${concursoId})`);
  } else {
    const slug = 'copa-do-mundo-fifa-2026';
    let compId;
    const compEx = await sb('GET', 'competicoes_config', null, { slug: `eq.${slug}`, select: 'id' });
    if (compEx.length > 0) { compId = compEx[0].id; }
    else {
      const compNovo = await sb('POST', 'competicoes_config', {
        slug, label: 'Copa do Mundo FIFA 2026', nome_caixa_pattern: 'Copa do Mundo',
        tipo: 'grupos', nivel: 'copa_mundial', reducao_score_eliminatorio: 0, peso_forma: 1.0,
      });
      compId = compNovo[0].id;
    }

    const rateioPremio = dados.listaRateioPremio || [];
    const faixa14 = rateioPremio.find(r => r.descricaoFaixa?.includes('14'));
    const faixa13 = rateioPremio.find(r => r.descricaoFaixa?.includes('13'));

    const criados = await sb('POST', 'loteca_concursos', {
      numero: dados.numero,
      data_sorteio: parseDateBR(dados.dataApuracao),
      status_analise: 'rascunho',
      acumulado: dados.acumulado || false,
      estimativa_premio: dados.valorEstimadoProximoConcurso || null,
      arrecadacao: dados.valorArrecadado || null,
      ganhadores_14: faixa14?.numeroDeGanhadores ?? null,
      rateio_14: faixa14?.valorPremio ?? null,
      ganhadores_13: faixa13?.numeroDeGanhadores ?? null,
      rateio_13: faixa13?.valorPremio ?? null,
    });
    concursoId = criados[0].id;
    console.log(`Concurso criado: id=${concursoId}`);

    const jogosPorOrdem = [...jogosApi].sort((a,b) => a.nuJogo - b.nuJogo);
    const timeCache = {};

    async function upsertTime(nome) {
      if (timeCache[nome]) return timeCache[nome];
      const ex = await sb('GET', 'times_mapeamento', null, { nome_caixa: `eq.${nome}`, select: 'id' });
      if (ex.length > 0) { timeCache[nome] = ex[0].id; return ex[0].id; }
      const novo = await sb('POST', 'times_mapeamento', {
        nome_caixa: nome, nome_popular: nome, pais: 'Internacional',
        nivel_nacional: 'media', fonte_dados: 'manual', ativo: true,
      });
      timeCache[nome] = novo[0].id;
      return novo[0].id;
    }

    for (let idx = 0; idx < jogosPorOrdem.length; idx++) {
      const j = jogosPorOrdem[idx];
      const ordem = idx + 1;
      const timeCasaId  = await upsertTime(j.nomeEquipeUm);
      const timeVisitId = await upsertTime(j.nomeEquipeDois);
      const resultadoReal = calcResultado(j.nuGolEquipeUm, j.nuGolEquipeDois);

      await sb('POST', 'loteca_jogos_analise', {
        concurso_id: concursoId, ordem,
        time_casa_id: timeCasaId, time_visit_id: timeVisitId,
        competicao_id: compId, competicao_label: dados.nomeCampeonato || 'Copa do Mundo FIFA 2026',
        is_classico: false, is_eliminatorio: false,
        classificacao: 'dificil', resultado_sugerido: 'coluna1', cobertura: 'triplo',
        resultado_real: resultadoReal, acertou: null, revisado_editor: false,
        resumo: `${j.nomeEquipeUm} x ${j.nomeEquipeDois}`,
        justificativa: JSON.stringify({
          nomeEquipeUm: j.nomeEquipeUm, nomeEquipeDois: j.nomeEquipeDois,
          golUm: j.nuGolEquipeUm ?? null, golDois: j.nuGolEquipeDois ?? null, fonte: 'manual',
        }),
      });
      console.log(`  [${String(ordem).padStart(2)}] ${j.nomeEquipeUm} x ${j.nomeEquipeDois}`);
    }
  }

  console.log(`\nConcurso ${numeroAlvo} pronto.`);
})().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
