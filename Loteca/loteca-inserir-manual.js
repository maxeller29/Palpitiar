/**
 * loteca-inserir-manual.js
 * Insere manualmente o concurso 1256 no Supabase
 * (API Caixa indisponível — dados extraídos do site)
 */

'use strict';

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_KEY) {
  console.error('ERRO: variavel de ambiente SUPABASE_KEY nao definida.');
  process.exit(1);
}

// ─── Dados do concurso 1256 (extraídos do site Caixa) ─────────────────────────
const CONCURSO = {
  numero: 1256,
  data_sorteio: '2026-06-17',
  estimativa_premio: 200000000, // R$ 2.000.000,00 em centavos
  status_analise: 'coletando',
};

const JOGOS = [
  { ordem: 1,  casa: 'BRASIL',            visit: 'HAITI',              pais_casa: 'BRA', pais_visit: 'HTI' },
  { ordem: 2,  casa: 'GANA',              visit: 'PANAMA',             pais_casa: 'GHA', pais_visit: 'PAN' },
  { ordem: 3,  casa: 'UZBEQUISTAO',       visit: 'COLOMBIA',           pais_casa: 'UZB', pais_visit: 'COL' },
  { ordem: 4,  casa: 'REPUBLICA TCHECA',  visit: 'AFRICA DO SUL',      pais_casa: 'CZE', pais_visit: 'ZAF' },
  { ordem: 5,  casa: 'SUICA',             visit: 'BOSNIA HERZEGOVINA', pais_casa: 'CHE', pais_visit: 'BIH' },
  { ordem: 6,  casa: 'CANADA',            visit: 'CATAR',              pais_casa: 'CAN', pais_visit: 'QAT' },
  { ordem: 7,  casa: 'MEXICO',            visit: 'COREIA DO SUL',      pais_casa: 'MEX', pais_visit: 'KOR' },
  { ordem: 8,  casa: 'ESTADOS UNIDOS',    visit: 'AUSTRALIA',          pais_casa: 'USA', pais_visit: 'AUS' },
  { ordem: 9,  casa: 'ESCOCIA',           visit: 'MARROCOS',           pais_casa: 'SCO', pais_visit: 'MAR' },
  { ordem: 10, casa: 'HOLANDA',           visit: 'SUECIA',             pais_casa: 'NLD', pais_visit: 'SWE' },
  { ordem: 11, casa: 'ALEMANHA',          visit: 'COSTA DO MARFIM',    pais_casa: 'DEU', pais_visit: 'CIV' },
  { ordem: 12, casa: 'EQUADOR',           visit: 'CURACAO',            pais_casa: 'ECU', pais_visit: 'CUW' },
  { ordem: 13, casa: 'ESPANHA',           visit: 'ARABIA SAUDITA',     pais_casa: 'ESP', pais_visit: 'SAU' },
  { ordem: 14, casa: 'URUGUAI',           visit: 'CABO VERDE',         pais_casa: 'URU', pais_visit: 'CPV' },
];

// ─── HTTP helper ──────────────────────────────────────────────────────────────

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

