
/* ============================================================
   Lotoia · Módulo de Banco de Dados v2
   Supabase + Netlify Functions proxy
   ============================================================ */

const SUPABASE_URL = 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zbHZxaW1sbGl6c2R0eHdrcmFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODU1NjIsImV4cCI6MjA5NTE2MTU2Mn0.J0KCbLQGEb2ZOHN0NZD6mh78SAVGiEYVXv-HEaVPPZU';

const PREMIOS_FIXOS = {
  'lotofacil': {
    '11 acertos': 6.00, '12 acertos': 12.00, '13 acertos': 30.00,
    '14 acertos': null, '15 acertos': null,
  },
  'mega-sena':  { 'sena': null, 'quina': null, 'quadra': null },
  'quina':      { 'quina': null, 'quadra': null, 'terno': null, 'duque': null },
  'dupla-sena': { 'sena': null, 'quina': null, 'quadra': null, 'terno': null, 'duque': null },
  'lotomania':  { 'sena': null, 'quina': null, 'quadra': null, 'terno': null, 'duque': null },
  'timemania':    { '7 acertos': null, '6 acertos': null, '5 acertos': null, '4 acertos': null, '3 acertos': null, 'time do coração': null },
  'dia-de-sorte': { '7 acertos': null, '6 acertos': null, '5 acertos': null, '4 acertos': null, 'mes da sorte': null },
};

const FAIXAS_PREMIADAS = {
  'mega-sena':  { 6:'sena', 5:'quina', 4:'quadra' },
  'lotofacil':  { 15:'15 acertos', 14:'14 acertos', 13:'13 acertos', 12:'12 acertos', 11:'11 acertos' },
  'quina':      { 5:'quina', 4:'quadra', 3:'terno', 2:'duque' },
  'dupla-sena': { 6:'sena', 5:'quina', 4:'quadra', 3:'terno', 2:'duque' },
  'lotomania':  { 20:'vinte', 19:'dezenove', 18:'dezoito', 0:'zero' },
  'timemania':    { 7:'7 acertos', 6:'6 acertos', 5:'5 acertos', 4:'4 acertos', 3:'3 acertos' },
  'dia-de-sorte': { 7:'7 acertos', 6:'6 acertos', 5:'5 acertos', 4:'4 acertos' },
};

// Client Supabase REST
const sb = {
  async req(method, table, body=null, params='') {
    const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
    const h = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    };
    if (method==='POST'||method==='PATCH') h['Prefer']='return=representation';
    const res = await fetch(url, { method, headers:h, body: body?JSON.stringify(body):undefined });
    if (!res.ok) throw new Error(`[${method} ${table}] ${await res.text()}`);
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  },
  insert: (t,d)     => sb.req('POST',   t, d),
  select: (t,p='')  => sb.req('GET',    t, null, p),
  update: (t,d,p)   => sb.req('PATCH',  t, d, p),
  delete: (t,p)     => sb.req('DELETE', t, null, p),
};

// Busca resultado oficial via proxy Netlify (evita CORS)
async function buscarResultado(loteria, concurso) {
  try {
    const r = await fetch(`/.netlify/functions/resultado?loteria=${loteria}&concurso=${concurso}`);
    if (r.ok) {
      const d = await r.json();
      if (d.dezenas && d.dezenas.length > 0) return d;
    }
  } catch(e) { console.warn('Proxy falhou:', e.message); }

  // Fallback direto
  const ep = { 'mega-sena':'megasena', 'lotofacil':'lotofacil', 'quina':'quina', 'dupla-sena':'duplasena', 'lotomania':'lotomania', 'timemania':'timemania', 'dia-de-sorte':'diadesorte' };
  const r = await fetch(`https://servicebus2.caixa.gov.br/portaldeloterias/api/${ep[loteria]}/${concurso}`);
  if (!r.ok) throw new Error(`Resultado não disponível (HTTP ${r.status})`);
  const d = await r.json();
  return {
    concurso: d.numero,
    data: d.dataApuracao,
    dezenas: d.listaDezenas.map(x=>parseInt(x,10)).sort((a,b)=>a-b),
    rateio: (d.listaRateioPremio||[]).map(p=>({
      faixa: p.descricaoFaixa, ganhadores: p.numeroDeGanhadores, valor: p.valorPremio
    })),
  };
}

