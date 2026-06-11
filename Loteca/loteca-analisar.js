/**
 * loteca-analisar.js
 * Análise automática da Loteca — Palpitiar
 *
 * Coleta dados externos e pré-preenche scores/probabilidades no Supabase.
 * O admin (admin-loteca.html) revisa e publica.
 *
 * Fontes em cascata:
 *   1. Ranking FIFA (tabela embutida)        -> força de seleções
 *   2. API-Futebol (api-futebol.com.br)      -> força/forma de clubes BR
 *   3. SofaScore (API JSON pública)          -> forma recente (todos)
 *   Fatores indisponíveis: peso redistribuído entre os disponíveis.
 *
 * Uso:
 *   node loteca-analisar.js 1255
 *   node loteca-analisar.js 1255 --force          (sobrescreve jogos revisados)
 *   node loteca-analisar.js 1255 --skip-sofascore (só FIFA/API-Futebol)
 *
 * Variáveis de ambiente:
 *   SUPABASE_KEY        = sb_secret_...   (obrigatória)
 *   API_FUTEBOL_LOTECA  = Bearer token    (opcional — clubes BR)
 */

'use strict';

const https = require('https');

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const API_FUTEBOL_TOKEN = process.env.API_FUTEBOL_LOTECA || null;

const args = process.argv.slice(2);
const NUMERO = parseInt(args.find(a => /^\d+$/.test(a)), 10);
const FORCE = args.includes('--force');
const SKIP_SOFA = args.includes('--skip-sofascore');

if (!SUPABASE_KEY) {
  console.error('ERRO: defina SUPABASE_KEY.  PowerShell: $env:SUPABASE_KEY = "sb_secret_..."');
  process.exit(1);
}
if (isNaN(NUMERO)) {
  console.error('ERRO: informe o numero do concurso.  Ex: node loteca-analisar.js 1255');
  process.exit(1);
}

// ─── Ranking FIFA embutido (pontos aproximados, out-dez/2025) ─────────────────
// Atualize periodicamente em https://inside.fifa.com/fifa-world-ranking/men
// chave = nome_caixa normalizado | en = nome para busca no SofaScore

