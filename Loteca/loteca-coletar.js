/**
 * loteca-coletar.js
 * Pipeline de coleta da Loteca — Palpitiar
 *
 * Uso:
 *   node loteca-coletar.js 1254
 *   node loteca-coletar.js          <- ultimo concurso publicado
 *
 * Variaveis de ambiente:
 *   SUPABASE_URL   = https://oslvqimllizsdtxwkrag.supabase.co
 *   SUPABASE_KEY   = sb_secret_...
 */

'use strict';

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.error('ERRO: variavel de ambiente SUPABASE_KEY nao definida.');
  console.error('  PowerShell: $env:SUPABASE_KEY = "sb_secret_..."');
  process.exit(1);
}

const CAIXA_BASE = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca';

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 404) return reject(new Error('HTTP 404 — concurso nao encontrado'));
        if (res.statusCode >= 500) return reject(new Error(`HTTP ${res.statusCode} — concurso ainda nao publicado`));
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Resposta nao-JSON da API Caixa')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout na API Caixa')); });
  });
}

function supabase(method, table, body, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const payload = body ? JSON.stringify(body) : null;
    const options = {
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`Supabase ${res.statusCode} em ${table}: ${data.slice(0, 400)}`));
        }
        try { resolve(data ? JSON.parse(data) : []); }
        catch { resolve([]); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateBR(str) {
  if (!str) return null;
  const [d, m, y] = str.split('/');
  return `${y}-${m}-${d}`;
}

function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function inferirCompeticao(nome) {
  const n = nome.toLowerCase();

  let tipo = 'pontos_corridos';
  if (n.includes('copa') || n.includes('cup') || n.includes('mata') || n.includes('eliminat')) {
    tipo = 'mata_mata';
  } else if (n.includes('libertadores') || n.includes('sul-americana') || n.includes('champions') || n.includes('grupo')) {
    tipo = 'grupos';
  }

  let nivel = 'nacional_a';
  if (n.includes('principal') || n.includes('serie a') || n.includes('premier') ||
      n.includes('la liga') || n.includes('bundesliga') || n.includes('ligue 1')) {
    nivel = 'elite';
  } else if (n.includes('serie b') || n.includes('segunda')) {
    nivel = 'nacional_b';
  } else if (n.includes('serie c')) {
    nivel = 'nacional_c';
  } else if (n.includes('estadual') || n.includes('paulista') || n.includes('carioca') ||
             n.includes('gaucho') || n.includes('mineiro') || n.includes('baiano')) {
    nivel = 'estadual';
  } else if (n.includes('libertadores') || n.includes('champions')) {
    nivel = 'internacional_elite';
  } else if (n.includes('sul-americana') || n.includes('europa') || n.includes('conference')) {
    nivel = 'internacional_alto';
  } else if (n.includes('mundial') || n.includes('world cup')) {
    nivel = 'copa_mundial';
  }

  return { tipo, nivel };
}

function calcResultado(nuGolUm, nuGolDois) {
  if (nuGolUm === null || nuGolUm === undefined) return null;
  if (nuGolUm > nuGolDois) return 'coluna1';
  if (nuGolUm === nuGolDois) return 'empate';
  return 'coluna2';
}

// ─── Upsert time ──────────────────────────────────────────────────────────────

async function upsertTime(nome, siglaUF, siglaPais) {
  // FK referencia times_mapeamento (nome_caixa = chave de busca)
  const existentes = await supabase('GET', 'times_mapeamento', null, {
    nome_caixa: `eq.${nome}`,
    select: 'id',
  });
  if (existentes.length > 0) return existentes[0].id;

  const criados = await supabase('POST', 'times_mapeamento', {
    nome_caixa: nome,
    nome_popular: nome,
    estado: siglaUF || null,
    pais: siglaPais === 'BRA' || !siglaPais ? 'Brasil' : siglaPais,
    nivel_nacional: 'media',
    fonte_dados: 'api_futebol',
    ativo: true,
  });

  console.log(`      Novo time: "${nome}"`);
  return criados[0].id;
}

// ─── Upsert competicao ────────────────────────────────────────────────────────

async function upsertCompeticao(nomeCampeonato) {
  const slug = toSlug(nomeCampeonato);

  const existentes = await supabase('GET', 'competicoes_config', null, {
    slug: `eq.${slug}`,
    select: 'id',
  });
  if (existentes.length > 0) return existentes[0].id;

  const { tipo, nivel } = inferirCompeticao(nomeCampeonato);
  const criados = await supabase('POST', 'competicoes_config', {
    slug,
    label: nomeCampeonato,
    nome_caixa_pattern: nomeCampeonato,
    tipo,
    nivel,
    reducao_score_eliminatorio: 0,
    peso_forma: 1.0,
  });

  console.log(`      Nova competicao: "${nomeCampeonato}" (${tipo}/${nivel})`);
  return criados[0].id;
}

// ─── Inserir concurso ─────────────────────────────────────────────────────────

async function buscarConcurso(numero) {
  const url = numero ? `${CAIXA_BASE}/${numero}` : CAIXA_BASE;
  console.log(`\n[1/4] Buscando concurso ${numero ?? '(ultimo)'}...`);
  console.log(`      URL: ${url}`);
  const data = await httpGet(url);
  console.log(`      OK — concurso ${data.numero}, ${data.dataApuracao}, ${data.listaResultadoEquipeEsportiva?.length ?? 0} jogos`);
  return data;
}

async function inserirConcurso(dados) {
  console.log(`\n[2/4] Inserindo concurso ${dados.numero} em loteca_concursos...`);

  const existentes = await supabase('GET', 'loteca_concursos', null, {
    numero: `eq.${dados.numero}`,
    select: 'id,numero',
  });
  if (existentes.length > 0) {
    console.log(`      Concurso ${dados.numero} ja existe (id: ${existentes[0].id}). Pulando.`);
    return existentes[0].id;
  }

  const rateioPremio = dados.listaRateioPremio || [];
  const faixa14 = rateioPremio.find(r => r.descricaoFaixa && r.descricaoFaixa.includes('14'));
  const faixa13 = rateioPremio.find(r => r.descricaoFaixa && r.descricaoFaixa.includes('13'));

  const criados = await supabase('POST', 'loteca_concursos', {
    numero: dados.numero,
    data_sorteio: parseDateBR(dados.dataApuracao),
    status_analise: 'coletando',
    acumulado: dados.acumulado || false,
    estimativa_premio: dados.valorEstimadoProximoConcurso || null,
    arrecadacao: dados.valorArrecadado || null,
    ganhadores_14: faixa14?.numeroDeGanhadores ?? null,
    rateio_14: faixa14?.valorPremio ?? null,
    ganhadores_13: faixa13?.numeroDeGanhadores ?? null,
    rateio_13: faixa13?.valorPremio ?? null,
  });

  const id = criados[0].id;
  console.log(`      OK — id: ${id}`);
  return id;
}

// ─── Inserir jogos ────────────────────────────────────────────────────────────

async function inserirJogos(concursoId, jogos) {
  console.log(`\n[3/4] Processando ${jogos.length} jogos...`);

  const compCache = {};
  const timeCache = {};
  let inseridos = 0;
  let pulados = 0;

  // nuJogo da API nao e sequencial 1-14 — mapear para posicao no array (1-based)
  const jogosPorOrdem = [...jogos].sort((a, b) => a.nuJogo - b.nuJogo);

  for (let idx = 0; idx < jogosPorOrdem.length; idx++) {
    const jogo = jogosPorOrdem[idx];
    const ordem = idx + 1; // 1 a 14

    const existentes = await supabase('GET', 'loteca_jogos_analise', null, {
      concurso_id: `eq.${concursoId}`,
      ordem: `eq.${ordem}`,
      select: 'id',
    });
    if (existentes.length > 0) { pulados++; continue; }

    // Competicao
    const nomeCamp = jogo.nomeCampeonato || 'Desconhecido';
    if (!compCache[nomeCamp]) {
      compCache[nomeCamp] = await upsertCompeticao(nomeCamp);
    }

    // Times — upsert garantido, IDs distintos por nome
    const nomeUm   = jogo.nomeEquipeUm;
    const nomeDois = jogo.nomeEquipeDois;

    if (!timeCache[nomeUm]) {
      timeCache[nomeUm] = await upsertTime(nomeUm, jogo.siglaUFUm, jogo.siglaPaisUm);
    }
    if (!timeCache[nomeDois]) {
      timeCache[nomeDois] = await upsertTime(nomeDois, jogo.siglaUFDois, jogo.siglaPaisDois);
    }

    const timeCasaId  = timeCache[nomeUm];
    const timeVisitId = timeCache[nomeDois];

    // Resultado real
    const goiUm   = jogo.nuGolEquipeUm;
    const golDois  = jogo.nuGolEquipeDois;
    const resultadoReal = calcResultado(goiUm, golDois);

    await supabase('POST', 'loteca_jogos_analise', {
      concurso_id: concursoId,
      ordem,
      time_casa_id: timeCasaId,
      time_visit_id: timeVisitId,
      competicao_id: compCache[nomeCamp],
      competicao_label: nomeCamp,
      is_classico: false,
      is_eliminatorio: false,
      classificacao: 'dificil',
      resultado_sugerido: 'coluna1',
      cobertura: 'triplo',
      resultado_real: resultadoReal,
      acertou: null,
      revisado_editor: false,
      resumo: `${nomeUm} x ${nomeDois}`,
      justificativa: JSON.stringify({
        nomeEquipeUm: nomeUm,
        nomeEquipeDois: nomeDois,
        golUm: goiUm ?? null,
        golDois: golDois ?? null,
        dtJogo: jogo.dtJogo,
        diaSemana: jogo.diaSemana,
        siglaPaisUm: jogo.siglaPaisUm,
        siglaPaisDois: jogo.siglaPaisDois,
        siglaUFUm: jogo.siglaUFUm,
        siglaUFDois: jogo.siglaUFDois,
      }),
    });

    inseridos++;
    const placar = (goiUm !== null && goiUm !== undefined) ? `${goiUm}x${golDois}` : 'a realizar';
    console.log(`      [${String(ordem).padStart(2)}] ${nomeUm.padEnd(25)} x ${nomeDois.padEnd(25)} | ${placar}`);
  }

  console.log(`\n      Inseridos: ${inseridos} | Ja existiam: ${pulados}`);
}

// ─── Relatorio ────────────────────────────────────────────────────────────────

async function relatorio(concursoId, numeroConcurso) {
  console.log(`\n[4/4] Verificando dados gravados...`);

  const jogos = await supabase('GET', 'loteca_jogos_analise', null, {
    concurso_id: `eq.${concursoId}`,
    select: 'ordem,resultado_real,resumo',
    order: 'ordem.asc',
  });

  console.log(`\n${'='.repeat(68)}`);
  console.log(`CONCURSO LOTECA ${numeroConcurso} — ${jogos.length} JOGOS GRAVADOS`);
  console.log('='.repeat(68));
  jogos.forEach(j => {
    const res = j.resultado_real ? `[${j.resultado_real.padEnd(8)}]` : '[pendente]';
    console.log(`  ${String(j.ordem).padStart(2)}. ${res} ${j.resumo}`);
  });
  console.log('='.repeat(68));
  console.log('\nColeta concluida. Proximo passo: preencher as analises no admin.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const numeroArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  try {
    const dados = await buscarConcurso(numeroArg);

    const jogos = dados.listaResultadoEquipeEsportiva;
    if (!jogos || jogos.length === 0) {
      console.log('\nConcurso encontrado mas sem jogos publicados ainda. Aguarde a Caixa publicar.');
      process.exit(0);
    }

    const concursoId = await inserirConcurso(dados);
    await inserirJogos(concursoId, jogos);
    await relatorio(concursoId, dados.numero);

  } catch (err) {
    console.error(`\nERRO: ${err.message}`);
    process.exit(1);
  }
})();