function calcularFaixa(loteria, dezenasComb, dezenasSorteio) {
  const set = new Set(dezenasSorteio);
  const acertos = dezenasComb.filter(d=>set.has(d)).length;
  const faixas = FAIXAS_PREMIADAS[loteria]||{};
  for (let a=acertos; a>=0; a--) {
    if (faixas[a]) return { acertos, faixa: faixas[a], premiado: true };
  }
  return { acertos, faixa: null, premiado: false };
}

function obterValorPremio(loteria, faixa, rateio) {
  const fixo = PREMIOS_FIXOS[loteria]?.[faixa];
  if (fixo !== null && fixo !== undefined) return fixo;
  if (!rateio) return null;
  for (const r of rateio) {
    const norm = r.faixa.toLowerCase().trim();
    // Tenta match: "15 Acertos" -> "15 acertos"
    if (norm === faixa.toLowerCase() && r.ganhadores > 0) return r.valor;
    // Match específico para Mega-Sena
    if (loteria === 'mega-sena') {
      if ((norm.includes('6') || norm.includes('seis')) && faixa==='sena' && r.ganhadores>0) return r.valor;
      if ((norm.includes('5') || norm.includes('cinco')) && faixa==='quina' && r.ganhadores>0) return r.valor;
      if ((norm.includes('4') || norm.includes('quatro')) && faixa==='quadra' && r.ganhadores>0) return r.valor;
    }
    // Match Quina
    if (loteria === 'quina') {
      if (norm.includes('5') && faixa==='quina' && r.ganhadores>0) return r.valor;
      if (norm.includes('4') && faixa==='quadra' && r.ganhadores>0) return r.valor;
      if (norm.includes('3') && faixa==='terno' && r.ganhadores>0) return r.valor;
      if (norm.includes('2') && faixa==='duque' && r.ganhadores>0) return r.valor;
    }
    // Match Dupla Sena (mesmo padrão de faixas da Quina)
    if (loteria === 'dupla-sena') {
      if (norm.includes('6') && faixa==='sena'   && r.ganhadores>0) return r.valor;
      if (norm.includes('5') && faixa==='quina'  && r.ganhadores>0) return r.valor;
      if (norm.includes('4') && faixa==='quadra' && r.ganhadores>0) return r.valor;
      if (norm.includes('3') && faixa==='terno'  && r.ganhadores>0) return r.valor;
      if (norm.includes('2') && faixa==='duque'  && r.ganhadores>0) return r.valor;
    }
  }
  return null;
}

async function salvarCombinacoes(cartoes, loteria, concurso, dezenasPorCartao, estrategia) {
  if (!concurso) return false;
  try {
    // Verifica duplicatas
    const existentes = await sb.select('combinacoes',
      `?loteria=eq.${loteria}&concurso=eq.${concurso}&status=eq.pendente&select=dezenas`
    ).catch(()=>[]);
    const jaExistem = new Set((existentes||[]).map(e=>JSON.stringify([...e.dezenas].sort((a,b)=>a-b))));

    const rows = cartoes
      .map(c => ({
        loteria, concurso,
        dezenas: c.dezenas,
        dezenas_por_cartao: dezenasPorCartao,
        estrategia,
        status: 'pendente',
      }))
      .filter(r => !jaExistem.has(JSON.stringify([...r.dezenas].sort((a,b)=>a-b))));

    if (rows.length === 0) return true;
    await sb.insert('combinacoes', rows);

    // Incrementa contador histórico (persiste mesmo após deletar não-premiadas)
    try {
      const atual = await sb.select('contadores_gerados', `?loteria=eq.${loteria}`);
      if (atual?.length) {
        await sb.update('contadores_gerados',
          {
            total: (parseInt(atual[0].total) || 0) + rows.length,
            atualizado_em: new Date().toISOString()
          },
          `?loteria=eq.${loteria}`
        );
      } else {
        // Loteria ainda não tem linha em contadores_gerados (primeira geração dela) — cria agora.
        await sb.insert('contadores_gerados', [{
          loteria, total: rows.length, atualizado_em: new Date().toISOString()
        }]);
      }
    } catch(e) {
      console.warn('Erro ao incrementar contador:', e.message);
    }

    return true;
  } catch(e) {
    console.error('Erro ao salvar:', e.message);
    return false;
  }
}

