/**
 * Palpitiar — Conferência Automática de Combinações
 * Espelha EXATAMENTE a lógica do lotoia-db.js (v2).
 * Roda via GitHub Actions — sem browser, sem computador ligado.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ─── CONSTANTES (idênticas ao lotoia-db.js, expandidas para as novas loterias) ─

const PREMIOS_FIXOS = {
  'lotofacil': {
    '11 acertos': 6.00, '12 acertos': 12.00, '13 acertos': 30.00,
    '14 acertos': null, '15 acertos': null,
  },
  'mega-sena':    { 'sena': null, 'quina': null, 'quadra': null },
  'quina':        { 'quina': null, 'quadra': null, 'terno': null, 'duque': null },
  'lotomania':    { '20 acertos': null, '19 acertos': null, '18 acertos': null, '17 acertos': null, '16 acertos': null, '0 acertos': null },
  'timemania':    { '7 acertos': null, '6 acertos': null, '5 acertos': null, '4 acertos': null, '3 acertos': null },
  'dia-de-sorte': { '7 acertos': null, '6 acertos': null, '5 acertos': null, '4 acertos': null },
  'dupla-sena':   { 'sena': null, 'quina': null, 'quadra': null, 'terno': null },
};

const FAIXAS_PREMIADAS = {
  'mega-sena':    { 6:'sena', 5:'quina', 4:'quadra' },
  'lotofacil':    { 15:'15 acertos', 14:'14 acertos', 13:'13 acertos', 12:'12 acertos', 11:'11 acertos' },
  'quina':        { 5:'quina', 4:'quadra', 3:'terno', 2:'duque' },
  'lotomania':    { 20:'20 acertos', 19:'19 acertos', 18:'18 acertos', 17:'17 acertos', 16:'16 acertos', 0:'0 acertos' },
  'timemania':    { 7:'7 acertos', 6:'6 acertos', 5:'5 acertos', 4:'4 acertos', 3:'3 acertos' },
  'dia-de-sorte': { 7:'7 acertos', 6:'6 acertos', 5:'5 acertos', 4:'4 acertos' },
  'dupla-sena':   { 6:'sena', 5:'quina', 4:'quadra', 3:'terno' },
};

const LOTERIAS = [
  { id: 'mega-sena',    nome: 'Mega-Sena',    slug: 'megasena'  },
  { id: 'lotofacil',    nome: 'Lotofácil',    slug: 'lotofacil' },
  { id: 'quina',        nome: 'Quina',        slug: 'quina'     },
  { id: 'lotomania',    nome: 'Lotomania',    slug: 'lotomania',   dual: false },
  { id: 'timemania',    nome: 'Timemania',    slug: 'timemania',   dual: false },
  { id: 'dia-de-sorte', nome: 'Dia de Sorte', slug: 'diadesorte',  dual: false },
  { id: 'dupla-sena',   nome: 'Dupla Sena',   slug: 'duplasena',   dual: true },
];

// ─── SUPABASE (idêntico ao lotoia-db.js) ─────────────────────────────────────

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
  delete: (t, p)    => sb.req('DELETE', t, null, p),
};

// ─── BUSCAR RESULTADO (idêntico ao lotoia-db.js — acesso direto à Caixa) ─────

async function buscarResultado(loteria, concurso) {
  const ep = {
    'mega-sena': 'megasena', 'lotofacil': 'lotofacil', 'quina': 'quina',
    'lotomania': 'lotomania', 'timemania': 'timemania', 'dia-de-sorte': 'diadesorte',
  };
  const r = await fetch(
    `https://servicebus2.caixa.gov.br/portaldeloterias/api/${ep[loteria]}/${concurso}`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();

  // Normaliza igual ao lotoia-db.js
  return {
    concurso: d.numero,
    data: d.dataApuracao,
    dezenas: d.listaDezenas.map(x => parseInt(x, 10)).sort((a, b) => a - b),
    rateio: (d.listaRateioPremio || []).map(p => ({
      faixa: p.descricaoFaixa,
      ganhadores: p.numeroDeGanhadores,
      valor: p.valorPremio,
    })),
  };
}

// Dupla Sena tem DOIS sorteios por concurso — o mesmo bilhete concorre nos dois.
// O listaRateioPremio vem com 8 faixas: as 4 primeiras são do 1º sorteio
// (sena/quina/quadra/terno) e as 4 últimas são do 2º sorteio, na mesma ordem.
async function buscarResultadoDual(loteria, concurso) {
  const r = await fetch(
    `https://servicebus2.caixa.gov.br/portaldeloterias/api/duplasena/${concurso}`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (!d.listaDezenas || !d.listaDezenasSegundoSorteio) {
    throw new Error(`Concurso ${concurso} sem os dois sorteios disponíveis ainda.`);
  }

  const rateio = (d.listaRateioPremio || []).map(p => ({
    faixa: p.descricaoFaixa,
    ganhadores: p.numeroDeGanhadores,
    valor: p.valorPremio,
  }));

  return {
    concurso: d.numero,
    data: d.dataApuracao,
    dezenas1: d.listaDezenas.map(x => parseInt(x, 10)).sort((a, b) => a - b),
    dezenas2: d.listaDezenasSegundoSorteio.map(x => parseInt(x, 10)).sort((a, b) => a - b),
    rateio1: rateio.slice(0, 4),
    rateio2: rateio.slice(4, 8),
  };
}

// ─── CALCULAR FAIXA (idêntico ao lotoia-db.js) ───────────────────────────────

function calcularFaixa(loteria, dezenasComb, dezenasSorteio) {
  const set = new Set(dezenasSorteio);
  const acertos = dezenasComb.filter(d => set.has(d)).length;
  const faixas = FAIXAS_PREMIADAS[loteria] || {};
  // Varre de "acertos" até 1 — nunca inclui a faixa "0" no scan genérico, porque ela é um
  // caso especial (ex.: Lotomania premia quem NÃO acerta nada) e não pode ser confundida
  // com "não ganhou nenhuma faixa" para quem tem 1-15 acertos, por exemplo.
  for (let a = acertos; a >= 1; a--) {
    if (faixas[a]) return { acertos, faixa: faixas[a], premiado: true };
  }
  // Caso especial: prêmio por zero acertos (Lotomania) — só conta se o real for exatamente 0.
  if (acertos === 0 && faixas[0]) return { acertos, faixa: faixas[0], premiado: true };
  return { acertos, faixa: null, premiado: false };
}

// ─── OBTER VALOR PRÊMIO (idêntico ao lotoia-db.js) ───────────────────────────

function obterValorPremio(loteria, faixa, rateio) {
  const fixo = PREMIOS_FIXOS[loteria]?.[faixa];
  if (fixo !== null && fixo !== undefined) return fixo;
  if (!rateio) return null;
  for (const r of rateio) {
    const norm = r.faixa.toLowerCase().trim();
    if (norm === faixa.toLowerCase() && r.ganhadores > 0) return r.valor;
    if (loteria === 'mega-sena') {
      if ((norm.includes('6') || norm.includes('seis'))   && faixa === 'sena'   && r.ganhadores > 0) return r.valor;
      if ((norm.includes('5') || norm.includes('cinco'))  && faixa === 'quina'  && r.ganhadores > 0) return r.valor;
      if ((norm.includes('4') || norm.includes('quatro')) && faixa === 'quadra' && r.ganhadores > 0) return r.valor;
    }
    if (loteria === 'quina') {
      if (norm.includes('5') && faixa === 'quina'  && r.ganhadores > 0) return r.valor;
      if (norm.includes('4') && faixa === 'quadra' && r.ganhadores > 0) return r.valor;
      if (norm.includes('3') && faixa === 'terno'  && r.ganhadores > 0) return r.valor;
      if (norm.includes('2') && faixa === 'duque'  && r.ganhadores > 0) return r.valor;
    }
    if (loteria === 'dupla-sena') {
      if ((norm.includes('6') || norm.includes('seis'))   && faixa === 'sena'   && r.ganhadores > 0) return r.valor;
      if ((norm.includes('5') || norm.includes('cinco'))  && faixa === 'quina'  && r.ganhadores > 0) return r.valor;
      if ((norm.includes('4') || norm.includes('quatro')) && faixa === 'quadra' && r.ganhadores > 0) return r.valor;
      if (norm.includes('3') && faixa === 'terno' && r.ganhadores > 0) return r.valor;
    }
    if (loteria === 'lotomania' && faixa === '0 acertos') {
      // A descrição exata da Caixa para essa faixa pode variar ("0 acerto", "nenhum acerto"
      // etc.) — cobre as variações mais prováveis. Validar contra uma resposta real da API.
      if ((norm.includes('0 acerto') || norm.includes('nenhum acerto') || norm === '0') && r.ganhadores > 0) return r.valor;
    }
  }
  return null;
}

// ─── CONFERIR CONCURSO (idêntico ao lotoia-db.js) ────────────────────────────

async function conferirConcurso(loteria, concurso) {
  const resultado = await buscarResultado(loteria, concurso);
  if (!resultado?.dezenas?.length) throw new Error(`Resultado do concurso ${concurso} indisponível.`);

  // Registra sorteio se ainda não existir
  const jaConferido = await sb.select('sorteios_conferidos',
    `?loteria=eq.${loteria}&concurso=eq.${concurso}`
  ).catch(() => []);
  if (!jaConferido?.length) {
    await sb.insert('sorteios_conferidos', [{
      loteria,
      concurso: resultado.concurso || concurso,
      data_sorteio: resultado.data || '',
      dezenas: resultado.dezenas,
    }]).catch(() => {});
  }

  // Busca pendentes deste concurso
  const pendentes = await sb.select('combinacoes',
    `?loteria=eq.${loteria}&concurso=eq.${concurso}&status=eq.pendente`
  );
  if (!pendentes?.length) {
    return { concurso: resultado.concurso || concurso, dezenas: resultado.dezenas,
             conferidas: 0, premiadas: 0, deletadas: 0, detalhes: [] };
  }

  let premiadas = 0, deletadas = 0;
  const detalhes = [];

  for (const comb of pendentes) {
    const { acertos, faixa, premiado } = calcularFaixa(loteria, comb.dezenas, resultado.dezenas);
    if (premiado) {
      const valor = obterValorPremio(loteria, faixa, resultado.rateio);
      await sb.update('combinacoes', {
        status: 'premiada',
        faixa_premiada: faixa,
        acertos,
        valor_premio: valor,
        concurso_sorteado: resultado.concurso || concurso,
        resultado_sorteio: resultado.dezenas,
        conferido_em: new Date().toISOString(),
      }, `?id=eq.${comb.id}`);
      premiadas++;
      detalhes.push({ id: comb.id, faixa, acertos, valor });
    } else {
      await sb.delete('combinacoes', `?id=eq.${comb.id}`);
      deletadas++;
    }
  }

  // Atualiza totais no sorteio_conferido
  await sb.update('sorteios_conferidos',
    { total_combinacoes: pendentes.length, total_premiadas: premiadas, total_deletadas: deletadas },
    `?loteria=eq.${loteria}&concurso=eq.${concurso}`
  ).catch(() => {});

  // Atualiza resumo por faixa
  await atualizarResumoPorFaixa(detalhes, loteria);

  return {
    concurso: resultado.concurso || concurso,
    dezenas: resultado.dezenas,
    conferidas: pendentes.length,
    premiadas,
    deletadas,
    detalhes,
  };
}

// ─── CONFERIR CONCURSO — DUPLA SENA (dois sorteios, mesmo bilhete) ───────────
// Cada linha em `combinacoes` é UM jogo de 6 a 15 dezenas, que concorre nos DOIS
// sorteios do concurso de forma independente (regra real da Dupla Sena). Se o
// jogo ganhar nos dois sorteios, somamos os dois prêmios e registramos ambas as
// faixas no campo `faixa_premiada`.
async function conferirConcursoDuplaSena(concurso) {
  const resultado = await buscarResultadoDual('dupla-sena', concurso);

  const jaConferido = await sb.select('sorteios_conferidos',
    `?loteria=eq.dupla-sena&concurso=eq.${concurso}`
  ).catch(() => []);
  if (!jaConferido?.length) {
    await sb.insert('sorteios_conferidos', [{
      loteria: 'dupla-sena',
      concurso: resultado.concurso || concurso,
      data_sorteio: resultado.data || '',
      dezenas: resultado.dezenas1, // 1º sorteio como referência principal
    }]).catch(() => {});
  }

  const pendentes = await sb.select('combinacoes',
    `?loteria=eq.dupla-sena&concurso=eq.${concurso}&status=eq.pendente`
  );
  if (!pendentes?.length) {
    return { concurso: resultado.concurso || concurso, dezenas: resultado.dezenas1,
             conferidas: 0, premiadas: 0, deletadas: 0, detalhes: [] };
  }

  let premiadas = 0, deletadas = 0;
  const detalhes = [];

  for (const comb of pendentes) {
    const r1 = calcularFaixa('dupla-sena', comb.dezenas, resultado.dezenas1);
    const r2 = calcularFaixa('dupla-sena', comb.dezenas, resultado.dezenas2);
    const v1 = r1.premiado ? (obterValorPremio('dupla-sena', r1.faixa, resultado.rateio1) || 0) : 0;
    const v2 = r2.premiado ? (obterValorPremio('dupla-sena', r2.faixa, resultado.rateio2) || 0) : 0;

    if (r1.premiado || r2.premiado) {
      const partes = [];
      if (r1.premiado) partes.push(`${r1.faixa} (1º sorteio, ${r1.acertos} acertos)`);
      if (r2.premiado) partes.push(`${r2.faixa} (2º sorteio, ${r2.acertos} acertos)`);
      const faixaTexto = partes.join(' + ');
      const acertosMax = Math.max(r1.acertos, r2.acertos);
      const valorTotal = v1 + v2;

      await sb.update('combinacoes', {
        status: 'premiada',
        faixa_premiada: faixaTexto,
        acertos: acertosMax,
        valor_premio: valorTotal,
        concurso_sorteado: resultado.concurso || concurso,
        resultado_sorteio: resultado.dezenas1,
        resultado_sorteio_2: resultado.dezenas2,
        conferido_em: new Date().toISOString(),
      }, `?id=eq.${comb.id}`).catch(async (e) => {
        // Caso a coluna resultado_sorteio_2 não exista ainda na tabela, tenta sem ela.
        if (String(e.message).includes('resultado_sorteio_2')) {
          await sb.update('combinacoes', {
            status: 'premiada',
            faixa_premiada: faixaTexto,
            acertos: acertosMax,
            valor_premio: valorTotal,
            concurso_sorteado: resultado.concurso || concurso,
            resultado_sorteio: resultado.dezenas1,
            conferido_em: new Date().toISOString(),
          }, `?id=eq.${comb.id}`);
        } else {
          throw e;
        }
      });
      premiadas++;
      detalhes.push({ id: comb.id, faixa: (r1.premiado ? r1.faixa : r2.faixa), acertos: acertosMax, valor: valorTotal });
    } else {
      await sb.delete('combinacoes', `?id=eq.${comb.id}`);
      deletadas++;
    }
  }

  await sb.update('sorteios_conferidos',
    { total_combinacoes: pendentes.length, total_premiadas: premiadas, total_deletadas: deletadas },
    `?loteria=eq.dupla-sena&concurso=eq.${concurso}`
  ).catch(() => {});

  await atualizarResumoPorFaixa(detalhes, 'dupla-sena');

  return {
    concurso: resultado.concurso || concurso,
    dezenas: resultado.dezenas1,
    conferidas: pendentes.length,
    premiadas,
    deletadas,
    detalhes,
  };
}

// ─── ATUALIZAR RESUMO POR FAIXA (idêntico ao lotoia-db.js) ──────────────────

async function atualizarResumoPorFaixa(detalhes, loteria) {
  if (!detalhes?.length) return;
  const porFaixa = {};
  for (const d of detalhes) {
    if (!porFaixa[d.faixa]) porFaixa[d.faixa] = { count: 0, valor: 0 };
    porFaixa[d.faixa].count++;
    porFaixa[d.faixa].valor += parseFloat(d.valor) || 0;
  }
  for (const [faixa, dados] of Object.entries(porFaixa)) {
    try {
      const atual = await sb.select('resumo_por_faixa',
        `?loteria=eq.${loteria}&faixa=eq.${encodeURIComponent(faixa)}`
      );
      if (atual?.length) {
        await sb.update('resumo_por_faixa', {
          total_premiadas: (atual[0].total_premiadas || 0) + dados.count,
          valor_total: parseFloat(atual[0].valor_total || 0) + dados.valor,
          atualizado_em: new Date().toISOString(),
        }, `?loteria=eq.${loteria}&faixa=eq.${encodeURIComponent(faixa)}`);
      }
    } catch (e) {
      console.warn('Faixa update err:', e.message);
    }
  }
}

// ─── CONFERIR TODOS OS PENDENTES DE UMA LOTERIA ───────────────────────────────

async function conferirLoteria(loteria) {
  log(`\n▶ Iniciando conferência: ${loteria.nome}`);

  // Busca todos os concursos distintos com pendentes
  const pendentes = await sb.select('combinacoes',
    `?loteria=eq.${loteria.id}&status=eq.pendente&select=concurso`
  );

  if (!pendentes?.length) {
    log(`  ✓ Nenhuma combinação pendente. Pulando.`);
    return { inicial: 0, final: 0, conferidas: 0, iteracoes: 0, concursosPulados: [] };
  }

  const concursos = [...new Set(pendentes.map(p => p.concurso))].sort((a, b) => a - b);
  const inicial = pendentes.length;
  log(`  Pendentes iniciais: ${inicial} em ${concursos.length} concurso(s): [${concursos.join(', ')}]`);

  let totalConferidas = 0;
  let iteracoes = 0;
  const concursosPulados = [];

  for (const concurso of concursos) {
    iteracoes++;
    log(`  → Concurso ${concurso}...`);

    try {
      const r = loteria.dual
        ? await conferirConcursoDuplaSena(concurso)
        : await conferirConcurso(loteria.id, concurso);
      log(`    ✓ Dezenas: [${r.dezenas.join(', ')}] | conferidas: ${r.conferidas} | premiadas: ${r.premiadas} | deletadas: ${r.deletadas}`);
      totalConferidas += r.conferidas;
    } catch (e) {
      // Se der erro (concurso futuro, API indisponível, etc.) — pula
      log(`    ⏭ Pulando concurso ${concurso}: ${e.message}`);
      concursosPulados.push(concurso);
    }

    await sleep(600); // pausa entre concursos (igual ao lotoia-db.js)
  }

  // Recontagem final
  const restantes = await sb.select('combinacoes',
    `?loteria=eq.${loteria.id}&status=eq.pendente&select=id`
  );
  const final = restantes?.length || 0;

  log(`\n  ${loteria.nome}: ${inicial} → ${final} pendentes | ${totalConferidas} conferidas | ${iteracoes} iterações`);

  return { inicial, final, conferidas: totalConferidas, iteracoes, concursosPulados };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const inicio = Date.now();
  log('═══════════════════════════════════════════════════');
  log(`🎱 Palpitiar — Conferência Automática`);
  log(`📅 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  log('═══════════════════════════════════════════════════');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    log('✗ ERRO: SUPABASE_URL e SUPABASE_KEY são obrigatórias.');
    process.exit(1);
  }

  const resultados = {};

  for (const loteria of LOTERIAS) {
    try {
      resultados[loteria.id] = await conferirLoteria(loteria);
    } catch (err) {
      log(`\n✗ Erro inesperado em ${loteria.nome}: ${err.message}`);
      resultados[loteria.id] = { erro: err.message };
    }
  }

  // Relatório final
  const duracao = ((Date.now() - inicio) / 1000).toFixed(0);
  log('\n═══════════════════════════════════════════════════');
  log('📊 RELATÓRIO FINAL');
  log('═══════════════════════════════════════════════════');
  log('');
  log('Loteria       | Inicial | Final | Conferidas | Iter.');
  log('─────────────────────────────────────────────────────');

  for (const loteria of LOTERIAS) {
    const r = resultados[loteria.id];
    if (r.erro) {
      log(`${loteria.nome.padEnd(13)} | ERRO: ${r.erro}`);
    } else {
      const linha = `${loteria.nome.padEnd(13)} | ${String(r.inicial).padStart(7)} | ${String(r.final).padStart(5)} | ${String(r.conferidas).padStart(10)} | ${String(r.iteracoes).padStart(5)}`;
      log(linha);
      if (r.concursosPulados?.length > 0) {
        log(`              ↳ ⏭ Concursos futuros/indisponíveis: [${r.concursosPulados.join(', ')}]`);
      }
    }
  }

  log('');
  log(`⏱ Tempo total: ${duracao}s`);
  log('═══════════════════════════════════════════════════');
}

// ─── UTILITÁRIOS ──────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(msg)  { console.log(msg); }

main().catch(err => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
