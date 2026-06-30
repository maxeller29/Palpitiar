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
  for (const numero of [1257, 1258]) {
    const concursos = await sb('loteca_concursos', { numero: `eq.${numero}`, select: 'id,numero,status_analise,data_sorteio' });
    if (!concursos.length) { console.log(`Concurso ${numero}: NÃO existe no banco`); continue; }
    const c = concursos[0];
    console.log(`\nConcurso ${numero}:`, c);

    const jogos = await sb('loteca_jogos_analise', {
      concurso_id: `eq.${c.id}`,
      select: 'ordem,resumo,resultado_real',
      order: 'ordem.asc'
    });
    console.log(`  Jogos: ${jogos.length}`);
    jogos.forEach(j => console.log(`    [${j.ordem}] ${j.resumo} -> ${j.resultado_real || 'pendente'}`));
  }
})();
