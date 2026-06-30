'use strict';
const https = require('https');
const SUPABASE_URL = 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function sb(method, table, body, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    if (params) Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(url, {
      method,
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
      },
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Body:', d);
        resolve(d);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  console.log('Tentando inserir NOVA ZELANDIA igual ao script de coleta...\n');
  await sb('POST', 'times_mapeamento', {
    nome_caixa: 'NOVA ZELANDIA TESTE',
    nome_popular: 'NOVA ZELANDIA TESTE',
    pais: 'Internacional',
    nivel_nacional: 'media',
    fonte_dados: 'automatico',
    ativo: true,
  });
})();
