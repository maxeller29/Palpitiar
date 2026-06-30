'use strict';
const https = require('https');
const SUPABASE_URL = 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function sb(method, table, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v));
    const req = https.request(url, {
      method,
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
      },
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { console.log(`  ${method} ${table} -> ${res.statusCode}`); resolve(d); });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  for (const numero of [1257, 1258]) {
    console.log(`\nLimpando concurso ${numero}...`);

    // Buscar id do concurso
    const url = new URL(`${SUPABASE_URL}/rest/v1/loteca_concursos`);
    url.searchParams.set('numero', `eq.${numero}`);
    url.searchParams.set('select', 'id');
    const res = await new Promise((resolve,reject) => {
      https.get(url.toString(), { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }, r => {
        let d=''; r.on('data',c=>d+=c); r.on('end',()=>resolve(JSON.parse(d)));
      }).on('error', reject);
    });

    if (!res.length) { console.log('  Não encontrado.'); continue; }
    const id = res[0].id;

    // Deletar jogos primeiro (FK)
    await sb('DELETE', 'loteca_jogos_analise', { concurso_id: `eq.${id}` });
    // Deletar concurso
    await sb('DELETE', 'loteca_concursos', { id: `eq.${id}` });

    console.log(`  Concurso ${numero} removido.`);
  }
  console.log('\nConcluído. Rode loteca-coletar-auto.js novamente para 1257.');
})();
