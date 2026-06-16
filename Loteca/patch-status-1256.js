'use strict';
const https = require('https');
const SUPABASE_URL = 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_KEY) { console.error('SUPABASE_KEY nao definida'); process.exit(1); }

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
        if (res.statusCode >= 400) return reject(new Error(`Supabase ${res.statusCode}: ${data.slice(0,300)}`));
        try { resolve(data ? JSON.parse(data) : []); } catch { resolve([]); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  // Verificar status atual
  const antes = await supabase('GET', 'loteca_concursos', null, {
    numero: 'eq.1256', select: 'id,numero,status_analise,estimativa_premio',
  });
  console.log('Antes:', antes[0]);

  // Atualizar status para 'preliminar' E corrigir estimativa
  await supabase('PATCH', 'loteca_concursos',
    { status_analise: 'preliminar', estimativa_premio: 2000000 },
    { numero: 'eq.1256' }
  );

  const depois = await supabase('GET', 'loteca_concursos', null, {
    numero: 'eq.1256', select: 'id,numero,status_analise,estimativa_premio',
  });
  console.log('Depois:', depois[0]);
  console.log('\nOK — concurso 1256 agora em "preliminar", estimativa R$2.000.000,00');
})();
