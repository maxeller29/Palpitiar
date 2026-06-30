'use strict';
const https = require('https');
const SUPABASE_URL = 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function sb(table, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
    https.get(url.toString(), {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

(async () => {
  const rows = await sb('times_mapeamento', { select: 'fonte_dados', limit: '500' });
  const valores = [...new Set(rows.map(r => r.fonte_dados))];
  console.log('Valores existentes de fonte_dados:', valores);
})();