const FIFA = {
  'ESPANHA':         { pts: 1880, en: 'Spain' },
  'ARGENTINA':       { pts: 1870, en: 'Argentina' },
  'FRANCA':          { pts: 1862, en: 'France' },
  'INGLATERRA':      { pts: 1824, en: 'England' },
  'BRASIL':          { pts: 1776, en: 'Brazil' },
  'PORTUGAL':        { pts: 1762, en: 'Portugal' },
  'HOLANDA':         { pts: 1756, en: 'Netherlands' },
  'BELGICA':         { pts: 1732, en: 'Belgium' },
  'ALEMANHA':        { pts: 1718, en: 'Germany' },
  'CROACIA':         { pts: 1698, en: 'Croatia' },
  'MARROCOS':        { pts: 1694, en: 'Morocco' },
  'ITALIA':          { pts: 1690, en: 'Italy' },
  'COLOMBIA':        { pts: 1680, en: 'Colombia' },
  'URUGUAI':         { pts: 1672, en: 'Uruguay' },
  'MEXICO':          { pts: 1660, en: 'Mexico' },
  'JAPAO':           { pts: 1654, en: 'Japan' },
  'ESTADOS UNIDOS':  { pts: 1648, en: 'USA' },
  'SENEGAL':         { pts: 1638, en: 'Senegal' },
  'SUICA':           { pts: 1635, en: 'Switzerland' },
  'DINAMARCA':       { pts: 1627, en: 'Denmark' },
  'COREIA DO SUL':   { pts: 1595, en: 'South Korea' },
  'EQUADOR':         { pts: 1590, en: 'Ecuador' },
  'AUSTRIA':         { pts: 1585, en: 'Austria' },
  'NORUEGA':         { pts: 1553, en: 'Norway' },
  'AUSTRALIA':       { pts: 1535, en: 'Australia' },
  'ARGELIA':         { pts: 1521, en: 'Algeria' },
  'EGITO':           { pts: 1518, en: 'Egypt' },
  'TUNISIA':         { pts: 1503, en: 'Tunisia' },
  'COSTA DO MARFIM': { pts: 1496, en: 'Ivory Coast' },
  'ESCOCIA':         { pts: 1484, en: 'Scotland' },
  'ESCOCIA/SCT':     { pts: 1484, en: 'Scotland' },
  'PARAGUAI':        { pts: 1475, en: 'Paraguay' },
  'CANADA':          { pts: 1465, en: 'Canada' },
  'SUECIA':          { pts: 1436, en: 'Sweden' },
  'CABO VERDE':      { pts: 1420, en: 'Cape Verde' },
  'ARABIA SAUDITA':  { pts: 1418, en: 'Saudi Arabia' },
  'IRAQUE':          { pts: 1413, en: 'Iraq' },
  'CONGO':           { pts: 1395, en: 'DR Congo' },
  'PANAMA':          { pts: 1390, en: 'Panama' },
  'JORDANIA':        { pts: 1380, en: 'Jordan' },
  'UZBEQUISTAO':     { pts: 1370, en: 'Uzbekistan' },
  'CURACAO':         { pts: 1305, en: 'Curacao' },
  'HAITI':           { pts: 1289, en: 'Haiti' },
  'NOVA ZELANDIA':   { pts: 1280, en: 'New Zealand' },
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, headers || {}) }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('resposta nao-JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(9000, () => { req.destroy(); reject(new Error('timeout')); });
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
        if (res.statusCode >= 400) return reject(new Error(`Supabase ${res.statusCode} em ${table}: ${data.slice(0, 250)}`));
        try { resolve(data ? JSON.parse(data) : []); } catch { resolve([]); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Fator 1: FORÇA ───────────────────────────────────────────────────────────
// Seleções: pontos FIFA normalizados 1200–1900 -> 5–98

function forcaFifa(nomeCaixa) {
  const reg = FIFA[nomeCaixa.toUpperCase()];
  if (!reg) return null;
  const norm = (reg.pts - 1200) / (1900 - 1200) * 100;
  return Math.max(5, Math.min(98, Math.round(norm)));
}

// ─── Fator 2: FORMA (SofaScore) ───────────────────────────────────────────────

const SOFA_HEADERS = {
  'Accept': 'application/json',
  'Referer': 'https://www.sofascore.com/',
};

async function sofaBuscarTimeId(nomeBusca) {
  const url = `https://api.sofascore.com/api/v1/search/all?q=${encodeURIComponent(nomeBusca)}`;
  const data = await httpGet(url, SOFA_HEADERS);
  const results = data.results || [];
  // priorizar seleções nacionais de futebol
  const team = results.find(r =>
    r.type === 'team' && r.entity && r.entity.sport &&
    r.entity.sport.slug === 'football' && r.entity.national === true
  ) || results.find(r => r.type === 'team' && r.entity && r.entity.sport && r.entity.sport.slug === 'football');
  return team ? team.entity.id : null;
}

async function sofaFormaRecente(teamId) {
  const url = `https://api.sofascore.com/api/v1/team/${teamId}/events/last/0`;
  const data = await httpGet(url, SOFA_HEADERS);
  const eventos = (data.events || [])
    .filter(e => e.status && e.status.type === 'finished')
    .slice(-5);

  if (eventos.length === 0) return null;

  let pontos = 0;
  const sequencia = [];
  for (const e of eventos) {
    const isHome = e.homeTeam.id === teamId;
    const gf = isHome ? e.homeScore.current : e.awayScore.current;
    const ga = isHome ? e.awayScore.current : e.homeScore.current;
    if (gf > ga) { pontos += 3; sequencia.push('V'); }
    else if (gf === ga) { pontos += 1; sequencia.push('E'); }
    else sequencia.push('D');
  }
  // 0–15 pontos -> 0–100
  const forma = Math.round(pontos / (eventos.length * 3) * 100);
  return { forma, sequencia: sequencia.join(''), jogos: eventos.length };
}

// ─── Fator 2b: FORMA (API-Futebol, clubes BR) ─────────────────────────────────

async function apiFutebolForma(apiFutebolId) {
  if (!API_FUTEBOL_TOKEN || !apiFutebolId) return null;
  // Brasileirão Série A = campeonato 10 na API-Futebol
  const url = `https://api.api-futebol.com.br/v1/campeonatos/10/tabela`;
  const data = await httpGet(url, { 'Authorization': `Bearer ${API_FUTEBOL_TOKEN}` });
  if (!Array.isArray(data)) return null;
  const linha = data.find(t => t.time && t.time.time_id === apiFutebolId);
  if (!linha || !linha.ultimos_jogos) return null;
  let pontos = 0;
  linha.ultimos_jogos.forEach(r => {
    if (r === 'v') pontos += 3; else if (r === 'e') pontos += 1;
  });
  const forma = Math.round(pontos / (linha.ultimos_jogos.length * 3) * 100);
  return { forma, sequencia: linha.ultimos_jogos.join('').toUpperCase(), jogos: linha.ultimos_jogos.length };
}

// ─── Score composto com redistribuição de pesos ──────────────────────────────
// Pesos do modelo: forca 25 | forma 20 | competicao 20 | mando 15 | h2h 10 | motivacao 7 | odds 3
// Fatores indisponíveis têm o peso redistribuído proporcionalmente.

function scoreComposto(fatores) {
  const PESOS = { forca: 25, forma: 20, competicao: 20, mando: 15, h2h: 10, motivacao: 7, odds: 3 };
  let somaPeso = 0, somaValor = 0;
  const usados = {};
  for (const [k, peso] of Object.entries(PESOS)) {
    if (fatores[k] !== null && fatores[k] !== undefined) {
      somaPeso += peso;
      somaValor += fatores[k] * peso;
      usados[k] = fatores[k];
    }
  }
  if (somaPeso === 0) return { score: 50, usados };
  return { score: Math.round(somaValor / somaPeso), usados };
}

// ─── Poisson (idêntico ao admin) ──────────────────────────────────────────────

const FAT = [1];
for (let i = 1; i <= 12; i++) FAT[i] = FAT[i - 1] * i;
const pmf = (k, l) => Math.exp(-l) * Math.pow(l, k) / FAT[k];

function calcProbs(scoreCasa, scoreVisit) {
  const diff = (scoreCasa - scoreVisit) / 100;
  const lambdaCasa  = 1.40 * Math.exp(1.05 * diff);
  const lambdaVisit = 1.08 * Math.exp(-1.05 * diff);
  let p1 = 0, px = 0, p2 = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = pmf(i, lambdaCasa) * pmf(j, lambdaVisit);
    if (i > j) p1 += p; else if (i === j) px += p; else p2 += p;
  }
  const tot = p1 + px + p2;
  let i1 = Math.round(p1 / tot * 100);
  let ix = Math.round(px / tot * 100);
  let i2 = 100 - i1 - ix;
  if (i2 < 0) { ix += i2; i2 = 0; }
  return { p1: i1, px: ix, p2: i2, lambdaCasa: +lambdaCasa.toFixed(3), lambdaVisit: +lambdaVisit.toFixed(3) };
}

// Classifica pela probabilidade máxima (não pelo score absoluto):
// dois times fortes com scores 82x71 são um jogo EQUILIBRADO.
function classificar(probs, isClassico, isElim) {
  let pMax = Math.max(probs.p1, probs.px, probs.p2);
  if (isClassico) pMax -= 12;
  if (isElim) pMax -= 10;
  if (pMax >= 65) return 'facil';
  if (pMax >= 48) return 'medio';
  return 'dificil';
}

const sugerir = p => {
  const arr = [['coluna1', p.p1], ['empate', p.px], ['coluna2', p.p2]];
  arr.sort((a, b) => b[1] - a[1]);
  return arr[0][0];
};
const coberturaPorClasse = c => c === 'facil' ? 'simples' : c === 'medio' ? 'duplo' : 'triplo';

// ─── Análise por time (cache) ─────────────────────────────────────────────────

const cacheTime = {};

async function analisarTime(time) {
  const chave = time.id;
  if (cacheTime[chave]) return cacheTime[chave];

  const nomeCaixa = (time.nome_caixa || '').toUpperCase();
  const resultado = { nome: time.nome_popular || time.nome_caixa, forca: null, forma: null, formaSeq: null, fontes: [] };

  // 1. Força via FIFA (seleções)
  const fifa = forcaFifa(nomeCaixa);
  if (fifa !== null) {
    resultado.forca = fifa;
    resultado.fontes.push('fifa');
  }

  // 2. Forma via API-Futebol (clubes BR com id mapeado)
  if (time.api_futebol_id && API_FUTEBOL_TOKEN) {
    try {
      const af = await apiFutebolForma(time.api_futebol_id);
      if (af) {
        resultado.forma = af.forma;
        resultado.formaSeq = af.sequencia;
        resultado.fontes.push('api-futebol');
        if (resultado.forca === null) {
          // Sem FIFA: estimar força pela posição/forma (aproximação)
          resultado.forca = Math.min(85, 35 + Math.round(af.forma * 0.4));
        }
      }
      await sleep(700);
    } catch (e) { console.log(`      [api-futebol] ${resultado.nome}: ${e.message}`); }
  }

  // 3. Forma via SofaScore
  if (!SKIP_SOFA && resultado.forma === null) {
    try {
      let sofaId = time.sofascore_id;
      if (!sofaId) {
        const nomeBusca = (FIFA[nomeCaixa] && FIFA[nomeCaixa].en) || time.nome_popular || time.nome_caixa;
        sofaId = await sofaBuscarTimeId(nomeBusca);
        await sleep(700);
        if (sofaId) {
          // cachear no Supabase para próximas execuções
          await supabase('PATCH', 'times_mapeamento', { sofascore_id: sofaId }, { id: `eq.${time.id}` });
        }
      }
      if (sofaId) {
        const sf = await sofaFormaRecente(sofaId);
        await sleep(700);
        if (sf) {
          resultado.forma = sf.forma;
          resultado.formaSeq = sf.sequencia;
          resultado.fontes.push('sofascore');
        }
      }
    } catch (e) { console.log(`      [sofascore] ${resultado.nome}: ${e.message}`); }
  }

  cacheTime[chave] = resultado;
  return resultado;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`ANALISE AUTOMATICA — LOTECA CONCURSO ${NUMERO}`);
  console.log(`Fontes: FIFA embutido${API_FUTEBOL_TOKEN ? ' + API-Futebol' : ''}${SKIP_SOFA ? '' : ' + SofaScore'}`);
  console.log('='.repeat(70));

  try {
    // 1. Concurso
    const concursos = await supabase('GET', 'loteca_concursos', null, {
      numero: `eq.${NUMERO}`, select: 'id,numero,status_analise',
    });
    if (concursos.length === 0) throw new Error(`Concurso ${NUMERO} nao encontrado. Rode o coletor primeiro.`);
    const concurso = concursos[0];

    // 2. Jogos
    const jogos = await supabase('GET', 'loteca_jogos_analise', null, {
      concurso_id: `eq.${concurso.id}`, select: '*', order: 'ordem.asc',
    });
    if (jogos.length === 0) throw new Error('Nenhum jogo encontrado para este concurso.');
    console.log(`\n[1/3] ${jogos.length} jogos carregados.`);

    // 3. Times
    const timeIds = [...new Set(jogos.flatMap(j => [j.time_casa_id, j.time_visit_id]).filter(Boolean))];
    const times = await supabase('GET', 'times_mapeamento', null, {
      id: `in.(${timeIds.join(',')})`, select: 'id,nome_caixa,nome_popular,api_futebol_id,sofascore_id',
    });
    const timesById = {};
    times.forEach(t => { timesById[t.id] = t; });

    // 4. Analisar cada jogo
    console.log(`\n[2/3] Analisando jogos...\n`);
    let atualizados = 0, pulados = 0;

    for (const jogo of jogos) {
      const tc = timesById[jogo.time_casa_id];
      const tv = timesById[jogo.time_visit_id];
      if (!tc || !tv) { console.log(`  [J${jogo.ordem}] times nao mapeados — pulando`); pulados++; continue; }

      if (jogo.revisado_editor && !FORCE) {
        console.log(`  [J${String(jogo.ordem).padStart(2)}] ${tc.nome_popular} x ${tv.nome_popular} — REVISADO pelo editor, pulando (use --force)`);
        pulados++;
        continue;
      }

      const ac = await analisarTime(tc);
      const av = await analisarTime(tv);

      const compCasa  = scoreComposto({ forca: ac.forca, forma: ac.forma });
      const compVisit = scoreComposto({ forca: av.forca, forma: av.forma });

      const probs  = calcProbs(compCasa.score, compVisit.score);
      const classe = classificar(probs, jogo.is_classico, jogo.is_eliminatorio);
      const sug    = sugerir(probs);
      const cob    = coberturaPorClasse(classe);

      const resumoAuto = `${ac.nome} (${compCasa.score}) x ${av.nome} (${compVisit.score})` +
        (ac.formaSeq ? ` | forma: ${ac.formaSeq} vs ${av.formaSeq || '?'}` : '');

      await supabase('PATCH', 'loteca_jogos_analise', {
        score_casa: compCasa.score,
        score_visit: compVisit.score,
        score_breakdown_casa: JSON.stringify(compCasa.usados),
        score_breakdown_visit: JSON.stringify(compVisit.usados),
        p_coluna1: probs.p1, p_empate: probs.px, p_coluna2: probs.p2,
        lambda_casa: probs.lambdaCasa, lambda_visit: probs.lambdaVisit,
        classificacao: classe,
        resultado_sugerido: sug,
        cobertura: cob,
        justificativa: JSON.stringify({
          fontes_casa: ac.fontes, fontes_visit: av.fontes,
          forca_casa: ac.forca, forca_visit: av.forca,
          forma_casa: ac.forma, forma_visit: av.forma,
          forma_seq_casa: ac.formaSeq, forma_seq_visit: av.formaSeq,
          gerado_em: new Date().toISOString(),
          modo: 'automatico',
        }),
      }, { id: `eq.${jogo.id}` });

      const tag = classe === 'facil' ? 'FACIL  ' : classe === 'medio' ? 'MEDIO  ' : 'DIFICIL';
      console.log(`  [J${String(jogo.ordem).padStart(2)}] ${ac.nome.padEnd(18)} ${String(compCasa.score).padStart(3)} x ${String(compVisit.score).padStart(3).padEnd(4)} ${av.nome.padEnd(18)} | ${probs.p1}/${probs.px}/${probs.p2} | ${tag} -> ${cob}`);
      atualizados++;
    }

    // 5. Status do concurso -> rascunho (se ainda aguardando/coletando)
    if (['aguardando', 'coletando'].includes(concurso.status_analise)) {
      await supabase('PATCH', 'loteca_concursos', { status_analise: 'rascunho' }, { id: `eq.${concurso.id}` });
      console.log(`\n[3/3] Status do concurso atualizado para 'rascunho'.`);
    } else {
      console.log(`\n[3/3] Status mantido: '${concurso.status_analise}'.`);
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`CONCLUIDO — ${atualizados} jogos analisados, ${pulados} pulados.`);
    console.log(`Proximo passo: revisar no admin-loteca.html e publicar.`);
    console.log('='.repeat(70));

  } catch (err) {
    console.error(`\nERRO: ${err.message}`);
    process.exit(1);
  }
})();