function toSlug(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── Upsert time ──────────────────────────────────────────────────────────────

async function upsertTime(nome, pais) {
  const existentes = await supabase('GET', 'times_mapeamento', null, {
    nome_caixa: `eq.${nome}`,
    select: 'id',
  });
  if (existentes.length > 0) return existentes[0].id;

  const criados = await supabase('POST', 'times_mapeamento', {
    nome_caixa: nome,
    nome_popular: nome,
    pais: pais || 'Internacional',
    nivel_nacional: 'media',
    fonte_dados: 'manual',
    ativo: true,
  });

  console.log(`  Novo time: "${nome}"`);
  return criados[0].id;
}

// ─── Upsert competição ────────────────────────────────────────────────────────

async function upsertCompeticao() {
  const slug = 'copa-do-mundo-fifa-2026';
  const existentes = await supabase('GET', 'competicoes_config', null, {
    slug: `eq.${slug}`,
    select: 'id',
  });
  if (existentes.length > 0) return existentes[0].id;

  const criados = await supabase('POST', 'competicoes_config', {
    slug,
    label: 'Copa do Mundo FIFA 2026',
    nome_caixa_pattern: 'Copa do Mundo',
    tipo: 'grupos',
    nivel: 'copa_mundial',
    reducao_score_eliminatorio: 0,
    peso_forma: 1.0,
  });

  console.log(`  Nova competicao: "Copa do Mundo FIFA 2026"`);
  return criados[0].id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`INSERCAO MANUAL — LOTECA ${CONCURSO.numero}`);
    console.log('='.repeat(60));

    // 1. Verificar se concurso já existe
    const existentes = await supabase('GET', 'loteca_concursos', null, {
      numero: `eq.${CONCURSO.numero}`,
      select: 'id,numero',
    });

    let concursoId;
    if (existentes.length > 0) {
      concursoId = existentes[0].id;
      console.log(`\n[1/3] Concurso ${CONCURSO.numero} ja existe (id: ${concursoId}). Pulando criacao.`);
    } else {
      console.log(`\n[1/3] Criando concurso ${CONCURSO.numero}...`);
      const criados = await supabase('POST', 'loteca_concursos', {
        numero: CONCURSO.numero,
        data_sorteio: CONCURSO.data_sorteio,
        status_analise: CONCURSO.status_analise,
        acumulado: false,
        estimativa_premio: CONCURSO.estimativa_premio,
      });
      concursoId = criados[0].id;
      console.log(`  OK — id: ${concursoId}`);
    }

    // 2. Competição
    console.log(`\n[2/3] Verificando competicao...`);
    const competicaoId = await upsertCompeticao();
    console.log(`  competicao_id: ${competicaoId}`);

    // 3. Jogos
    console.log(`\n[3/3] Inserindo ${JOGOS.length} jogos...`);
    let inseridos = 0;
    let pulados = 0;

    for (const jogo of JOGOS) {
      // Verificar se já existe
      const jogExist = await supabase('GET', 'loteca_jogos_analise', null, {
        concurso_id: `eq.${concursoId}`,
        ordem: `eq.${jogo.ordem}`,
        select: 'id',
      });
      if (jogExist.length > 0) {
        console.log(`  [${String(jogo.ordem).padStart(2)}] JA EXISTE — pulando`);
        pulados++;
        continue;
      }

      const timeCasaId  = await upsertTime(jogo.casa,  jogo.pais_casa);
      const timeVisitId = await upsertTime(jogo.visit, jogo.pais_visit);

      await supabase('POST', 'loteca_jogos_analise', {
        concurso_id: concursoId,
        ordem: jogo.ordem,
        time_casa_id: timeCasaId,
        time_visit_id: timeVisitId,
        competicao_id: competicaoId,
        competicao_label: 'Copa do Mundo FIFA 2026',
        is_classico: false,
        is_eliminatorio: false,
        classificacao: 'dificil',
        resultado_sugerido: 'coluna1',
        cobertura: 'triplo',
        resultado_real: null,
        acertou: null,
        revisado_editor: false,
        resumo: `${jogo.casa} x ${jogo.visit}`,
        justificativa: JSON.stringify({
          nomeEquipeUm: jogo.casa,
          nomeEquipeDois: jogo.visit,
          golUm: null,
          golDois: null,
          siglaPaisUm: jogo.pais_casa,
          siglaPaisDois: jogo.pais_visit,
          fonte: 'insercao_manual',
        }),
      });

      console.log(`  [${String(jogo.ordem).padStart(2)}] ${jogo.casa.padEnd(22)} x ${jogo.visit}`);
      inseridos++;
    }

    // Relatório final
    console.log(`\n${'='.repeat(60)}`);
    console.log(`CONCURSO ${CONCURSO.numero} — RESUMO`);
    console.log('='.repeat(60));
    console.log(`  Inseridos : ${inseridos}`);
    console.log(`  Ja existiam: ${pulados}`);
    console.log(`  concurso_id: ${concursoId}`);
    console.log('='.repeat(60));
    console.log('\nProximo passo:');
    console.log('  node loteca-analisar.js 1256');
    console.log('  Ou acesse: palpitiar.com.br/admin-loteca.html');

  } catch (err) {
    console.error(`\nERRO: ${err.message}`);
    process.exit(1);
  }
})();