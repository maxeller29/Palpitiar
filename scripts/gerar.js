/**
 * Palpitiar — Geração Automática de Combinações
 * Replica EXATAMENTE os algoritmos de lotofacil.html, mega-sena.html, quina.html,
 * lotomania.html, timemania.html, dupla-sena.html e diadesorte.html.
 * Roda via GitHub Actions — sem browser, sem computador ligado.
 *
 * Regras:
 *  - Lotofácil:    gera 1000 combinações (seg–sáb, roda sempre)
 *  - Quina:        gera 1000 combinações (seg–sáb, roda sempre)
 *  - Mega-Sena:    gera 1000 combinações SOMENTE se houver sorteio hoje
 *  - Lotomania:    gera 1000 combinações SOMENTE se houver sorteio hoje (seg/qua/sex)
 *  - Timemania:    gera 1000 combinações SOMENTE se houver sorteio hoje (ter/qui/sáb)
 *  - Dupla Sena:   gera 1000 combinações SOMENTE se houver sorteio hoje (seg/qua/sex)
 *  - Dia de Sorte: gera 1000 combinações SOMENTE se houver sorteio hoje (ter/qui/sáb)
 *
 * As 4 novas loterias usam checagem de "sorteio hoje" via API (mesmo padrão da Mega-Sena)
 * em vez de dia da semana fixo, pois a Caixa já alterou esses calendários antes e pode
 * alterar de novo — checar dataProximoConcurso é auto-ajustável.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const META_LOTOFACIL  = 1000;
const META_QUINA      = 1000;
const META_MEGASENA   = 1000;
const META_LOTOMANIA  = 1000;
const META_TIMEMANIA  = 1000;
const META_DUPLASENA  = 1000;
const META_DIADESORTE = 1000;
const META_MILIONARIA = 1000;
const LOTE            = 50;   // inserções por vez no Supabase (igual ao site)

// ─── SUPABASE ────────────────────────────────────────────────────────────────

const sb = {
  async req(method, table, body = null, params = '') {
    const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
    const h = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    };
    if (method === 'POST' || method === 'PATCH') h['Prefer'] = 'return=representation';
    const res = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`[${method} ${table}] ${await res.text()}`);
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  },
  insert: (t, d)    => sb.req('POST',   t, d),
  select: (t, p='') => sb.req('GET',    t, null, p),
  update: (t, d, p) => sb.req('PATCH',  t, d, p),
};

// ─── API CAIXA ───────────────────────────────────────────────────────────────

async function buscarUltimoConcurso(slug) {
  const r = await fetch(
    `https://servicebus2.caixa.gov.br/portaldeloterias/api/${slug}/`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ─── SALVAR NO SUPABASE (igual ao lotoia-db.js) ───────────────────────────────

async function salvarCombinacoes(cartoes, loteria, concurso, dezenasPorCartao, estrategia) {
  // Busca existentes para deduplicação
  const existentes = await sb.select('combinacoes',
    `?loteria=eq.${loteria}&concurso=eq.${concurso}&status=eq.pendente&select=dezenas`
  ).catch(() => []);
  const jaExistem = new Set((existentes || []).map(e => JSON.stringify([...e.dezenas].sort((a,b)=>a-b))));

  const rows = cartoes
    .map(c => ({
      loteria, concurso,
      dezenas: c.dezenas,
      // Trevos só existem na +Milionária; nas demais loterias c.trevos é undefined -> null.
      trevos: c.trevos || null,
      dezenas_por_cartao: dezenasPorCartao,
      estrategia,
      status: 'pendente',
    }))
    .filter(r => !jaExistem.has(JSON.stringify([...r.dezenas].sort((a,b)=>a-b))));

  if (rows.length === 0) return 0;

  // Insere em lotes de 50
  const lotes = chunk(rows, LOTE);
  for (const lote of lotes) {
    await sb.insert('combinacoes', lote);
    await sleep(200);
  }

  // Atualiza contador histórico
  try {
    const atual = await sb.select('contadores_gerados', `?loteria=eq.${loteria}`);
    if (atual?.length) {
      await sb.update('contadores_gerados',
        { total: (parseInt(atual[0].total) || 0) + rows.length, atualizado_em: new Date().toISOString() },
        `?loteria=eq.${loteria}`
      );
    }
  } catch(e) { console.warn('Contador err:', e.message); }

  return rows.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOTOFÁCIL — algoritmo idêntico ao lotofacil.html
// Universo: 1–25, aposta mínima 15 dezenas
// ═══════════════════════════════════════════════════════════════════════════════

const LF = {
  UNIVERSO: 25,
  DEZ_MIN: 15,
  HIST: {
    soma_min: 166, soma_max: 224,
    pares_min: 5,  pares_max: 9,
    consec_max: 8,
  },
};

function lf_analisar(draws) {
  const N = draws.length;
  const freq = new Array(26).fill(0);
  draws.forEach(d => d[2].forEach(x => freq[x]++));
  const ultimaApar = new Array(26).fill(-1);
  draws.forEach((d, idx) => d[2].forEach(x => ultimaApar[x] = idx));
  const atraso = new Array(26).fill(0);
  for (let i = 1; i <= 25; i++) atraso[i] = ultimaApar[i] === -1 ? N : N - 1 - ultimaApar[i];
  const sorteadas15 = new Set(draws.map(d => d[2].join('-')));
  return { freq, atraso, sorteadas15, totalAnalisado: N };
}

function lf_analisarCartao(dz) {
  const sorted = [...dz].sort((a,b) => a-b);
  const k = sorted.length;
  const faixas5 = [0,0,0,0,0];
  sorted.forEach(x => faixas5[Math.floor((x-1)/5)]++);
  const pares = sorted.filter(x => x%2===0).length;
  const soma  = sorted.reduce((a,b) => a+b, 0);
  let maxSeq=1, seq=1;
  for (let i=1; i<sorted.length; i++) {
    if (sorted[i]===sorted[i-1]+1) { seq++; maxSeq=Math.max(maxSeq,seq); } else seq=1;
  }
  return { faixas5, pares, soma, maxSeq, sorted };
}

function lf_qualidade(dz, estrategia) {
  const k = dz.length;
  const fator = k / 15;
  const a = lf_analisarCartao(dz);
  const sMin = LF.HIST.soma_min * fator;
  const sMax = LF.HIST.soma_max * fator;
  const margem = estrategia==='conservadora' ? 8*fator : estrategia==='equilibrada' ? 12*fator : 20*fator;
  if (a.soma < sMin-margem || a.soma > sMax+margem) return false;
  const pMin = Math.max(0, Math.floor(LF.HIST.pares_min*fator)-1);
  const pMax = Math.min(k, Math.ceil(LF.HIST.pares_max*fator)+1);
  if (a.pares < pMin || a.pares > pMax) return false;
  const faixaMin = k >= 15 ? 1 : 0;
  const faixaMax = Math.min(5, Math.ceil(k/4));
  if (a.faixas5.some(f => f < faixaMin || f > faixaMax)) return false;
  const maxConsecPermitido = Math.max(LF.HIST.consec_max, Math.ceil(k*0.6));
  if (a.maxSeq > maxConsecPermitido) return false;
  return true;
}

function lf_pesoDezena(stats, i, perfil) {
  const f = stats.freq[i], a = stats.atraso[i];
  const fNorm = (f+1)/(stats.totalAnalisado+1);
  const aNorm = (a+1)/(stats.totalAnalisado+1);
  switch (perfil) {
    case 'quente':   return Math.pow(fNorm, 1.6);
    case 'frio':     return Math.pow(1-fNorm+0.01, 1.4);
    case 'atrasado': return Math.pow(aNorm, 1.4);
    default:         return fNorm*0.55 + aNorm*0.45;
  }
}

function lf_sample(pesos, k) {
  const pool = [];
  for (let i=1; i<=25; i++) pool.push({n:i, w:pesos[i]});
  const escolhidas = [];
  for (let i=0; i<k; i++) {
    const total = pool.reduce((s,x)=>s+x.w,0);
    let r = Math.random()*total, idx=0;
    for (; idx<pool.length; idx++) { r-=pool[idx].w; if (r<=0) break; }
    idx = Math.min(idx, pool.length-1);
    escolhidas.push(pool[idx].n);
    pool.splice(idx,1);
  }
  return escolhidas.sort((a,b)=>a-b);
}

function lf_escolherPerfil(estrategia) {
  const r = Math.random();
  if (estrategia==='conservadora') {
    if (r<0.65) return 'equilibrado'; if (r<0.90) return 'quente'; return 'atrasado';
  } else if (estrategia==='contrarian') {
    if (r<0.40) return 'frio'; if (r<0.65) return 'atrasado'; if (r<0.85) return 'equilibrado'; return 'quente';
  } else {
    if (r<0.45) return 'equilibrado'; if (r<0.65) return 'quente'; if (r<0.80) return 'frio'; return 'atrasado';
  }
}

function lf_gerarCartoes(qtd, dezPorCartao, stats, estrategia) {
  const cartoes=[]; const chaves=new Set(); let tent=0; const MAX=qtd*600;
  while (cartoes.length<qtd && tent<MAX) {
    tent++;
    const perfil = lf_escolherPerfil(estrategia);
    const pesos = new Array(26);
    for (let i=1; i<=25; i++) pesos[i] = lf_pesoDezena(stats,i,perfil);
    const dz = lf_sample(pesos, dezPorCartao);
    if (!lf_qualidade(dz, estrategia)) continue;
    const chave = dz.join('-');
    if (chaves.has(chave)) continue;
    if (dezPorCartao===15 && stats.sorteadas15.has(chave)) continue;
    chaves.add(chave);
    cartoes.push({ dezenas: dz, perfil });
  }
  // fallback
  while (cartoes.length<qtd) {
    const pesos = new Array(26);
    for (let i=1; i<=25; i++) pesos[i] = lf_pesoDezena(stats,i,'equilibrado');
    const dz = lf_sample(pesos, dezPorCartao);
    const chave = dz.join('-');
    if (chaves.has(chave)) continue;
    chaves.add(chave); cartoes.push({ dezenas: dz, perfil: 'equilibrado' });
  }
  return cartoes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEGA-SENA — algoritmo idêntico ao mega-sena.html
// Universo: 1–60, aposta mínima 6 dezenas
// ═══════════════════════════════════════════════════════════════════════════════

const MS = {
  UNIVERSO: 60,
  DEZ_MIN: 6,
  HIST: {
    pares_min: 2, pares_max: 4,
    soma_min: 140, soma_max: 220,
    consec_max: 3,
  },
};

function ms_analisar(draws) {
  const N = draws.length;
  const freq = new Array(61).fill(0);
  draws.forEach(d => d[2].forEach(x => freq[x]++));
  const ultimaApar = new Array(61).fill(-1);
  draws.forEach((d, idx) => d[2].forEach(x => ultimaApar[x] = idx));
  const atraso = new Array(61).fill(0);
  for (let i=1; i<=60; i++) atraso[i] = ultimaApar[i]===-1 ? N : N-1-ultimaApar[i];
  const sorteadas6 = new Set(draws.map(d => d[2].join('-')));
  return { freq, atraso, sorteadas6, totalAnalisado: N };
}

function ms_analisarCartao(dz) {
  const k = dz.length;
  const sorted = [...dz].sort((a,b)=>a-b);
  const q1 = sorted.filter(x=>x<=20).length;
  const q2 = sorted.filter(x=>x>20&&x<=40).length;
  const q3 = sorted.filter(x=>x>40).length;
  const pares = sorted.filter(x=>x%2===0).length;
  const soma  = sorted.reduce((a,b)=>a+b,0);
  let maxSeq=1, seq=1;
  for (let i=1; i<sorted.length; i++) {
    if (sorted[i]===sorted[i-1]+1) { seq++; maxSeq=Math.max(maxSeq,seq); } else seq=1;
  }
  const faixas10=[0,0,0,0,0,0];
  sorted.forEach(x => { const idx=Math.min(Math.floor((x-1)/10),5); faixas10[idx]++; });
  return { q1, q2, q3, pares, soma, maxSeq, maxFaixa10: Math.max(...faixas10), sorted };
}

function ms_qualidade(dz, estrategia) {
  const k = dz.length;
  const a = ms_analisarCartao(dz);
  const fator = k/6;
  const quadrantesUsados = [a.q1,a.q2,a.q3].filter(x=>x>0).length;
  if (quadrantesUsados < (k>=9?3:2)) return false;
  const paresMin = Math.max(0, Math.floor(MS.HIST.pares_min*fator)-1);
  const paresMax = Math.min(k, Math.ceil(MS.HIST.pares_max*fator)+1);
  if (a.pares<paresMin || a.pares>paresMax) return false;
  const somaMinExp = MS.HIST.soma_min*fator, somaMaxExp = MS.HIST.soma_max*fator;
  if (estrategia==='conservadora') {
    if (a.soma<somaMinExp+10*fator || a.soma>somaMaxExp-10*fator) return false;
  } else if (estrategia==='equilibrada') {
    if (a.soma<somaMinExp-5*fator || a.soma>somaMaxExp+5*fator) return false;
  } else {
    if (a.soma<somaMinExp-20*fator || a.soma>somaMaxExp+20*fator) return false;
  }
  if (a.maxSeq > Math.max(3, Math.ceil(k/4))) return false;
  if (a.maxFaixa10 > Math.max(3, Math.ceil(k/6)+2)) return false;
  return true;
}

function ms_pesoDezena(stats, i, perfil) {
  const f=stats.freq[i], a=stats.atraso[i];
  const fNorm=(f+1)/(stats.totalAnalisado+1), aNorm=(a+1)/(stats.totalAnalisado+1);
  switch (perfil) {
    case 'quente':   return Math.pow(fNorm, 1.6);
    case 'frio':     return Math.pow(1-fNorm+0.01, 1.4);
    case 'atrasado': return Math.pow(aNorm, 1.4);
    default:         return fNorm*0.55+aNorm*0.45;
  }
}

function ms_sample(pesos, k) {
  const pool=[];
  for (let i=1; i<=60; i++) pool.push({n:i, w:pesos[i]});
  const escolhidas=[];
  for (let i=0; i<k; i++) {
    const total=pool.reduce((s,x)=>s+x.w,0);
    let r=Math.random()*total, idx=0;
    for (; idx<pool.length; idx++) { r-=pool[idx].w; if (r<=0) break; }
    idx=Math.min(idx,pool.length-1);
    escolhidas.push(pool[idx].n); pool.splice(idx,1);
  }
  return escolhidas.sort((a,b)=>a-b);
}

function ms_escolherPerfil(estrategia) {
  const r=Math.random();
  if (estrategia==='conservadora') {
    if (r<0.65) return 'equilibrado'; if (r<0.95) return 'quente'; return 'atrasado';
  } else if (estrategia==='contrarian') {
    if (r<0.35) return 'frio'; if (r<0.65) return 'atrasado'; if (r<0.85) return 'equilibrado'; return 'quente';
  } else {
    if (r<0.45) return 'equilibrado'; if (r<0.65) return 'quente'; if (r<0.80) return 'frio'; return 'atrasado';
  }
}

function ms_gerarCartoes(qtd, dezPorCartao, stats, estrategia) {
  const cartoes=[]; const chaves=new Set(); let tent=0; const MAX=qtd*500;
  while (cartoes.length<qtd && tent<MAX) {
    tent++;
    const perfil=ms_escolherPerfil(estrategia);
    const pesos=new Array(61);
    for (let i=1; i<=60; i++) pesos[i]=ms_pesoDezena(stats,i,perfil);
    const dz=ms_sample(pesos,dezPorCartao);
    if (!ms_qualidade(dz,estrategia)) continue;
    const chave=dz.join('-');
    if (chaves.has(chave)) continue;
    if (dezPorCartao===6 && stats.sorteadas6.has(chave)) continue;
    chaves.add(chave); cartoes.push({dezenas:dz, perfil});
  }
  while (cartoes.length<qtd) {
    const pesos=new Array(61);
    for (let i=1; i<=60; i++) pesos[i]=ms_pesoDezena(stats,i,'equilibrado');
    const dz=ms_sample(pesos,dezPorCartao);
    const chave=dz.join('-');
    if (chaves.has(chave)) continue;
    chaves.add(chave); cartoes.push({dezenas:dz, perfil:'equilibrado'});
  }
  return cartoes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUINA — algoritmo idêntico ao quina.html
// Universo: 1–80, aposta mínima 5 dezenas
// ═══════════════════════════════════════════════════════════════════════════════

const QN = {
  UNIVERSO: 80,
  DEZ_MIN: 5,
  HIST: {
    soma_min: 120, soma_max: 285,
    pares_min: 1,  pares_max: 4,
    consec_max: 2,
  },
};

function qn_analisar(draws) {
  const N = draws.length;
  const freq = new Array(81).fill(0);
  draws.forEach(d => d[2].forEach(x => freq[x]++));
  const ultimaApar = new Array(81).fill(-1);
  draws.forEach((d, idx) => d[2].forEach(x => ultimaApar[x] = idx));
  const atraso = new Array(81).fill(0);
  for (let i=1; i<=80; i++) atraso[i] = ultimaApar[i]===-1 ? N : N-1-ultimaApar[i];
  const sorteadas5 = new Set(draws.map(d => d[2].join('-')));
  return { freq, atraso, sorteadas5, totalAnalisado: N };
}

function qn_analisarCartao(dz) {
  const sorted=[...dz].sort((a,b)=>a-b);
  const k=sorted.length;
  const faixas20=[0,0,0,0];
  sorted.forEach(x => faixas20[Math.floor((x-1)/20)]++);
  const pares=sorted.filter(x=>x%2===0).length;
  const soma=sorted.reduce((a,b)=>a+b,0);
  let maxSeq=1, seq=1;
  for (let i=1; i<sorted.length; i++) {
    if (sorted[i]===sorted[i-1]+1) { seq++; maxSeq=Math.max(maxSeq,seq); } else seq=1;
  }
  return { faixas20, pares, soma, maxSeq, sorted };
}

function qn_qualidade(dz, estrategia) {
  const k=dz.length;
  const fator=k/5;
  const a=qn_analisarCartao(dz);
  const sMin=QN.HIST.soma_min*fator, sMax=QN.HIST.soma_max*fator;
  const margem=estrategia==='conservadora'?10*fator:estrategia==='equilibrada'?18*fator:30*fator;
  if (a.soma<sMin-margem||a.soma>sMax+margem) return false;
  const pMin=Math.max(0,Math.floor(QN.HIST.pares_min*fator)-1);
  const pMax=Math.min(k,Math.ceil(QN.HIST.pares_max*fator)+1);
  if (a.pares<pMin||a.pares>pMax) return false;
  if (a.maxSeq > Math.max(QN.HIST.consec_max, Math.ceil(k*0.4))) return false;
  if (k>=5 && a.faixas20.filter(f=>f>0).length<2) return false;
  return true;
}

function qn_pesoDezena(stats, i, perfil) {
  const f=stats.freq[i], a=stats.atraso[i];
  const fNorm=(f+1)/(stats.totalAnalisado+1), aNorm=(a+1)/(stats.totalAnalisado+1);
  switch (perfil) {
    case 'quente':   return Math.pow(fNorm,1.6);
    case 'frio':     return Math.pow(1-fNorm+0.01,1.4);
    case 'atrasado': return Math.pow(aNorm,1.4);
    default:         return fNorm*0.55+aNorm*0.45;
  }
}

function qn_sample(pesos, k) {
  const pool=[];
  for (let i=1; i<=80; i++) pool.push({n:i, w:pesos[i]});
  const escolhidas=[];
  for (let i=0; i<k; i++) {
    const total=pool.reduce((s,x)=>s+x.w,0);
    let r=Math.random()*total, idx=0;
    for (; idx<pool.length; idx++) { r-=pool[idx].w; if (r<=0) break; }
    idx=Math.min(idx,pool.length-1);
    escolhidas.push(pool[idx].n); pool.splice(idx,1);
  }
  return escolhidas.sort((a,b)=>a-b);
}

function qn_escolherPerfil(estrategia) {
  const r=Math.random();
  if (estrategia==='conservadora') {
    if (r<0.65) return 'equilibrado'; if (r<0.90) return 'quente'; return 'atrasado';
  } else if (estrategia==='contrarian') {
    if (r<0.40) return 'frio'; if (r<0.65) return 'atrasado'; if (r<0.85) return 'equilibrado'; return 'quente';
  } else {
    if (r<0.45) return 'equilibrado'; if (r<0.65) return 'quente'; if (r<0.80) return 'frio'; return 'atrasado';
  }
}

function qn_gerarCartoes(qtd, dezPorCartao, stats, estrategia) {
  const cartoes=[]; const chaves=new Set(); let tent=0; const MAX=qtd*600;
  while (cartoes.length<qtd && tent<MAX) {
    tent++;
    const perfil=qn_escolherPerfil(estrategia);
    const pesos=new Array(81);
    for (let i=1; i<=80; i++) pesos[i]=qn_pesoDezena(stats,i,perfil);
    const dz=qn_sample(pesos,dezPorCartao);
    if (!qn_qualidade(dz,estrategia)) continue;
    const chave=dz.join('-');
    if (chaves.has(chave)) continue;
    if (dezPorCartao===5 && stats.sorteadas5.has(chave)) continue;
    chaves.add(chave); cartoes.push({dezenas:dz, perfil});
  }
  while (cartoes.length<qtd) {
    const pesos=new Array(81);
    for (let i=1; i<=80; i++) pesos[i]=qn_pesoDezena(stats,i,'equilibrado');
    const dz=qn_sample(pesos,dezPorCartao);
    const chave=dz.join('-');
    if (chaves.has(chave)) continue;
    chaves.add(chave); cartoes.push({dezenas:dz, perfil:'equilibrado'});
  }
  return cartoes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOTOMANIA — algoritmo idêntico ao lotomania.html
// Universo: 00–99, aposta fixa 50 dezenas
// ═══════════════════════════════════════════════════════════════════════════════

const LM = {
  UNIVERSO: 100, // índices 0..99
  DEZ_MIN: 50,
  HIST: {
    soma_min: 2150, soma_max: 2800,
    pares_min: 22,  pares_max: 28,
    quad_min: 10,   quad_max: 15,
  },
};

function lm_analisar(draws) {
  const N = draws.length;
  const freq = new Array(100).fill(0);
  draws.forEach(d => d[2].forEach(x => freq[x]++));
  const ultimaApar = new Array(100).fill(-1);
  draws.forEach((d, idx) => d[2].forEach(x => ultimaApar[x] = idx));
  const atraso = new Array(100).fill(0);
  for (let i = 0; i < 100; i++) atraso[i] = ultimaApar[i] === -1 ? N : N - 1 - ultimaApar[i];
  return { freq, atraso, totalAnalisado: N };
}

function lm_qualidade(dz) {
  const soma  = dz.reduce((s,n) => s+n, 0);
  const pares = dz.filter(n => n%2===0).length;
  const quad  = [0,0,0,0];
  dz.forEach(n => quad[Math.floor(n/25)]++);
  const margem = 100; // mesma margem usada para estrategia 'equilibrada' no site
  if (soma < LM.HIST.soma_min - margem || soma > LM.HIST.soma_max + margem) return false;
  if (pares < LM.HIST.pares_min || pares > LM.HIST.pares_max) return false;
  if (quad.some(q => q < LM.HIST.quad_min || q > LM.HIST.quad_max)) return false;
  return true;
}

function lm_pesoDezena(stats, n, perfil) {
  const f = stats.freq[n] || 0, at = stats.atraso[n] || 0;
  const fNorm = (f+1)/(stats.totalAnalisado+1), aNorm = (at+1)/(stats.totalAnalisado+1);
  switch (perfil) {
    case 'quente':   return Math.pow(fNorm, 1.6);
    case 'frio':     return Math.pow(1-fNorm+0.01, 1.4);
    case 'atrasado': return Math.pow(aNorm, 1.4);
    default:         return fNorm*0.55 + aNorm*0.45;
  }
}

function lm_sample(pesos, k) {
  const pool = [];
  for (let i = 0; i < 100; i++) pool.push({n:i, w:pesos[i]});
  const escolhidas = [];
  for (let i = 0; i < k; i++) {
    const total = pool.reduce((s,x)=>s+x.w,0);
    let r = Math.random()*total, idx=0;
    for (; idx<pool.length; idx++) { r-=pool[idx].w; if (r<=0) break; }
    idx = Math.min(idx, pool.length-1);
    escolhidas.push(pool[idx].n); pool.splice(idx,1);
  }
  return escolhidas.sort((a,b)=>a-b);
}

function lm_escolherPerfil(estrategia) {
  const r = Math.random();
  if (estrategia === 'contrarian') {
    if (r<0.40) return 'frio'; if (r<0.65) return 'atrasado'; if (r<0.85) return 'equilibrado'; return 'quente';
  } else {
    if (r<0.45) return 'equilibrado'; if (r<0.65) return 'quente'; if (r<0.80) return 'frio'; return 'atrasado';
  }
}

function lm_gerarCartoes(qtd, stats, estrategia) {
  const cartoes=[]; const chaves=new Set(); let tent=0; const MAX=qtd*600;
  while (cartoes.length<qtd && tent<MAX) {
    tent++;
    const perfil = lm_escolherPerfil(estrategia);
    const pesos = new Array(100);
    for (let i=0; i<100; i++) pesos[i] = lm_pesoDezena(stats, i, perfil);
    const dz = lm_sample(pesos, LM.DEZ_MIN);
    if (!lm_qualidade(dz)) continue;
    const chave = dz.join('-');
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    cartoes.push({ dezenas: dz, perfil });
  }
  while (cartoes.length<qtd) {
    const pesos = new Array(100);
    for (let i=0; i<100; i++) pesos[i] = lm_pesoDezena(stats, i, 'equilibrado');
    const dz = lm_sample(pesos, LM.DEZ_MIN);
    const chave = dz.join('-');
    if (chaves.has(chave)) continue;
    chaves.add(chave); cartoes.push({ dezenas: dz, perfil: 'equilibrado' });
  }
  return cartoes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMEMANIA — algoritmo idêntico ao timemania.html
// Universo: 1–80, aposta fixa 10 dezenas
// ═══════════════════════════════════════════════════════════════════════════════

const TM = {
  UNIVERSO: 80,
  DEZ_MIN: 10,
  HIST: {
    soma_min: 350, soma_max: 460,
    pares_min: 3,  pares_max: 7,
    quad_min: 1,   quad_max: 5,
  },
};

function tm_analisar(draws) {
  const N = draws.length;
  const freq = new Array(TM.UNIVERSO+1).fill(0);
  draws.forEach(d => d[2].forEach(x => freq[x]++));
  const ultimaApar = new Array(TM.UNIVERSO+1).fill(-1);
  draws.forEach((d, idx) => d[2].forEach(x => ultimaApar[x] = idx));
  const atraso = new Array(TM.UNIVERSO+1).fill(0);
  for (let i=1; i<=TM.UNIVERSO; i++) atraso[i] = ultimaApar[i]===-1 ? N : N-1-ultimaApar[i];
  return { freq, atraso, totalAnalisado: N };
}

function tm_qualidade(dz) {
  const soma  = dz.reduce((s,n) => s+n, 0);
  const pares = dz.filter(n => n%2===0).length;
  const quad  = [0,0,0,0];
  dz.forEach(n => quad[Math.floor((n-1)/20)]++);
  const margem = 30; // mesma margem usada para estrategia 'equilibrada' no site
  if (soma < TM.HIST.soma_min - margem || soma > TM.HIST.soma_max + margem) return false;
  if (pares < TM.HIST.pares_min || pares > TM.HIST.pares_max) return false;
  if (quad.some(q => q < TM.HIST.quad_min || q > TM.HIST.quad_max)) return false;
  return true;
}

function tm_pesoDezena(stats, n, perfil) {
  const f = stats.freq[n] || 0, at = stats.atraso[n] || 0;
  const fNorm = (f+1)/(stats.totalAnalisado+1), aNorm = (at+1)/(stats.totalAnalisado+1);
  switch (perfil) {
    case 'quente':   return Math.pow(fNorm, 1.6);
    case 'frio':     return Math.pow(1-fNorm+0.01, 1.4);
    case 'atrasado': return Math.pow(aNorm, 1.4);
    default:         return fNorm*0.55 + aNorm*0.45;
  }
}

function tm_sample(pesos, k) {
  const pool = [];
  for (let i=1; i<=TM.UNIVERSO; i++) pool.push({n:i, w:pesos[i]});
  const escolhidas = [];
  for (let i=0; i<k; i++) {
    const total = pool.reduce((s,x)=>s+x.w,0);
    let r = Math.random()*total, idx=0;
    for (; idx<pool.length; idx++) { r-=pool[idx].w; if (r<=0) break; }
    idx = Math.min(idx, pool.length-1);
    escolhidas.push(pool[idx].n); pool.splice(idx,1);
  }
  return escolhidas.sort((a,b)=>a-b);
}

function tm_escolherPerfil(estrategia) {
  const r = Math.random();
  if (estrategia === 'contrarian') {
    if (r<0.40) return 'frio'; if (r<0.65) return 'atrasado'; if (r<0.85) return 'equilibrado'; return 'quente';
  } else {
    if (r<0.45) return 'equilibrado'; if (r<0.65) return 'quente'; if (r<0.80) return 'frio'; return 'atrasado';
  }
}

function tm_gerarCartoes(qtd, stats, estrategia) {
  const cartoes=[]; const chaves=new Set(); let tent=0; const MAX=qtd*600;
  while (cartoes.length<qtd && tent<MAX) {
    tent++;
    const perfil = tm_escolherPerfil(estrategia);
    const pesos = new Array(TM.UNIVERSO+1);
    for (let i=1; i<=TM.UNIVERSO; i++) pesos[i] = tm_pesoDezena(stats, i, perfil);
    const dz = tm_sample(pesos, TM.DEZ_MIN);
    if (!tm_qualidade(dz)) continue;
    const chave = dz.join('-');
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    cartoes.push({ dezenas: dz, perfil });
  }
  while (cartoes.length<qtd) {
    const pesos = new Array(TM.UNIVERSO+1);
    for (let i=1; i<=TM.UNIVERSO; i++) pesos[i] = tm_pesoDezena(stats, i, 'equilibrado');
    const dz = tm_sample(pesos, TM.DEZ_MIN);
    const chave = dz.join('-');
    if (chaves.has(chave)) continue;
    chaves.add(chave); cartoes.push({ dezenas: dz, perfil: 'equilibrado' });
  }
  return cartoes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIA DE SORTE — algoritmo idêntico ao diadesorte.html
// Universo: 1–31, aposta mínima 7 dezenas
// ═══════════════════════════════════════════════════════════════════════════════

const DDS = {
  UNIVERSO: 31,
  DEZ_MIN: 7,
  SORTEADAS: 7,
  HIST: {
    soma_min: 85, soma_max: 145,
    pares_min: 2, pares_max: 5,
    metade_min: 2, metade_max: 5,
  },
};

function dds_analisar(draws) {
  const N = draws.length;
  const freq = new Array(DDS.UNIVERSO+1).fill(0);
  draws.forEach(d => d[2].forEach(x => freq[x]++));
  const ultimaApar = new Array(DDS.UNIVERSO+1).fill(-1);
  draws.forEach((d, idx) => d[2].forEach(x => ultimaApar[x] = idx));
  const atraso = new Array(DDS.UNIVERSO+1).fill(0);
  for (let i=1; i<=DDS.UNIVERSO; i++) atraso[i] = ultimaApar[i]===-1 ? N : N-1-ultimaApar[i];
  return { freq, atraso, totalAnalisado: N };
}

function dds_qualidade(dz) {
  const k = dz.length;
  const sc = k / DDS.SORTEADAS;
  const soma_min   = Math.round(DDS.HIST.soma_min * sc);
  const soma_max   = Math.round(DDS.HIST.soma_max * sc);
  const pares_min  = Math.max(0, Math.round(DDS.HIST.pares_min * sc));
  const pares_max  = Math.min(k, Math.round(DDS.HIST.pares_max * sc) + 1);
  const metade_min = Math.max(1, Math.round(DDS.HIST.metade_min * sc));
  const metade_max = Math.min(k-1, Math.round(DDS.HIST.metade_max * sc) + 1);

  const soma   = dz.reduce((s,n) => s+n, 0);
  const pares  = dz.filter(n => n%2===0).length;
  const baixos = dz.filter(n => n<=15).length;
  const altos  = dz.filter(n => n>=16).length;

  const margem = Math.round(15 * sc); // mesma margem usada para estrategia 'equilibrada' no site
  if (soma < soma_min-margem || soma > soma_max+margem) return false;
  if (pares < pares_min || pares > pares_max) return false;
  if (baixos < metade_min || baixos > metade_max) return false;
  if (altos  < metade_min || altos  > metade_max) return false;
  return true;
}

function dds_pesoDezena(stats, n, perfil) {
  const f = stats.freq[n] || 0, at = stats.atraso[n] || 0;
  const fNorm = (f+1)/(stats.totalAnalisado+1), aNorm = (at+1)/(stats.totalAnalisado+1);
  switch (perfil) {
    case 'quente':   return Math.pow(fNorm, 1.6);
    case 'frio':     return Math.pow(1-fNorm+0.01, 1.4);
    case 'atrasado': return Math.pow(aNorm, 1.4);
    default:         return fNorm*0.55 + aNorm*0.45;
  }
}

function dds_sample(pesos, k) {
  const pool = [];
  for (let i=1; i<=DDS.UNIVERSO; i++) pool.push({n:i, w:pesos[i]});
  const escolhidas = [];
  for (let i=0; i<k; i++) {
    const total = pool.reduce((s,x)=>s+x.w,0);
    let r = Math.random()*total, idx=0;
    for (; idx<pool.length; idx++) { r-=pool[idx].w; if (r<=0) break; }
    idx = Math.min(idx, pool.length-1);
    escolhidas.push(pool[idx].n); pool.splice(idx,1);
  }
  return escolhidas.sort((a,b)=>a-b);
}

function dds_escolherPerfil(estrategia) {
  const r = Math.random();
  if (estrategia === 'contrarian') {
    if (r<0.40) return 'frio'; if (r<0.65) return 'atrasado'; if (r<0.85) return 'equilibrado'; return 'quente';
  } else {
    if (r<0.45) return 'equilibrado'; if (r<0.65) return 'quente'; if (r<0.80) return 'frio'; return 'atrasado';
  }
}

function dds_gerarCartoes(qtd, stats, estrategia) {
  const cartoes=[]; const chaves=new Set(); let tent=0; const MAX=qtd*800;
  while (cartoes.length<qtd && tent<MAX) {
    tent++;
    const perfil = dds_escolherPerfil(estrategia);
    const pesos = new Array(DDS.UNIVERSO+1);
    for (let i=1; i<=DDS.UNIVERSO; i++) pesos[i] = dds_pesoDezena(stats, i, perfil);
    const dz = dds_sample(pesos, DDS.DEZ_MIN);
    if (!dds_qualidade(dz)) continue;
    const chave = dz.join('-');
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    cartoes.push({ dezenas: dz, perfil });
  }
  while (cartoes.length<qtd) {
    const pesos = new Array(DDS.UNIVERSO+1);
    for (let i=1; i<=DDS.UNIVERSO; i++) pesos[i] = dds_pesoDezena(stats, i, 'equilibrado');
    const dz = dds_sample(pesos, DDS.DEZ_MIN);
    const chave = dz.join('-');
    if (chaves.has(chave)) continue;
    chaves.add(chave); cartoes.push({ dezenas: dz, perfil: 'equilibrado' });
  }
  return cartoes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DUPLA SENA — algoritmo idêntico ao dupla-sena.html
// Universo: 1–50, aposta mínima 6 dezenas · loteria DUAL (2 sorteios por bilhete,
// mas no site cada sorteio individual vira uma linha separada em `combinacoes`)
// ═══════════════════════════════════════════════════════════════════════════════

const DS = {
  UNIVERSO: 50,
  DEZ_MIN: 6,
  HIST: {
    soma_min: 90, soma_max: 215,
    pares_min: 2, pares_max: 4,
  },
};

// Combina a frequência dos dois sorteios de cada concurso (igual ao site)
function ds_analisar(draws) {
  const freq = {}, atraso = {};
  for (let n = 1; n <= DS.UNIVERSO; n++) { freq[n] = 0; atraso[n] = draws.length; }
  draws.forEach((d, idx) => {
    [...d[2], ...d[3]].forEach(n => {
      freq[n]++;
      atraso[n] = draws.length - 1 - idx;
    });
  });
  return { freq, atraso };
}

function ds_qualidade(dz) {
  const k = dz.length;
  const soma = dz.reduce((s,n) => s+n, 0);
  const scale = k / 6;
  if (soma < DS.HIST.soma_min*scale || soma > DS.HIST.soma_max*scale) return false;
  const pares = dz.filter(n => n%2===0).length;
  const pMin = Math.max(1, Math.round(DS.HIST.pares_min*scale*0.9));
  const pMax = Math.min(k-1, Math.round(DS.HIST.pares_max*scale*1.1));
  if (pares < pMin || pares > pMax) return false;
  return true;
}

function ds_sample(pesos, qtd) {
  const pool = pesos.map((p,i) => ({ i: i+1, p }));
  const res = [];
  for (let q = 0; q < qtd; q++) {
    if (!pool.length) break;
    const total = pool.reduce((s,x) => s+x.p, 0);
    let r = Math.random()*total;
    let picked = pool.length-1;
    for (let j = 0; j < pool.length; j++) { r -= pool[j].p; if (r<=0) { picked=j; break; } }
    res.push(pool[picked].i);
    pool.splice(picked,1);
  }
  return res.sort((a,b)=>a-b);
}

// Igual ao site: NÃO sorteia perfil por cartão — usa uma única estratégia fixa para o lote inteiro
function ds_gerarCartoes(qtd, analiseData, strat) {
  const { freq, atraso } = analiseData;
  const cartoes = [];
  let tentativas = 0;
  const MAX_TENT = qtd * 200;
  const maiorFreq = Math.max(...Object.values(freq)) || 1;
  const maiorAtraso = Math.max(...Object.values(atraso)) || 1;

  while (cartoes.length < qtd && tentativas++ < MAX_TENT) {
    const pesos = [];
    for (let n = 1; n <= DS.UNIVERSO; n++) {
      let w;
      if (strat === 'quente') w = Math.max(1, freq[n]);
      else if (strat === 'frio' || strat === 'contrarian') w = Math.max(1, atraso[n]);
      else if (strat === 'aleatorio') w = 1;
      else {
        const fNorm = freq[n] / maiorFreq;
        const aNorm = atraso[n] / maiorAtraso;
        w = 0.55*fNorm + 0.45*aNorm + 0.1;
      }
      pesos.push(w);
    }
    const dz = ds_sample(pesos, DS.DEZ_MIN);
    if (strat !== 'aleatorio' && !ds_qualidade(dz)) continue;
    cartoes.push({ dezenas: dz });
  }
  return cartoes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// +MILIONÁRIA — algoritmo idêntico ao milionaria.html
// Universo: 1–50, aposta mínima 6 dezenas + 2 trevos (1–6)
// ═══════════════════════════════════════════════════════════════════════════════

const ML = {
  UNIVERSO: 50,
  DEZ_MIN: 6,
  PERFIL: { pares_min: 2, pares_max: 4, soma_min: 100, soma_max: 195 },
};

function ml_analisar(draws) {
  const N = draws.length;
  const freq = new Array(51).fill(0);
  const freqTrevo = new Array(7).fill(0);
  draws.forEach(d => {
    d[2].forEach(x => freq[x]++);
    if (d[3]) d[3].forEach(x => freqTrevo[x]++);
  });
  const ultimaApar = new Array(51).fill(-1);
  draws.forEach((d, idx) => d[2].forEach(x => ultimaApar[x] = idx));
  const atraso = new Array(51).fill(0);
  for (let i=1; i<=50; i++) atraso[i] = ultimaApar[i]===-1 ? N : N-1-ultimaApar[i];
  const sorteadas6 = new Set(draws.map(d => d[2].join('-')));
  let top10ranking = [];
  for (let i=1;i<=50;i++) top10ranking.push({n:i, freq:freq[i]});
  top10ranking.sort((a,b)=>b.freq-a.freq);
  const top10 = new Set(top10ranking.slice(0,10).map(x=>x.n));
  return { freq, freqTrevo, atraso, sorteadas6, top10, totalAnalisado: N };
}

function ml_analisarCartao(dz) {
  const k = dz.length;
  const sorted = [...dz].sort((a,b)=>a-b);
  const q1 = sorted.filter(x=>x<=16).length;
  const q2 = sorted.filter(x=>x>16&&x<=33).length;
  const q3 = sorted.filter(x=>x>33).length;
  const pares = sorted.filter(x=>x%2===0).length;
  const soma  = sorted.reduce((a,b)=>a+b,0);
  let maxSeq=1, seq=1;
  for (let i=1; i<sorted.length; i++) {
    if (sorted[i]===sorted[i-1]+1) { seq++; maxSeq=Math.max(maxSeq,seq); } else seq=1;
  }
  const faixas10=[0,0,0,0,0];
  sorted.forEach(x => { const idx=Math.min(Math.floor((x-1)/10),4); faixas10[idx]++; });
  return { q1,q2,q3,pares,soma,maxSeq,maxFaixa10:Math.max(...faixas10),sorted };
}

function ml_qualidade(dz, estrategia, stats) {
  const k = dz.length;
  const a = ml_analisarCartao(dz);
  const fator = k/6;

  const quadrantesUsados = [a.q1,a.q2,a.q3].filter(x=>x>0).length;
  if (quadrantesUsados < (k>=9?3:2)) return false;

  const paresMin = Math.max(0, Math.floor(ML.PERFIL.pares_min*fator)-1);
  const paresMax = Math.min(k, Math.ceil(ML.PERFIL.pares_max*fator)+1);
  if (a.pares<paresMin || a.pares>paresMax) return false;

  const somaMinExp = ML.PERFIL.soma_min*fator, somaMaxExp = ML.PERFIL.soma_max*fator;
  const margem = estrategia==='equilibrada' ? 5*fator : 20*fator;
  if (a.soma<somaMinExp-margem || a.soma>somaMaxExp+margem) return false;

  if (a.maxSeq > Math.max(3, Math.ceil(k/4))) return false;
  if (a.maxFaixa10 > Math.max(3, Math.ceil(k/5)+2)) return false;

  const sorted = a.sorted;
  const span = sorted[sorted.length-1] - sorted[0];
  if (span < 15) return false;

  const uCount = {};
  for (const n of sorted) { const u=n%10; uCount[u]=(uCount[u]||0)+1; }
  if (Math.max(...Object.values(uCount)) >= 4) return false;

  const diffs = sorted.slice(1).map((v,i)=>v-sorted[i]);
  if (Math.max(...diffs) > 29) return false;

  const nBaixas = sorted.filter(n=>n<=25).length;
  if (nBaixas===0 || nBaixas===k) return false;

  const diffMean = diffs.reduce((s,x)=>s+x,0)/diffs.length;
  const diffVar  = diffs.reduce((s,x)=>s+(x-diffMean)**2,0)/diffs.length;
  if (diffVar<=1.0) return false;

  if (stats?.top10) {
    if (sorted.filter(n=>stats.top10.has(n)).length>=5) return false;
  }
  return true;
}

function ml_pesoDezena(stats, i, perfil) {
  const f = stats.freq[i], a = stats.atraso[i];
  const fNorm = (f+1)/(stats.totalAnalisado+1), aNorm = (a+1)/(stats.totalAnalisado+1);
  switch (perfil) {
    case 'quente':   return Math.pow(fNorm, 1.6);
    case 'frio':     return Math.pow(1-fNorm+0.01, 1.4);
    case 'atrasado': return Math.pow(aNorm, 1.4);
    default:         return fNorm*0.55 + aNorm*0.45;
  }
}

function ml_sample(pesos, k, max) {
  const pool = [];
  for (let i=1; i<=max; i++) pool.push({n:i, w:pesos[i]||1});
  const escolhidas = [];
  for (let i=0; i<k; i++) {
    const total = pool.reduce((s,x)=>s+x.w,0);
    let r = Math.random()*total, idx=0;
    for (; idx<pool.length; idx++) { r-=pool[idx].w; if (r<=0) break; }
    idx = Math.min(idx, pool.length-1);
    escolhidas.push(pool[idx].n); pool.splice(idx,1);
  }
  return escolhidas.sort((a,b)=>a-b);
}

function ml_gerarTrevos(stats) {
  const pesos = new Array(7).fill(0);
  const total = stats.freqTrevo.reduce((s,x)=>s+x,0);
  for (let i=1; i<=6; i++) pesos[i] = total>0 ? (stats.freqTrevo[i]+1)/(total+6) : 1/6;
  return ml_sample(pesos, 2, 6);
}

function ml_escolherPerfil(estrategia) {
  const r = Math.random();
  if (estrategia === 'contrarian') {
    if (r<0.35) return 'frio'; if (r<0.65) return 'atrasado'; if (r<0.85) return 'equilibrado'; return 'quente';
  } else {
    if (r<0.45) return 'equilibrado'; if (r<0.65) return 'quente'; if (r<0.80) return 'frio'; return 'atrasado';
  }
}

function ml_gerarCartoes(qtd, dezPorCartao, stats, estrategia) {
  const cartoes=[]; const chaves=new Set(); let tent=0; const MAX=qtd*500;
  while (cartoes.length<qtd && tent<MAX) {
    tent++;
    const perfil = ml_escolherPerfil(estrategia);
    const pesos = new Array(51);
    for (let i=1; i<=50; i++) pesos[i] = ml_pesoDezena(stats, i, perfil);
    const dz = ml_sample(pesos, dezPorCartao, 50);
    if (!ml_qualidade(dz, estrategia, stats)) continue;
    const chave = dz.join('-');
    if (chaves.has(chave)) continue;
    if (dezPorCartao===6 && stats.sorteadas6.has(chave)) continue;
    chaves.add(chave);
    cartoes.push({ dezenas: dz, trevos: ml_gerarTrevos(stats), perfil });
  }
  while (cartoes.length<qtd) {
    const pesos = new Array(51);
    for (let i=1; i<=50; i++) pesos[i] = ml_pesoDezena(stats, i, 'equilibrado');
    const dz = ml_sample(pesos, dezPorCartao, 50);
    const chave = dz.join('-');
    if (chaves.has(chave)) continue;
    chaves.add(chave);
    cartoes.push({ dezenas: dz, trevos: ml_gerarTrevos(stats), perfil: 'equilibrado' });
  }
  return cartoes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LÓGICA DE GERAÇÃO POR LOTERIA
// ═══════════════════════════════════════════════════════════════════════════════

async function gerarLotofacil() {
  log('\n▶ Lotofácil — carregando dados da API...');
  const latest = await buscarUltimoConcurso('lotofacil');
  const concurso = latest.numeroConcursoProximo || (latest.numero + 1);
  log(`  Próximo concurso: ${concurso}`);

  // Constrói série histórica mínima a partir do último sorteio (para estatísticas básicas)
  // Busca os últimos 500 sorteios para ter estatísticas decentes
  log('  Carregando histórico recente para análise estatística...');
  const draws = await carregarHistoricoRecente('lotofacil', latest, 500);
  log(`  ${draws.length} sorteios carregados para análise.`);

  const stats    = lf_analisar(draws);
  const estrategia = 'equilibrada';
  let totalSalvos = 0;

  log(`  Gerando ${META_LOTOFACIL} combinações...`);
  while (totalSalvos < META_LOTOFACIL) {
    const faltam  = META_LOTOFACIL - totalSalvos;
    const qtdLote = Math.min(LOTE, faltam);
    const cartoes = lf_gerarCartoes(qtdLote, LF.DEZ_MIN, stats, estrategia);
    const salvos  = await salvarCombinacoes(cartoes, 'lotofacil', concurso, LF.DEZ_MIN, estrategia);
    totalSalvos  += salvos;
    log(`  → ${totalSalvos}/${META_LOTOFACIL} salvas`);
    if (salvos === 0 && totalSalvos < META_LOTOFACIL) {
      log('  ⚠ Sem novas combinações (todas duplicadas). Encerrando lote.');
      break;
    }
    await sleep(300);
  }
  return totalSalvos;
}

async function gerarQuina() {
  log('\n▶ Quina — carregando dados da API...');
  const latest = await buscarUltimoConcurso('quina');
  const concurso = latest.numeroConcursoProximo || (latest.numero + 1);
  log(`  Próximo concurso: ${concurso}`);

  log('  Carregando histórico recente para análise estatística...');
  const draws = await carregarHistoricoRecente('quina', latest, 500);
  log(`  ${draws.length} sorteios carregados para análise.`);

  const stats    = qn_analisar(draws);
  const estrategia = 'equilibrada';
  let totalSalvos = 0;

  log(`  Gerando ${META_QUINA} combinações...`);
  while (totalSalvos < META_QUINA) {
    const faltam  = META_QUINA - totalSalvos;
    const qtdLote = Math.min(LOTE, faltam);
    const cartoes = qn_gerarCartoes(qtdLote, QN.DEZ_MIN, stats, estrategia);
    const salvos  = await salvarCombinacoes(cartoes, 'quina', concurso, QN.DEZ_MIN, estrategia);
    totalSalvos  += salvos;
    log(`  → ${totalSalvos}/${META_QUINA} salvas`);
    if (salvos === 0 && totalSalvos < META_QUINA) {
      log('  ⚠ Sem novas combinações (todas duplicadas). Encerrando lote.');
      break;
    }
    await sleep(300);
  }
  return totalSalvos;
}

async function gerarMegaSena() {
  log('\n▶ Mega-Sena — verificando se há sorteio hoje...');
  const latest = await buscarUltimoConcurso('megasena');

  // A API retorna dataProximoConcurso no formato dd/mm/yyyy
  const dataProximo = latest.dataProximoConcurso;
  const concurso    = latest.numeroConcursoProximo || (latest.numero + 1);

  // Verifica se o próximo sorteio é hoje (horário de Brasília)
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  log(`  Hoje (BRT): ${hoje} | Próximo sorteio: ${dataProximo} (concurso ${concurso})`);

  if (dataProximo !== hoje) {
    log(`  ⏭ Sem sorteio da Mega-Sena hoje. Pulando.`);
    return 0;
  }

  log('  ✓ Há sorteio hoje! Gerando combinações...');
  log('  Carregando histórico recente para análise estatística...');
  const draws = await carregarHistoricoRecente('megasena', latest, 500);
  log(`  ${draws.length} sorteios carregados para análise.`);

  const stats    = ms_analisar(draws);
  const estrategia = 'equilibrada';
  let totalSalvos = 0;

  log(`  Gerando ${META_MEGASENA} combinações...`);
  while (totalSalvos < META_MEGASENA) {
    const faltam  = META_MEGASENA - totalSalvos;
    const qtdLote = Math.min(LOTE, faltam);
    const cartoes = ms_gerarCartoes(qtdLote, MS.DEZ_MIN, stats, estrategia);
    const salvos  = await salvarCombinacoes(cartoes, 'mega-sena', concurso, MS.DEZ_MIN, estrategia);
    totalSalvos  += salvos;
    log(`  → ${totalSalvos}/${META_MEGASENA} salvas`);
    if (salvos === 0 && totalSalvos < META_MEGASENA) {
      log('  ⚠ Sem novas combinações (todas duplicadas). Encerrando lote.');
      break;
    }
    await sleep(300);
  }
  return totalSalvos;
}

async function gerarLotomania() {
  log('\n▶ Lotomania — verificando se há sorteio hoje...');
  const latest = await buscarUltimoConcurso('lotomania');
  const dataProximo = latest.dataProximoConcurso;
  const concurso    = latest.numeroConcursoProximo || (latest.numero + 1);
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  log(`  Hoje (BRT): ${hoje} | Próximo sorteio: ${dataProximo} (concurso ${concurso})`);

  if (dataProximo !== hoje) {
    log(`  ⏭ Sem sorteio da Lotomania hoje. Pulando.`);
    return 0;
  }

  log('  ✓ Há sorteio hoje! Gerando combinações...');
  const draws = await carregarHistoricoRecente('lotomania', latest, 500);
  log(`  ${draws.length} sorteios carregados para análise.`);

  const stats = lm_analisar(draws);
  const estrategia = 'equilibrada';
  let totalSalvos = 0;

  log(`  Gerando ${META_LOTOMANIA} combinações...`);
  while (totalSalvos < META_LOTOMANIA) {
    const faltam  = META_LOTOMANIA - totalSalvos;
    const qtdLote = Math.min(LOTE, faltam);
    const cartoes = lm_gerarCartoes(qtdLote, stats, estrategia);
    const salvos  = await salvarCombinacoes(cartoes, 'lotomania', concurso, LM.DEZ_MIN, estrategia);
    totalSalvos  += salvos;
    log(`  → ${totalSalvos}/${META_LOTOMANIA} salvas`);
    if (salvos === 0 && totalSalvos < META_LOTOMANIA) {
      log('  ⚠ Sem novas combinações (todas duplicadas). Encerrando lote.');
      break;
    }
    await sleep(300);
  }
  return totalSalvos;
}

async function gerarTimemania() {
  log('\n▶ Timemania — verificando se há sorteio hoje...');
  const latest = await buscarUltimoConcurso('timemania');
  const dataProximo = latest.dataProximoConcurso;
  const concurso    = latest.numeroConcursoProximo || (latest.numero + 1);
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  log(`  Hoje (BRT): ${hoje} | Próximo sorteio: ${dataProximo} (concurso ${concurso})`);

  if (dataProximo !== hoje) {
    log(`  ⏭ Sem sorteio da Timemania hoje. Pulando.`);
    return 0;
  }

  log('  ✓ Há sorteio hoje! Gerando combinações...');
  const draws = await carregarHistoricoRecente('timemania', latest, 500);
  log(`  ${draws.length} sorteios carregados para análise.`);

  const stats = tm_analisar(draws);
  const estrategia = 'equilibrada';
  let totalSalvos = 0;

  log(`  Gerando ${META_TIMEMANIA} combinações...`);
  while (totalSalvos < META_TIMEMANIA) {
    const faltam  = META_TIMEMANIA - totalSalvos;
    const qtdLote = Math.min(LOTE, faltam);
    const cartoes = tm_gerarCartoes(qtdLote, stats, estrategia);
    const salvos  = await salvarCombinacoes(cartoes, 'timemania', concurso, TM.DEZ_MIN, estrategia);
    totalSalvos  += salvos;
    log(`  → ${totalSalvos}/${META_TIMEMANIA} salvas`);
    if (salvos === 0 && totalSalvos < META_TIMEMANIA) {
      log('  ⚠ Sem novas combinações (todas duplicadas). Encerrando lote.');
      break;
    }
    await sleep(300);
  }
  return totalSalvos;
}

async function gerarDiaDeSorte() {
  log('\n▶ Dia de Sorte — verificando se há sorteio hoje...');
  const latest = await buscarUltimoConcurso('diadesorte');
  const dataProximo = latest.dataProximoConcurso;
  const concurso    = latest.numeroConcursoProximo || (latest.numero + 1);
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  log(`  Hoje (BRT): ${hoje} | Próximo sorteio: ${dataProximo} (concurso ${concurso})`);

  if (dataProximo !== hoje) {
    log(`  ⏭ Sem sorteio do Dia de Sorte hoje. Pulando.`);
    return 0;
  }

  log('  ✓ Há sorteio hoje! Gerando combinações...');
  const draws = await carregarHistoricoRecente('diadesorte', latest, 500);
  log(`  ${draws.length} sorteios carregados para análise.`);

  const stats = dds_analisar(draws);
  const estrategia = 'equilibrada';
  let totalSalvos = 0;

  log(`  Gerando ${META_DIADESORTE} combinações...`);
  while (totalSalvos < META_DIADESORTE) {
    const faltam  = META_DIADESORTE - totalSalvos;
    const qtdLote = Math.min(LOTE, faltam);
    const cartoes = dds_gerarCartoes(qtdLote, stats, estrategia);
    const salvos  = await salvarCombinacoes(cartoes, 'dia-de-sorte', concurso, DDS.DEZ_MIN, estrategia);
    totalSalvos  += salvos;
    log(`  → ${totalSalvos}/${META_DIADESORTE} salvas`);
    if (salvos === 0 && totalSalvos < META_DIADESORTE) {
      log('  ⚠ Sem novas combinações (todas duplicadas). Encerrando lote.');
      break;
    }
    await sleep(300);
  }
  return totalSalvos;
}

async function gerarDuplaSena() {
  log('\n▶ Dupla Sena — verificando se há sorteio hoje...');
  const latest = await buscarUltimoConcurso('duplasena');
  const dataProximo = latest.dataProximoConcurso;
  const concurso    = latest.numeroConcursoProximo || (latest.numero + 1);
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  log(`  Hoje (BRT): ${hoje} | Próximo sorteio: ${dataProximo} (concurso ${concurso})`);

  if (dataProximo !== hoje) {
    log(`  ⏭ Sem sorteio da Dupla Sena hoje. Pulando.`);
    return 0;
  }

  log('  ✓ Há sorteio hoje! Gerando combinações...');
  const draws = await carregarHistoricoRecenteDual('duplasena', latest, 500);
  log(`  ${draws.length} sorteios carregados para análise.`);

  const analiseData = ds_analisar(draws);
  const estrategia = 'equilibrado'; // igual ao valor padrão em dupla-sena.html
  let totalSalvos = 0;

  log(`  Gerando ${META_DUPLASENA} combinações...`);
  while (totalSalvos < META_DUPLASENA) {
    const faltam  = META_DUPLASENA - totalSalvos;
    const qtdLote = Math.min(LOTE, faltam);
    const cartoes = ds_gerarCartoes(qtdLote, analiseData, estrategia);
    const salvos  = await salvarCombinacoes(cartoes, 'dupla-sena', concurso, DS.DEZ_MIN, estrategia);
    totalSalvos  += salvos;
    log(`  → ${totalSalvos}/${META_DUPLASENA} salvas`);
    if (salvos === 0 && totalSalvos < META_DUPLASENA) {
      log('  ⚠ Sem novas combinações (todas duplicadas). Encerrando lote.');
      break;
    }
    await sleep(300);
  }
  return totalSalvos;
}

// Carrega histórico DUAL (dois sorteios por concurso) — usado só pela Dupla Sena
async function carregarHistoricoRecenteDual(slug, latest, n) {
  const draws = [];
  const ultimo = latest.numero;
  const inicio = Math.max(1, ultimo - n + 1);

  if (latest.listaDezenas && latest.listaDezenasSegundoSorteio) {
    draws.unshift([
      latest.numero, latest.dataApuracao,
      latest.listaDezenas.map(x=>parseInt(x,10)).sort((a,b)=>a-b),
      latest.listaDezenasSegundoSorteio.map(x=>parseInt(x,10)).sort((a,b)=>a-b),
    ]);
  }

  for (let i = ultimo - 1; i >= inicio; i--) {
    try {
      const r = await fetch(
        `https://servicebus2.caixa.gov.br/portaldeloterias/api/${slug}/${i}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!r.ok) continue;
      const d = await r.json();
      if (!d.listaDezenas || !d.listaDezenasSegundoSorteio) continue;
      draws.unshift([
        d.numero, d.dataApuracao,
        d.listaDezenas.map(x=>parseInt(x,10)).sort((a,b)=>a-b),
        d.listaDezenasSegundoSorteio.map(x=>parseInt(x,10)).sort((a,b)=>a-b),
      ]);
      await sleep(120);
    } catch(e) { /* ignora erros individuais */ }
  }

  return draws.sort((a,b)=>a[0]-b[0]);
}

