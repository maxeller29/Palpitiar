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
  // Ver todos os concursos recentes
  const concursos = await sb('loteca_concursos', {
    order: 'numero.desc', limit: '10',
    select: 'id,numero,status_analise,data_sorteio,estimativa_premio'
  });
  console.log('Últimos 10 concursos:\n');
  for (const c of concursos) {
    const jogos = await sb('loteca_jogos_analise', { concurso_id: `eq.${c.id}`, select: 'id' });
    console.log(`  ${c.numero} | ${c.data_sorteio} | ${c.status_analise} | ${jogos.length} jogos`);
  }
})();
