/**
 * loteca-analisar.js  (v2)
 * Análise automática da Loteca — Palpitiar
 *
 * Coleta dados externos e pré-preenche scores/probabilidades no Supabase.
 * O admin (admin-loteca.html) revisa e publica.
 *
 * Cada time é classificado automaticamente como seleção, clube BR ou clube
 * estrangeiro (tabela FIFA / sufixo "/UF" / demais) e usa o pipeline adequado:
 *
 *   Seleções          força = ranking FIFA embutido
 *   Clubes BR         força = posição na tabela Série A/B (API-Futebol)
 *   Clubes estrang.   força = estimada pela forma
 *   Todos             forma/mando = últimos 10 jogos (api-football → TheSportsDB → SofaScore)
 *                     H2H  = últimos 5 confrontos diretos (api-football)
 *                     odds = mercado pré-jogo (api-football) — blend 65% odds + 35% modelo
 *
 * Fatores por time: força 30 | forma 25 | mando 15 | h2h 10 | motivação 20 (manual, admin)
 * Fatores indisponíveis: peso redistribuído entre os disponíveis.
 *
 * Uso:
 *   node loteca-analisar.js 1255
 *   node loteca-analisar.js 1255 --force          (sobrescreve jogos revisados)
 *   node loteca-analisar.js 1255 --skip-sofascore (só FIFA/API-Futebol)
 *   node loteca-analisar.js 1255 --skip-odds      (não busca odds de mercado)
 *
 * Variáveis de ambiente:
 *   SUPABASE_KEY        = sb_secret_...   (obrigatória)
 *   API_FUTEBOL_LOTECA  = Bearer token    (opcional — clubes BR)
 *   APIFOOTBALL_KEY     = chave api-sports (opcional — forma/H2H/odds)
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const API_FUTEBOL_TOKEN = process.env.API_FUTEBOL_LOTECA || null;
const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN || null; // mantido para compatibilidade

const args = process.argv.slice(2);
const NUMERO = parseInt(args.find(a => /^\d+$/.test(a)), 10);
const FORCE = args.includes('--force');
const SKIP_SOFA = args.includes('--skip-sofascore');
const SKIP_ODDS = args.includes('--skip-odds');

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

// As chaves do dicionário FIFA são só ASCII ('FRANCA', 'BELGICA', 'ITALIA'...),
// mas os times são cadastrados com a grafia correta em português ("França",
// "Bélgica", "Itália"...). Sem remover os acentos aqui a busca falha calada
// para boa parte das seleções, que caem no ramo de "clube estrangeiro" e
// perdem força, forma, mando e H2H em cascata.
function normalizarPais(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function forcaFifa(nomeCaixa) {
  const reg = FIFA[normalizarPais(nomeCaixa)];
  if (!reg) return null;
  const norm = (reg.pts - 1200) / (1900 - 1200) * 100;
  return Math.max(5, Math.min(98, Math.round(norm)));
}

// ─── Fator 2: FORMA (api.football via RapidAPI — requer APIFOOTBALL_KEY) ────
// Free tier: 100 req/dia; cobre todos os jogos de selecoes incluindo amistosos
// Cadastro: https://rapidapi.com/api-sports/api/api-football

const APIFOOTBALL_KEY = process.env.APIFOOTBALL_KEY || null;
const AF2_DELAY = 1200; // 100 req/dia = nao ha limite de req/s, mas vamos ser conservadores
const AF2_CACHE_FILE = path.join(__dirname, '.af2-cache.json');
let af2Cache = {};
try { af2Cache = JSON.parse(fs.readFileSync(AF2_CACHE_FILE, 'utf8')); } catch { af2Cache = {}; }
function salvarAf2Cache() {
  try { fs.writeFileSync(AF2_CACHE_FILE, JSON.stringify(af2Cache, null, 2)); } catch {}
}

function normalizarNome(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

async function af2Get(pathUrl) {
  const url = `https://v3.football.api-sports.io${pathUrl}`;
  try {
    return await httpGet(url, {
      'x-rapidapi-key': APIFOOTBALL_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io',
    });
  } catch (e) {
    if (String(e.message).includes('429')) {
      console.log('      [api-football] rate limit — aguardando 60s...');
      await sleep(60000);
      return await httpGet(url, {
        'x-rapidapi-key': APIFOOTBALL_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io',
      });
    }
    throw e;
  }
}

// Busca candidatos por nome (até 2), correspondência exata primeiro.
// ehSelecao: prioriza type=national; ehClubeBr: filtra country=Brazil.
async function af2ResolverTimeCandidatos(nomeEn, ehSelecao, ehClubeBr) {
  const q = encodeURIComponent(nomeEn);
  const tentativas = ehSelecao
    ? [`/teams?name=${q}&type=national`, `/teams?search=${q}`]
    : ehClubeBr
      ? [`/teams?search=${q}&country=Brazil`, `/teams?search=${q}`]
      : [`/teams?name=${q}`, `/teams?search=${q}`];

  for (const url of tentativas) {
    const data = await af2Get(url);
    await sleep(AF2_DELAY);
    let times = (data.response || []);
    if (!ehSelecao) times = times.filter(t => !t.team.national);
    if (times.length === 0) continue;
    const alvo = normalizarNome(nomeEn);
    times.sort((a, b) => (normalizarNome(a.team.name) === alvo ? 0 : 1) - (normalizarNome(b.team.name) === alvo ? 0 : 1));
    return times.slice(0, 2).map(t => t.team.id);
  }
  return [];
}

// Checagem leve (last=5, sem fallback de temporada) — só para VALIDAR se um
// id candidato tem jogos de verdade, não para buscá-los de fato.
async function af2TemJogosRecentes(teamId) {
  try {
    const data = await af2Get(`/fixtures?team=${teamId}&last=5`);
    await sleep(AF2_DELAY);
    return (data.response || []).some(m => m.fixture.status && ['FT','AET','PEN'].includes(m.fixture.status.short));
  } catch { return false; }
}

// Resolve ID do time buscando por nome, validando que o candidato tem jogos
// de verdade antes de aceitar (cache local). Nomes como "Botafogo" ou "São
// Paulo" são ambíguos — a API pode retornar um clube homônimo menor/inativo
// em vez do time nacional conhecido; sem validação isso falha calado (o time
// "existe" mas nunca tem jogos, então forma/mando/H2H/odds ficam sempre vazios).
async function af2ResolverTimeId(nomeEn, ehSelecao, ehClubeBr) {
  const chave = (ehSelecao ? 'n:' : ehClubeBr ? 'br:' : 'c:') + normalizarNome(nomeEn);
  if (af2Cache[chave]) return af2Cache[chave];
  // compat: cache antigo de seleções sem prefixo
  if (ehSelecao && af2Cache[normalizarNome(nomeEn)]) return af2Cache[normalizarNome(nomeEn)];

  const candidatos = await af2ResolverTimeCandidatos(nomeEn, ehSelecao, ehClubeBr);
  if (candidatos.length === 0) return null;

  for (const id of candidatos) {
    if (await af2TemJogosRecentes(id)) {
      af2Cache[chave] = id;
      salvarAf2Cache();
      return id;
    }
  }
  // Nenhum candidato validado — usa o primeiro mesmo assim (não piora o que já
  // tínhamos), mas não cacheia, para tentar de novo numa próxima execução.
  return candidatos[0];
}

// Ultimos 10 jogos finalizados do time (5 para forma; todos para mando casa/fora)
// Tenta: last=10 sem season; se vazio tenta season atual e anterior
async function af2UltimosJogos(teamId) {
  const anoAtual = new Date().getFullYear();
  const tentativas = [
    `/fixtures?team=${teamId}&last=10`,
    `/fixtures?team=${teamId}&season=${anoAtual}&status=FT`,
    `/fixtures?team=${teamId}&season=${anoAtual - 1}&status=FT`,
  ];

  for (const url of tentativas) {
    const data = await af2Get(url);
    await sleep(AF2_DELAY);
    const todos = (data.response || [])
      .filter(m => m.fixture.status && ['FT','AET','PEN'].includes(m.fixture.status.short))
      .sort((a, b) => String(b.fixture.date).localeCompare(String(a.fixture.date)))
      .slice(0, 10);
    if (todos.length === 0) continue;
    return todos.map(m => {
      const isHome = m.teams.home.id === teamId;
      const gf = isHome ? m.goals.home : m.goals.away;
      const gc = isHome ? m.goals.away : m.goals.home;
      const adv = isHome ? m.teams.away.name : m.teams.home.name;
      if (!Number.isFinite(gf) || !Number.isFinite(gc)) return null;
      return { gf, gc, adv, casa: isHome, r: gf > gc ? 'V' : gf === gc ? 'E' : 'D', data: String(m.fixture.date).slice(0, 10) };
    }).filter(Boolean);
  }
  return [];
}

// ─── Fator MANDO: aproveitamento específico casa/fora ────────────────────────
// Para o mandante: só jogos em casa; para o visitante: só jogos fora.
// Regressão à média por tamanho de amostra (poucos jogos → encolhe para 50).
function mandoDeUltimos(jogos, emCasa) {
  const rel = (jogos || []).filter(j => j.casa === emCasa);
  if (rel.length === 0) return null;
  let pts = 0;
  rel.forEach(j => { if (j.r === 'V') pts += 3; else if (j.r === 'E') pts += 1; });
  const apr = pts / (rel.length * 3) * 100;
  const conf = Math.sqrt(Math.min(rel.length, 5) / 5);
  return Math.round(50 + (apr - 50) * conf);
}

// ─── Fator H2H: últimos 5 confrontos diretos (api-football) ──────────────────
// Retorna { casa, visit } em 0-100 (V=100, E=50, D=0, regressão à média).
async function af2H2H(idCasa, idVisit) {
  const data = await af2Get(`/fixtures/headtohead?h2h=${idCasa}-${idVisit}&last=5`);
  await sleep(AF2_DELAY);
  const jogos = (data.response || [])
    .filter(m => m.fixture.status && ['FT','AET','PEN'].includes(m.fixture.status.short));
  if (jogos.length === 0) return null;
  let soma = 0;
  jogos.forEach(m => {
    const golsCasaTime = m.teams.home.id === idCasa ? m.goals.home : m.goals.away;
    const golsVisitTime = m.teams.home.id === idCasa ? m.goals.away : m.goals.home;
    soma += golsCasaTime > golsVisitTime ? 100 : golsCasaTime === golsVisitTime ? 50 : 0;
  });
  const apr = soma / jogos.length;
  const conf = Math.sqrt(jogos.length / 5);
  const casa = Math.round(50 + (apr - 50) * conf);
  return { casa, visit: 100 - casa, jogos: jogos.length };
}

// ─── ODDS de mercado (api-football) ───────────────────────────────────────────
// Busca o próximo confronto entre os dois times e as odds "Match Winner".
// Retorna probabilidades implícitas SEM o vig (normalizado), média das casas.
async function af2OddsProximoJogo(idCasa, idVisit) {
  const fx = await af2Get(`/fixtures/headtohead?h2h=${idCasa}-${idVisit}&next=1`);
  await sleep(AF2_DELAY);
  const fixture = (fx.response || [])[0];
  if (!fixture) return null;

  const od = await af2Get(`/odds?fixture=${fixture.fixture.id}&bet=1`);
  await sleep(AF2_DELAY);
  const resp = (od.response || [])[0];
  if (!resp) return null;

  let sH = 0, sD = 0, sA = 0, n = 0;
  (resp.bookmakers || []).forEach(bk => {
    const bet = (bk.bets || []).find(b => b.id === 1 || /match winner/i.test(b.name || ''));
    if (!bet) return;
    const vh = (bet.values || []).find(v => v.value === 'Home');
    const vd = (bet.values || []).find(v => v.value === 'Draw');
    const va = (bet.values || []).find(v => v.value === 'Away');
    if (!vh || !vd || !va) return;
    const oh = parseFloat(vh.odd), od2 = parseFloat(vd.odd), oa = parseFloat(va.odd);
    if (!(oh > 1 && od2 > 1 && oa > 1)) return;
    sH += 1 / oh; sD += 1 / od2; sA += 1 / oa; n++;
  });
  if (n === 0) return null;

  let h = sH / n, d = sD / n, a = sA / n;
  // O fixture pode estar com mando invertido em relação à grade da Loteca
  if (fixture.teams.home.id !== idCasa) { const t = h; h = a; a = t; }
  const tot = h + d + a;
  return {
    p1: h / tot * 100, px: d / tot * 100, p2: a / tot * 100,
    casas: n, fixtureId: fixture.fixture.id,
    dataJogo: String(fixture.fixture.date).slice(0, 10),
  };
}

// Blend final: 65% odds de mercado + 35% modelo (inteiros somando 100)
function blendComOdds(probsModelo, odds) {
  const w = 0.65;
  const b1 = w * odds.p1 + (1 - w) * probsModelo.p1;
  const bx = w * odds.px + (1 - w) * probsModelo.px;
  const b2 = w * odds.p2 + (1 - w) * probsModelo.p2;
  const tot = b1 + bx + b2;
  let i1 = Math.round(b1 / tot * 100);
  let ix = Math.round(bx / tot * 100);
  let i2 = 100 - i1 - ix;
  if (i2 < 0) { ix += i2; i2 = 0; }
  return Object.assign({}, probsModelo, { p1: i1, px: ix, p2: i2, comOdds: true });
}

// Mescla listas de jogos de varias fontes (dedup por data), mais recentes primeiro
function mesclarUltimos(listas) {
  const vistos = new Set();
  const out = [];
  // ordenar tudo por data desc (itens sem data vao ao final na ordem original)
  const todos = [].concat(...listas);
  todos.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  for (const u of todos) {
    const k = u.data ? 'd' + u.data : 'x' + (u.adv || '') + u.gf + 'x' + u.gc;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(u);
    if (out.length === 5) break;
  }
  return out;
}

// ─── Fator 2b: FORMA (TheSportsDB — sem autenticacao, free = 1 evento) ───────
// API gratuita: https://www.thesportsdb.com/api.php  (key publica '123')

const TSDB_KEY = process.env.THESPORTSDB_KEY || '123';
const TSDB_DELAY = 2200;   // free tier: ~30 req/min -> 1 req a cada 2,2s
const TSDB_CACHE_FILE = path.join(__dirname, '.tsdb-cache.json');

// Cache local de IDs (elimina a busca por nome nas proximas execucoes)
let tsdbCache = {};
try { tsdbCache = JSON.parse(fs.readFileSync(TSDB_CACHE_FILE, 'utf8')); } catch { tsdbCache = {}; }
function salvarTsdbCache() {
  try { fs.writeFileSync(TSDB_CACHE_FILE, JSON.stringify(tsdbCache, null, 2)); } catch {}
}

// GET com retry automatico em 429 (rate limit): espera 20s e tenta de novo
async function tsdbGet(url, headers) {
  try {
    return await httpGet(url, headers);
  } catch (e) {
    if (String(e.message).includes('429')) {
      console.log('      [thesportsdb] rate limit — aguardando 20s...');
      await sleep(20000);
      return await httpGet(url, headers);
    }
    throw e;
  }
}

async function tsdbBuscarTimeId(nomeEn) {
  const chave = nomeEn.toLowerCase();
  if (tsdbCache[chave]) return tsdbCache[chave];

  const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/searchteams.php?t=${encodeURIComponent(nomeEn)}`;
  const data = await tsdbGet(url);
  const teams = (data.teams || []).filter(t => t.strSport === 'Soccer');
  const exato = teams.find(t => (t.strTeam || '').toLowerCase() === nomeEn.toLowerCase());
  const time = exato || teams[0];
  if (time) {
    tsdbCache[chave] = time.idTeam;
    salvarTsdbCache();
  }
  return time ? time.idTeam : null;
}

// Forma ponderada: 70% resultados (V=3,E=1) + 30% eficiencia de gols
// Eficiencia = 50 + saldo medio de gols por jogo * 12.5 (clamp 0-100)
function formaComGols(ultimos5) {
  const v = (ultimos5 || []).filter(u => Number.isFinite(u.gf) && Number.isFinite(u.gc));
  if (v.length === 0) return null;
  let pts = 0, gp = 0, gc = 0;
  v.forEach(u => {
    if (u.gf > u.gc) pts += 3; else if (u.gf === u.gc) pts += 1;
    gp += u.gf; gc += u.gc;
  });
  const fRes  = pts / (v.length * 3) * 100;
  const saldo = (gp - gc) / v.length;
  const fGols = Math.max(0, Math.min(100, 50 + saldo * 12.5));
  const bruta = 0.7 * fRes + 0.3 * fGols;
  // Regressao a media por tamanho de amostra: com poucos jogos a forma
  // encolhe na direcao de 50 (n=1 -> 45% do desvio; n=5 -> 100%)
  const confianca = Math.sqrt(v.length / 5);
  return Math.round(50 + (bruta - 50) * confianca);
}

async function tsdbFormaRecente(teamId) {
  // v2: ate 10 eventos passados (header X-API-KEY); fallback v1: 5 eventos
  let eventos = [];
  try {
    const v2 = await tsdbGet(
      `https://www.thesportsdb.com/api/v2/json/schedule/previous/team/${teamId}`,
      { 'X-API-KEY': TSDB_KEY }
    );
    eventos = v2.schedule || v2.events || [];
  } catch (e) { /* cai no v1 */ }

  if (eventos.length === 0) {
    const v1 = await tsdbGet(`https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventslast.php?id=${teamId}`);
    eventos = v1.results || [];
  }

  // Apenas eventos finalizados com placar; mais recentes primeiro; max 5
  const comPlacar = eventos
    .filter(e => e.intHomeScore !== null && e.intHomeScore !== undefined && e.intHomeScore !== '')
    .sort((a, b) => String(b.dateEvent || '').localeCompare(String(a.dateEvent || '')))
    .slice(0, 5);
  if (comPlacar.length === 0) return null;

  const seq = [];
  const ultimos5 = [];
  for (const e of comPlacar) {
    const isHome = String(e.idHomeTeam) === String(teamId);
    const gf = parseInt(isHome ? e.intHomeScore : e.intAwayScore, 10);
    const gc = parseInt(isHome ? e.intAwayScore : e.intHomeScore, 10);
    const adv = isHome ? e.strAwayTeam : e.strHomeTeam;
    const r = gf > gc ? 'V' : gf === gc ? 'E' : 'D';
    seq.push(r);
    ultimos5.push({ gf, gc, adv, r, casa: isHome, data: e.dateEvent || null });
  }
  const forma = formaComGols(ultimos5);
  return { forma, sequencia: seq.join(''), jogos: comPlacar.length, ultimos5 };
}