async function conferirConcurso(loteria, concurso) {
  const resultado = await buscarResultado(loteria, concurso);
  if (!resultado?.dezenas?.length) throw new Error(`Resultado do concurso ${concurso} indisponível.`);

  // Salva sorteio
  const jaConferido = await sb.select('sorteios_conferidos',
    `?loteria=eq.${loteria}&concurso=eq.${concurso}`
  ).catch(()=>[]);
  if (!jaConferido?.length) {
    await sb.insert('sorteios_conferidos', [{
      loteria, concurso: resultado.concurso||concurso,
      data_sorteio: resultado.data||'', dezenas: resultado.dezenas,
    }]).catch(()=>{});
  }

  // Busca pendentes
  const pendentes = await sb.select('combinacoes',
    `?loteria=eq.${loteria}&concurso=eq.${concurso}&status=eq.pendente`
  );
  if (!pendentes?.length) {
    return { concurso: resultado.concurso||concurso, dezenas: resultado.dezenas,
             conferidas:0, premiadas:0, deletadas:0, detalhes:[] };
  }

  // Dupla Sena tem dois sorteios por concurso — confere contra ambos e usa o melhor
  const isDuplaSena = loteria === 'dupla-sena';
  const dezenas2 = isDuplaSena ? (resultado.dezenasSegundo || []) : null;

  let premiadas=0, deletadas=0;
  const detalhes=[];

  for (const comb of pendentes) {
    let melhor = calcularFaixa(loteria, comb.dezenas, resultado.dezenas);
    // Para Dupla Sena: verifica também o segundo sorteio e usa o melhor resultado
    if (isDuplaSena && dezenas2.length) {
      const r2 = calcularFaixa(loteria, comb.dezenas, dezenas2);
      if (r2.acertos > melhor.acertos) melhor = r2;
    }
    const { acertos, faixa, premiado } = melhor;
    if (premiado) {
      const valor = obterValorPremio(loteria, faixa, resultado.rateio);
      await sb.update('combinacoes', {
        status:'premiada', faixa_premiada:faixa, acertos,
        valor_premio:valor, concurso_sorteado:resultado.concurso||concurso,
        resultado_sorteio:resultado.dezenas, conferido_em:new Date().toISOString(),
      }, `?id=eq.${comb.id}`);
      premiadas++;
      detalhes.push({ id:comb.id, faixa, acertos, valor });
    } else {
      await sb.delete('combinacoes', `?id=eq.${comb.id}`);
      deletadas++;
    }
  }

  // Atualiza sorteio com totais
  await sb.update('sorteios_conferidos',
    { total_combinacoes:pendentes.length, total_premiadas:premiadas, total_deletadas:deletadas },
    `?loteria=eq.${loteria}&concurso=eq.${concurso}`
  ).catch(()=>{});

  // Atualiza resumo por faixa
  await atualizarResumoPorFaixa(detalhes, loteria);

  return {
    concurso: resultado.concurso||concurso, dezenas: resultado.dezenas,
    conferidas: pendentes.length, premiadas, deletadas, detalhes,
  };
}

async function conferirTodosPendentes(loteria, onProgress) {
  const pendentes = await sb.select('combinacoes',
    `?loteria=eq.${loteria}&status=eq.pendente&select=concurso`
  );
  if (!pendentes?.length) return { concursos:0, resultados:[] };

  const concursos = [...new Set(pendentes.map(p=>p.concurso))].sort((a,b)=>a-b);
  const resultados = [];

  for (const concurso of concursos) {
    try {
      if (onProgress) onProgress(`Concurso ${concurso}...`);
      const r = await conferirConcurso(loteria, concurso);
      resultados.push({ concurso, ...r });
      await new Promise(res=>setTimeout(res, 600));
    } catch(e) {
      resultados.push({ concurso, erro: e.message });
    }
  }
  return { concursos: concursos.length, resultados };
}

async function atualizarResumoPorFaixa(detalhes, loteria) {
  if (!detalhes?.length) return;
  const porFaixa = {};
  for (const d of detalhes) {
    if (!porFaixa[d.faixa]) porFaixa[d.faixa] = { count:0, valor:0 };
    porFaixa[d.faixa].count++;
    porFaixa[d.faixa].valor += parseFloat(d.valor)||0;
  }
  for (const [faixa, dados] of Object.entries(porFaixa)) {
    try {
      const atual = await sb.select('resumo_por_faixa',
        `?loteria=eq.${loteria}&faixa=eq.${encodeURIComponent(faixa)}`
      );
      if (atual?.length) {
        await sb.update('resumo_por_faixa', {
          total_premiadas: (atual[0].total_premiadas||0) + dados.count,
          valor_total: parseFloat(atual[0].valor_total||0) + dados.valor,
          atualizado_em: new Date().toISOString(),
        }, `?loteria=eq.${loteria}&faixa=eq.${encodeURIComponent(faixa)}`);
      } else {
        // Faixa/loteria ainda não tem linha em resumo_por_faixa (primeira premiação dela) — cria agora.
        await sb.insert('resumo_por_faixa', [{
          loteria, faixa,
          total_premiadas: dados.count,
          valor_total: dados.valor,
          atualizado_em: new Date().toISOString(),
        }]);
      }
    } catch(e) { console.warn('Faixa update err:', e.message); }
  }
}