async function gerarMilionaria() {
  log('\n▶ +Milionária — verificando se há sorteio hoje...');
  const latest = await buscarUltimoConcurso('maismilionaria');
  const dataProximo = latest.dataProximoConcurso;
  const concurso    = latest.numeroConcursoProximo || (latest.numero + 1);
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  log(`  Hoje (BRT): ${hoje} | Próximo sorteio: ${dataProximo} (concurso ${concurso})`);

  if (dataProximo !== hoje) {
    log(`  ⏭ Sem sorteio da +Milionária hoje. Pulando.`);
    return 0;
  }

  log('  ✓ Há sorteio hoje! Gerando combinações...');
  const draws = await carregarHistoricoRecenteMilionaria('maismilionaria', latest, 500);
  log(`  ${draws.length} sorteios carregados para análise.`);

  const stats = ml_analisar(draws);
  const estrategia = 'equilibrada';
  let totalSalvos = 0;

  log(`  Gerando ${META_MILIONARIA} combinações...`);
  while (totalSalvos < META_MILIONARIA) {
    const faltam  = META_MILIONARIA - totalSalvos;
    const qtdLote = Math.min(LOTE, faltam);
    const cartoes = ml_gerarCartoes(qtdLote, ML.DEZ_MIN, stats, estrategia);
    const salvos  = await salvarCombinacoes(cartoes, 'milionaria', concurso, ML.DEZ_MIN, estrategia);
    totalSalvos  += salvos;
    log(`  → ${totalSalvos}/${META_MILIONARIA} salvas`);
    if (salvos === 0 && totalSalvos < META_MILIONARIA) {
      log('  ⚠ Sem novas combinações (todas duplicadas). Encerrando lote.');
      break;
    }
    await sleep(300);
  }
  return totalSalvos;
}