// ─── Fator 2b: FORMA (SofaScore — fallback) ──────────────────────────────────

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
  const ultimos5 = [];
  for (const e of eventos) {
    const isHome = e.homeTeam.id === teamId;
    const gf = isHome ? e.homeScore.current : e.awayScore.current;
    const ga = isHome ? e.awayScore.current : e.homeScore.current;
    const adv = isHome ? e.awayTeam.name : e.homeTeam.name;
    let r;
    if (gf > ga) { pontos += 3; r = 'V'; }
    else if (gf === ga) { pontos += 1; r = 'E'; }
    else r = 'D';
    sequencia.push(r);
    ultimos5.push({ gf, gc: ga, adv, r, casa: isHome });
  }
  ultimos5.reverse(); // mais recente primeiro
  const forma = formaComGols(ultimos5);
  return { forma, sequencia: sequencia.join(''), jogos: eventos.length, ultimos5 };
}

// ─── Clubes BR: força pela posição na tabela + forma (API-Futebol) ────────────
// Série A = campeonato 10, Série B = campeonato 14. Tabelas cacheadas por execução.

const apiFutTabelaCache = {};
async function apiFutebolTabela(campId) {
  if (apiFutTabelaCache[campId] !== undefined) return apiFutTabelaCache[campId];
  try {
    const data = await httpGet(`https://api.api-futebol.com.br/v1/campeonatos/${campId}/tabela`,
      { 'Authorization': `Bearer ${API_FUTEBOL_TOKEN}` });
    apiFutTabelaCache[campId] = Array.isArray(data) ? data : null;
  } catch { apiFutTabelaCache[campId] = null; }
  return apiFutTabelaCache[campId];
}

