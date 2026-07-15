// netlify/functions/analisar-loteca.js
// Dispara o workflow "Loteca — Analisar concurso" no GitHub Actions a partir
// do botão "Análise automática" do admin-loteca.html.
//
// Variáveis de ambiente (configurar no painel do Netlify):
//   GITHUB_TOKEN  = PAT fine-grained com permissão Actions: Read and write
//                   no repositório maxeller29/Palpitiar
//   SUPABASE_KEY  = mesma chave secreta usada pelo admin (autentica a chamada)
//   GITHUB_REPO   = opcional, padrão "maxeller29/Palpitiar"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Use POST' }) };
  }

  // Autenticação: o admin envia a chave do Supabase que já usa; comparamos
  // com a mesma chave configurada no ambiente do Netlify.
  const auth = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!process.env.SUPABASE_KEY || auth !== process.env.SUPABASE_KEY) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Não autorizado' }) };
  }
  if (!process.env.GITHUB_TOKEN) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'GITHUB_TOKEN não configurado no Netlify' }) };
  }

  let numero, skipOdds, forcar;
  try {
    const body = JSON.parse(event.body || '{}');
    numero = parseInt(body.numero, 10);
    skipOdds = !!body.skip_odds;
    forcar = !!body.forcar;
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Body inválido' }) };
  }
  if (!numero || numero < 1) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Informe o número do concurso' }) };
  }

  const repo = process.env.GITHUB_REPO || 'maxeller29/Palpitiar';
  const url = `https://api.github.com/repos/${repo}/actions/workflows/loteca-analisar.yml/dispatches`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'palpitiar-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { numero: String(numero), skip_odds: skipOdds ? 'true' : 'false', forcar: forcar ? 'true' : 'false' },
      }),
    });

    if (res.status === 204) {
      return {
        statusCode: 200,
        headers: Object.assign({ 'Content-Type': 'application/json' }, CORS),
        body: JSON.stringify({ ok: true, numero, mensagem: 'Análise disparada — resultados no banco em ~2–4 min' }),
      };
    }
    const texto = await res.text();
    return {
      statusCode: res.status,
      headers: Object.assign({ 'Content-Type': 'application/json' }, CORS),
      body: JSON.stringify({ error: `GitHub ${res.status}: ${texto.slice(0, 300)}` }),
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