// Carrega histórico incluindo trevos (d[3]) — usado só pela +Milionária
async function carregarHistoricoRecenteMilionaria(slug, latest, n) {
  const draws = [];
  const ultimo = latest.numero;
  const inicio = Math.max(1, ultimo - n + 1);

  if (latest.listaDezenas) {
    const trevos = (latest.trevosSorteados || latest.listaTrevos || []).map(x=>parseInt(x,10)).sort((a,b)=>a-b);
    const g = latest.listaRateioPremio?.[0]?.numeroDeGanhadores || 0;
    draws.unshift([
      latest.numero, latest.dataApuracao,
      latest.listaDezenas.map(x=>parseInt(x,10)).sort((a,b)=>a-b),
      trevos, parseInt(g,10)||0
    ]);
  }

  for (let i = ultimo - 1; i >= inicio; i--) {
    try {
      const r = await fetch(
        `https://servicebus2.caixa.gov.br/portaldeloterias/api/${slug}/${i}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!r.ok) continue;
      const d = await r.json();
      if (!d.listaDezenas) continue;
      const trevos = (d.trevosSorteados || d.listaTrevos || []).map(x=>parseInt(x,10)).sort((a,b)=>a-b);
      const g = d.listaRateioPremio?.[0]?.numeroDeGanhadores || 0;
      draws.unshift([
        d.numero, d.dataApuracao,
        d.listaDezenas.map(x=>parseInt(x,10)).sort((a,b)=>a-b),
        trevos, parseInt(g,10)||0
      ]);
      await sleep(120);
    } catch(e) { /* ignora erros individuais */ }
  }

  return draws.sort((a,b)=>a[0]-b[0]);
}

// Carrega os últimos N sorteios de uma loteria via API da Caixa para análise estatística
async function carregarHistoricoRecente(slug, latest, n) {
  const draws = [];
  const ultimo = latest.numero;
  const inicio = Math.max(1, ultimo - n + 1);

  // Adiciona o último sorteio já disponível
  if (latest.listaDezenas) {
    const g = latest.listaRateioPremio?.[0]?.numeroDeGanhadores || 0;
    draws.unshift([
      latest.numero, latest.dataApuracao,
      latest.listaDezenas.map(x=>parseInt(x,10)).sort((a,b)=>a-b),
      parseInt(g,10)||0
    ]);
  }

  // Busca anteriores
  for (let i = ultimo - 1; i >= inicio; i--) {
    try {
      const r = await fetch(
        `https://servicebus2.caixa.gov.br/portaldeloterias/api/${slug}/${i}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!r.ok) continue;
      const d = await r.json();
      if (!d.listaDezenas) continue;
      const g = d.listaRateioPremio?.[0]?.numeroDeGanhadores || 0;
      draws.unshift([
        d.numero, d.dataApuracao,
        d.listaDezenas.map(x=>parseInt(x,10)).sort((a,b)=>a-b),
        parseInt(g,10)||0
      ]);
      await sleep(120);
    } catch(e) { /* ignora erros individuais */ }
  }

  return draws.sort((a,b)=>a[0]-b[0]);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  const inicio = Date.now();
  log('═══════════════════════════════════════════════════');
  log('🎱 Palpitiar — Geração Automática de Combinações');
  log(`📅 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  log('═══════════════════════════════════════════════════');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    log('✗ ERRO: SUPABASE_URL e SUPABASE_KEY são obrigatórias.');
    process.exit(1);
  }

  const resultados = {};

  // Lotofácil — sempre (seg–sáb)
  try {
    resultados['lotofacil'] = await gerarLotofacil();
  } catch(e) {
    log(`\n✗ Erro em Lotofácil: ${e.message}`);
    resultados['lotofacil'] = `ERRO: ${e.message}`;
  }

  // Quina — sempre (seg–sáb)
  try {
    resultados['quina'] = await gerarQuina();
  } catch(e) {
    log(`\n✗ Erro em Quina: ${e.message}`);
    resultados['quina'] = `ERRO: ${e.message}`;
  }

  // Mega-Sena — somente se sorteio hoje
  try {
    resultados['mega-sena'] = await gerarMegaSena();
  } catch(e) {
    log(`\n✗ Erro em Mega-Sena: ${e.message}`);
    resultados['mega-sena'] = `ERRO: ${e.message}`;
  }

  // Lotomania — somente se sorteio hoje
  try {
    resultados['lotomania'] = await gerarLotomania();
  } catch(e) {
    log(`\n✗ Erro em Lotomania: ${e.message}`);
    resultados['lotomania'] = `ERRO: ${e.message}`;
  }

  // Timemania — somente se sorteio hoje
  try {
    resultados['timemania'] = await gerarTimemania();
  } catch(e) {
    log(`\n✗ Erro em Timemania: ${e.message}`);
    resultados['timemania'] = `ERRO: ${e.message}`;
  }

  // Dupla Sena — somente se sorteio hoje
  try {
    resultados['dupla-sena'] = await gerarDuplaSena();
  } catch(e) {
    log(`\n✗ Erro em Dupla Sena: ${e.message}`);
    resultados['dupla-sena'] = `ERRO: ${e.message}`;
  }

  // Dia de Sorte — somente se sorteio hoje
  try {
    resultados['dia-de-sorte'] = await gerarDiaDeSorte();
  } catch(e) {
    log(`\n✗ Erro em Dia de Sorte: ${e.message}`);
    resultados['dia-de-sorte'] = `ERRO: ${e.message}`;
  }

  // +Milionária — somente se sorteio hoje
  try {
    resultados['milionaria'] = await gerarMilionaria();
  } catch(e) {
    log(`\n✗ Erro em +Milionária: ${e.message}`);
    resultados['milionaria'] = `ERRO: ${e.message}`;
  }

  const duracao = ((Date.now()-inicio)/1000).toFixed(0);
  log('\n═══════════════════════════════════════════════════');
  log('📊 RELATÓRIO FINAL');
  log('═══════════════════════════════════════════════════');
  log('');
  log('Loteria       | Combinações geradas');
  log('─────────────────────────────────────');
  for (const [k,v] of Object.entries(resultados)) {
    log(`${k.padEnd(13)} | ${v}`);
  }
  log('');
  log(`⏱ Tempo total: ${duracao}s`);
  log('═══════════════════════════════════════════════════');
}

// ─── UTILITÁRIOS ─────────────────────────────────────────────────────────────

function chunk(arr, size) {
  const c=[]; for (let i=0; i<arr.length; i+=size) c.push(arr.slice(i,i+size)); return c;
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
function log(msg)  { console.log(msg); }

main().catch(err => { console.error('ERRO FATAL:', err); process.exit(1); });