async function buscarResumoPorLoteria() {
  try {
    const dados = await sb.select('resumo_por_faixa', '?order=loteria.asc,ordem.asc');
    if (!dados) return {};
    const res = {};
    for (const row of dados) {
      if (!res[row.loteria]) res[row.loteria] = [];
      res[row.loteria].push({
        faixa: row.faixa,
        total: row.total_premiadas||0,
        valor: parseFloat(row.valor_total)||0,
      });
    }
    return res;
  } catch(e) { return {}; }
}

async function buscarContadoresGerados() {
  try {
    const dados = await sb.select('contadores_gerados', '?order=loteria.asc');
    if (!dados) return {};
    const res = {};
    for (const row of dados) res[row.loteria] = parseInt(row.total)||0;
    return res;
  } catch(e) { return {}; }
}

async function buscarTotaisGerais() {
  // Conta registros sem cair no limite de 1.000 linhas do Supabase REST
  async function countExact(tabela, filtro = '') {
    const qs = filtro ? `?${filtro}&select=id` : '?select=id';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}${qs}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'count=exact',
        'Range': '0-0',
      },
    });
    const range = res.headers.get('Content-Range') || '';
    const match = range.match(/\/(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  // Soma valor_premio paginando de 1.000 em 1.000 (evita truncamento silencioso)
  async function somarPremiadas() {
    let total = 0, page = 0;
    const size = 1000;
    while (true) {
      const from = page * size;
      const to   = from + size - 1;
      const res  = await fetch(
        `${SUPABASE_URL}/rest/v1/combinacoes?status=eq.premiada&select=valor_premio`,
        {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Range': `${from}-${to}`,
            'Range-Unit': 'items',
          },
        }
      );
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const r of rows) total += parseFloat(r.valor_premio || 0);
      if (rows.length < size) break;
      page++;
    }
    return total;
  }

  try {
    const [totalCombinacoes, totalPremiadas, totalSorteios, valorTotal] = await Promise.all([
      countExact('combinacoes', 'status=neq.expirada'),
      countExact('combinacoes', 'status=eq.premiada'),
      countExact('sorteios_conferidos'),
      somarPremiadas(),
    ]);
    return { totalCombinacoes, totalPremiadas, totalSorteios, valorTotal };
  } catch(e) {
    return { totalCombinacoes:0, totalPremiadas:0, totalSorteios:0, valorTotal:0 };
  }
}

async function registrarPremioManual(id, valor) {
  await sb.update('combinacoes', { valor_premio: valor }, `?id=eq.${id}`);
  // Atualiza resumo da faixa correspondente
  const comb = await sb.select('combinacoes', `?id=eq.${id}&select=loteria,faixa_premiada`);
  if (comb?.length) {
    const { loteria, faixa_premiada } = comb[0];
    await atualizarResumoPorFaixa([{ faixa: faixa_premiada, valor }], loteria);
  }
}

async function expirarAntigas() {
  const limite = new Date();
  limite.setDate(limite.getDate()-90);
  return sb.update('combinacoes',
    { status:'expirada' },
    `?status=eq.pendente&gerado_em=lt.${limite.toISOString()}`
  );
}

window.LotoiaDB = {
  salvarCombinacoes,
  conferirConcurso,
  conferirTodosPendentes,
  buscarResumoPorLoteria,
  buscarContadoresGerados,
  buscarTotaisGerais,
  registrarPremioManual,
  expirarAntigas,
  _sb: sb,
  _calcularFaixa: calcularFaixa,
  _buscarResultado: buscarResultado,
  _PREMIOS_FIXOS: PREMIOS_FIXOS,
  configurado: () => !SUPABASE_URL.includes('SEU_PROJETO'),
};