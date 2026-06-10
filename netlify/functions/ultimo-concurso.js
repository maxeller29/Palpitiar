// netlify/functions/ultimo-concurso.js
// Retorna todos os concursos novos desde `desde` (exclusive) até o mais recente disponível.
// Chamada: GET /.netlify/functions/ultimo-concurso?loteria=megasena&desde=3015
//
// Resposta JSON:
// {
//   loteria: 'megasena',
//   desde: 3015,
//   novos: [
//     {
//       concurso: 3016,
//       data: '2026-06-09',          // YYYY-MM-DD
//       dezenas: [11,19,33,52,55,60],
//       premiosJson: { s:0, gs:0, qn:..., gqn:..., qd:..., gqd:... },
//       ganhadores: 0
//     },
//     ...
//   ],
//   ultimoConcurso: 3016             // último encontrado (mesmo se novos=[])
// }

const CAIXA_BASE = 'https://servicebus2.caixa.gov.br/portaldeloterias/api';

// Mapeamento idêntico ao atualizar-historico.js
const LOTERIAS = {
  megasena: {
    slug: 'megasena',
    qtdDez: 6,
    premios(r) {
      const p = {}, f = r.premiacoes || [];
      const mF = { 0:'s',  1:'qn',  2:'qd'  };
      const mG = { 0:'gs', 1:'gqn', 2:'gqd' };
      f.forEach((x, i) => {
        if (mF[i]) {
          p[mF[i]] = x.valorPremio        || 0;
          p[mG[i]] = x.numeradorGanhadores || 0;
        }
      });
      return p;
    }
  },
  lotofacil: {
    slug: 'lotofacil',
    qtdDez: 15,
    premios(r) {
      const p = {}, f = r.premiacoes || [];
      const mF = { 0:'15', 1:'14', 2:'13', 3:'12', 4:'11' };
      const mG = { 0:'g15',1:'g14',2:'g13',3:'g12',4:'g11' };
      f.forEach((x, i) => {
        if (mF[i]) {
          p[mF[i]] = x.valorPremio        || 0;
          p[mG[i]] = x.numeradorGanhadores || 0;
        }
      });
      return p;
    }
  },
  quina: {
    slug: 'quina',
    qtdDez: 5,
    premios(r) {
      const p = {}, f = r.premiacoes || [];
      const mF = { 0:'5', 1:'4', 2:'3', 3:'2' };
      const mG = { 0:'g5',1:'g4',2:'g3',3:'g2' };
      f.forEach((x, i) => {
        if (mF[i]) {
          p[mF[i]] = x.valorPremio        || 0;
          p[mG[i]] = x.numeradorGanhadores || 0;
        }
      });
      return p;
    }
  }
};

function formatarData(d) {
  if (!d) return null;
  // Caixa retorna "dd/MM/yyyy" — converte para "yyyy-MM-dd"
  const p = d.split('/');
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  return d; // já está no formato correto
}

async function fetchConcurso(slug, numero) {
  const url = `${CAIXA_BASE}/${slug}/${numero}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
      'Accept':     'application/json',
      'Referer':    'https://loterias.caixa.gov.br/',
      'Origin':     'https://loterias.caixa.gov.br',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;   // concurso não existe ainda
  if (!res.ok) throw new Error(`Caixa HTTP ${res.status} para ${slug}/${numero}`);
  return res.json();
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control':               'no-store',
  };

  // ── Parâmetros ────────────────────────────────────────────
  const { loteria, desde } = event.queryStringParameters || {};

  if (!loteria || !desde) {
    return { statusCode: 400, headers,
      body: JSON.stringify({ error: 'Parâmetros obrigatórios: loteria, desde' }) };
  }

  const cfg = LOTERIAS[loteria];
  if (!cfg) {
    return { statusCode: 400, headers,
      body: JSON.stringify({ error: `Loteria inválida: ${loteria}` }) };
  }

  const desdeNum = parseInt(desde, 10);
  if (isNaN(desdeNum) || desdeNum < 1) {
    return { statusCode: 400, headers,
      body: JSON.stringify({ error: 'desde deve ser um número inteiro positivo' }) };
  }

  // ── Busca concursos novos (desde+1 em diante) ─────────────
  const novos = [];
  let proximo = desdeNum + 1;
  let ultimoConcurso = desdeNum;

  // Limita a 30 concursos por chamada (proteção contra loops longos)
  const MAX_NOVOS = 30;

  try {
    while (novos.length < MAX_NOVOS) {
      const data = await fetchConcurso(cfg.slug, proximo);
      if (!data) break; // concurso não existe ainda — chegamos ao fim

      const dezenas = (data.listaDezenas || data.dezenas || [])
        .map(Number)
        .sort((a, b) => a - b);

      if (dezenas.length !== cfg.qtdDez) break; // resposta inválida

      novos.push({
        concurso:   data.numero || proximo,
        data:       formatarData(data.dataApuracao || data.data),
        dezenas,
        premiosJson: cfg.premios(data),
        ganhadores: data.numeradorGanhadores || data.ganhadores || 0,
      });

      ultimoConcurso = proximo;
      proximo++;
    }
  } catch (err) {
    // Se falhou no meio, retorna o que já coletou + erro informativo
    return {
      statusCode: 200,  // 200 para o cliente poder usar os parciais
      headers,
      body: JSON.stringify({
        loteria,
        desde: desdeNum,
        novos,
        ultimoConcurso,
        aviso: `Erro ao buscar concurso ${proximo}: ${err.message}`,
      }),
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ loteria, desde: desdeNum, novos, ultimoConcurso }),
  };
};