// apiFutebolId: usado quando já mapeado (rápido, exato). nomeBusca: fallback
// por nome normalizado quando o time ainda não tem id salvo em
// times_mapeamento — comum para times que nunca apareceram num concurso
// antes. Sem esse fallback, todo time novo perdia a força "posição na
// tabela" e caía direto na estimativa (menos precisa) via forma.
async function apiFutebolClube(apiFutebolId, nomeBusca) {
  if (!API_FUTEBOL_TOKEN) return null;
  // Escala de força alinhada à referência do admin (Série A 1º ≈ 88; Série B 1º ≈ 62)
  const series = [
    { camp: 10, letra: 'A', base: 88, passo: 1.8 },
    { camp: 14, letra: 'B', base: 62, passo: 1.5 },
  ];
  const alvo = nomeBusca ? normalizarNome(nomeBusca) : null;
  for (const s of series) {
    const tabela = await apiFutebolTabela(s.camp);
    if (!tabela) continue;
    let linha = apiFutebolId ? tabela.find(t => t.time && t.time.time_id === apiFutebolId) : null;
    if (!linha && alvo) {
      linha = tabela.find(t => t.time && normalizarNome(t.time.nome_popular || t.time.nome || '') === alvo);
    }
    if (!linha) continue;
    let forma = null, sequencia = null;
    if (Array.isArray(linha.ultimos_jogos) && linha.ultimos_jogos.length > 0) {
      let pontos = 0;
      linha.ultimos_jogos.forEach(r => { if (r === 'v') pontos += 3; else if (r === 'e') pontos += 1; });
      forma = Math.round(pontos / (linha.ultimos_jogos.length * 3) * 100);
      sequencia = linha.ultimos_jogos.join('').toUpperCase();
    }
    const forca = Math.round(Math.max(20, s.base - ((linha.posicao || 10) - 1) * s.passo));
    return {
      forca, forma, sequencia, posicao: linha.posicao, serie: s.letra,
      timeIdEncontrado: linha.time && linha.time.time_id,
    };
  }
  return null;
}

// ─── Score composto com redistribuição de pesos ──────────────────────────────
// Pesos v2: forca 30 | forma 25 | mando 15 | h2h 10 | motivacao 20 (manual, admin)
// "Competição" saiu dos fatores de time (é atributo do jogo — já tratado em
// classificar() via is_eliminatorio). Odds saíram dos fatores: viram blend
// direto nas probabilidades finais (blendComOdds).
// Fatores indisponíveis têm o peso redistribuído proporcionalmente.

function scoreComposto(fatores) {
  const PESOS = { forca: 30, forma: 25, mando: 15, h2h: 10, motivacao: 20 };
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
  const resultado = {
    nome: time.nome_popular || time.nome_caixa,
    tipo: null, af2Id: null,
    forca: null, forma: null, formaSeq: null,
    ultimos5: [], ultimosRaw: [], fontes: [],
  };

  // Tipo do time: seleção (tabela FIFA) > clube BR (sufixo /UF ou pais) > clube estrangeiro
  const fifa = FIFA[normalizarPais(nomeCaixa)];
  if (fifa) resultado.tipo = 'selecao';
  else if (/\/[A-Z]{2}$/.test(nomeCaixa) || time.pais === 'Brasil') resultado.tipo = 'clube_br';
  else resultado.tipo = 'clube_ext';

  // Nome para busca em APIs internacionais (clube BR sem o sufixo /UF)
  const nomeBusca = resultado.tipo === 'selecao'
    ? fifa.en
    : (time.nome_popular || time.nome_caixa).replace(/\/[A-Z]{2}$/, '').trim();

  // 1. Força
  if (resultado.tipo === 'selecao') {
    resultado.forca = forcaFifa(nomeCaixa);
    resultado.fontes.push('fifa');
  } else if (resultado.tipo === 'clube_br' && API_FUTEBOL_TOKEN) {
    try {
      const af = await apiFutebolClube(time.api_futebol_id, nomeBusca);
      if (af) {
        resultado.forca = af.forca;
        if (af.forma !== null) { resultado.forma = af.forma; resultado.formaSeq = af.sequencia; }
        resultado.fontes.push(`api-futebol:${af.posicao}º-serie-${af.serie}`);
        console.log(`      [api-futebol] ${resultado.nome}: ${af.posicao}º Série ${af.serie} — força ${af.forca}`);
        // Time resolvido só pelo nome (sem id salvo): grava o id para
        // acelerar e tornar exatas as próximas execuções.
        if (!time.api_futebol_id && af.timeIdEncontrado) {
          try { await supabase('PATCH', 'times_mapeamento', { api_futebol_id: af.timeIdEncontrado }, { id: `eq.${time.id}` }); }
          catch (e) { console.log(`      [api-futebol] falha ao salvar id: ${e.message}`); }
        }
      }
      await sleep(700);
    } catch (e) { console.log(`      [api-futebol] ${resultado.nome}: ${e.message}`); }
  }

  // 2. ID no api-football (usado por forma, mando, H2H e odds)
  if (APIFOOTBALL_KEY) {
    try {
      resultado.af2Id = await af2ResolverTimeId(nomeBusca, resultado.tipo === 'selecao', resultado.tipo === 'clube_br');
      if (!resultado.af2Id) console.log(`      [api-football] ${resultado.nome}: time nao encontrado`);
    } catch (e) { console.log(`      [api-football] ${resultado.nome}: ${e.message}`); }
  }

  // 3. Últimos jogos via api-football (forma se ainda faltar + mando casa/fora)
  if (resultado.af2Id) {
    try {
      const jogos = await af2UltimosJogos(resultado.af2Id);
      if (jogos.length > 0) {
        resultado.ultimosRaw = jogos;
        if (resultado.ultimos5.length === 0) resultado.ultimos5 = jogos.slice(0, 5);
        if (resultado.forma === null) {
          resultado.forma = formaComGols(jogos.slice(0, 5));
          resultado.formaSeq = jogos.slice(0, 5).map(j => j.r).join('');
        }
        resultado.fontes.push('api-football');
        console.log(`      [api-football] ${resultado.nome}: ${jogos.length} jogo(s) — ${jogos.slice(0,5).map(j=>j.r).join('')}`);
      } else {
        console.log(`      [api-football] ${resultado.nome}: sem jogos recentes`);
      }
    } catch (e) { console.log(`      [api-football] ${resultado.nome}: ${e.message}`); }
  }

  // 4. Fallbacks de forma (TheSportsDB, SofaScore) se ainda sem forma
  if (resultado.forma === null) {
    const coletas = [];

    try {
      const tsdbId = await tsdbBuscarTimeId(nomeBusca);
      await sleep(TSDB_DELAY);
      if (tsdbId) {
        const tf = await tsdbFormaRecente(tsdbId);
        await sleep(TSDB_DELAY);
        if (tf && tf.ultimos5.length > 0) {
          coletas.push(tf.ultimos5);
          resultado.fontes.push('thesportsdb');
        }
      }
    } catch (e) { console.log(`      [thesportsdb] ${resultado.nome}: ${e.message}`); }

    if (!SKIP_SOFA && coletas.length === 0) {
      try {
        let sofaId = time.sofascore_id;
        if (!sofaId) {
          sofaId = await sofaBuscarTimeId(nomeBusca);
          await sleep(700);
          if (sofaId) {
            await supabase('PATCH', 'times_mapeamento', { sofascore_id: sofaId }, { id: `eq.${time.id}` });
          }
        }
        if (sofaId) {
          const sf = await sofaFormaRecente(sofaId);
          await sleep(700);
          if (sf && sf.ultimos5.length > 0) {
            coletas.push(sf.ultimos5);
            resultado.fontes.push('sofascore');
          }
        }
      } catch (e) { console.log(`      [sofascore] ${resultado.nome}: ${e.message}`); }
    }

    if (coletas.length > 0) {
      const merge = mesclarUltimos(coletas);
      resultado.ultimos5 = merge;
      // Mando só é sinal independente da forma quando a amostra é grande o
      // bastante pra ter jogos em casa E fora pra separar. Com 1-3 jogos
      // (comum no fallback TheSportsDB/SofaScore), "mando" e "forma" viravam
      // literalmente o mesmo dado — fingindo ser um fator novo sem ser.
      // Abaixo do mínimo, deixa ultimosRaw vazio: mandoDeUltimos volta null
      // e o peso é redistribuído honestamente entre os fatores disponíveis.
      const MIN_JOGOS_PARA_MANDO = 4;
      if (resultado.ultimosRaw.length === 0 && merge.length >= MIN_JOGOS_PARA_MANDO) {
        resultado.ultimosRaw = merge;
      }
      resultado.forma = formaComGols(merge);
      resultado.formaSeq = merge.map(u => u.r).join('');
      console.log(`      [forma] ${resultado.nome}: ${merge.length} jogo(s) — ${resultado.formaSeq} — forma ${resultado.forma}${merge.length < MIN_JOGOS_PARA_MANDO ? ' (amostra pequena demais p/ mando)' : ''}`);
    }
  }

  // 5. Clube sem força definida: estimar pela forma
  if (resultado.forca === null && resultado.forma !== null) {
    resultado.forca = Math.min(85, 35 + Math.round(resultado.forma * 0.4));
  }

  cacheTime[chave] = resultado;
  return resultado;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`ANALISE AUTOMATICA v2 — LOTECA CONCURSO ${NUMERO}`);
  const fontes = ['FIFA embutido (selecoes)'];
  if (API_FUTEBOL_TOKEN) fontes.push('API-Futebol (tabela Serie A/B)');
  if (APIFOOTBALL_KEY) fontes.push('api-football (forma+mando+H2H' + (SKIP_ODDS ? '' : '+odds') + ')');
  else if (FD_TOKEN) fontes.push('football-data.org (legado)');
  fontes.push('TheSportsDB');
  if (!SKIP_SOFA) fontes.push('SofaScore (fallback)');
  console.log(`Fontes: ${fontes.join(' + ')}`);
  if (!APIFOOTBALL_KEY) console.log(`DICA: defina APIFOOTBALL_KEY para ate 5 jogos/time incluindo amistosos`);
  if (!APIFOOTBALL_KEY) console.log(`      Cadastro gratis: https://dashboard.api-football.com/register`);
  console.log(`Rate limits: execucao completa pode levar ${FD_TOKEN ? '~4-5 min' : '~2 min'} na primeira vez (caches aceleram as proximas)`);
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
      id: `in.(${timeIds.join(',')})`, select: 'id,nome_caixa,nome_popular,pais,api_futebol_id,sofascore_id',
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

      // Mando específico: aproveitamento do mandante em casa e do visitante fora
      const mandoCasa = mandoDeUltimos(ac.ultimosRaw, true);
      const mandoFora = mandoDeUltimos(av.ultimosRaw, false);

      // H2H: últimos confrontos diretos
      let h2h = null;
      if (ac.af2Id && av.af2Id) {
        try { h2h = await af2H2H(ac.af2Id, av.af2Id); }
        catch (e) { console.log(`      [h2h] ${e.message}`); }
      }

      const compCasa  = scoreComposto({ forca: ac.forca, forma: ac.forma, mando: mandoCasa, h2h: h2h ? h2h.casa : null });
      const compVisit = scoreComposto({ forca: av.forca, forma: av.forma, mando: mandoFora, h2h: h2h ? h2h.visit : null });

      let probs = calcProbs(compCasa.score, compVisit.score);

      // Odds de mercado: blend 65% odds + 35% modelo
      let odds = null;
      if (!SKIP_ODDS && ac.af2Id && av.af2Id) {
        try { odds = await af2OddsProximoJogo(ac.af2Id, av.af2Id); }
        catch (e) { console.log(`      [odds] ${e.message}`); }
      }
      if (odds) probs = blendComOdds(probs, odds);

      const classe = classificar(probs, jogo.is_classico, jogo.is_eliminatorio);
      const sug    = sugerir(probs);
      const cob    = coberturaPorClasse(classe);

      await supabase('PATCH', 'loteca_jogos_analise', {
        score_casa: compCasa.score,
        score_visit: compVisit.score,
        score_breakdown_casa: JSON.stringify(compCasa.usados),
        score_breakdown_visit: JSON.stringify(compVisit.usados),
        fatores_casa:  JSON.stringify({ fatores: compCasa.usados,  ultimos5: ac.ultimos5 || [] }),
        fatores_visit: JSON.stringify({ fatores: compVisit.usados, ultimos5: av.ultimos5 || [] }),
        p_coluna1: probs.p1, p_empate: probs.px, p_coluna2: probs.p2,
        lambda_casa: probs.lambdaCasa, lambda_visit: probs.lambdaVisit,
        classificacao: classe,
        resultado_sugerido: sug,
        cobertura: cob,
        justificativa: JSON.stringify({
          fontes_casa: ac.fontes, fontes_visit: av.fontes,
          tipo_casa: ac.tipo, tipo_visit: av.tipo,
          forca_casa: ac.forca, forca_visit: av.forca,
          forma_casa: ac.forma, forma_visit: av.forma,
          forma_seq_casa: ac.formaSeq, forma_seq_visit: av.formaSeq,
          mando_casa: mandoCasa, mando_fora: mandoFora,
          h2h: h2h,
          odds: odds ? { p1: +odds.p1.toFixed(1), px: +odds.px.toFixed(1), p2: +odds.p2.toFixed(1), casas: odds.casas, data_jogo: odds.dataJogo } : null,
          gerado_em: new Date().toISOString(),
          modo: 'automatico-v2',
        }),
      }, { id: `eq.${jogo.id}` });

      const tag = classe === 'facil' ? 'FACIL  ' : classe === 'medio' ? 'MEDIO  ' : 'DIFICIL';
      const mkOdds = odds ? ` [odds:${odds.casas}]` : '';
      console.log(`  [J${String(jogo.ordem).padStart(2)}] ${ac.nome.padEnd(18)} ${String(compCasa.score).padStart(3)} x ${String(compVisit.score).padStart(3).padEnd(4)} ${av.nome.padEnd(18)} | ${probs.p1}/${probs.px}/${probs.p2}${mkOdds} | ${tag} -> ${cob}`);
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