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
  const concurso = await sb('loteca_concursos', { numero: 'eq.1255', select: 'id,numero,status_analise,data_sorteio' });
  console.log('Concurso:', concurso[0]);

  const jogos = await sb('loteca_jogos_analise', {
    concurso_id: `eq.${concurso[0].id}`,
    select: 'ordem,resumo,resultado_real,resultado_sugerido,acertou',
    order: 'ordem.asc'
  });
  console.log('\nJogos:');
  jogos.forEach(j => {
    const res = j.resultado_real || 'pendente';
    const acertou = j.acertou === null ? '?' : j.acertou ? '✓' : '✗';
    console.log(`  [${String(j.ordem).padStart(2)}] ${acertou} ${res.padEnd(8)} sug:${j.resultado_sugerido.padEnd(8)} ${j.resumo}`);
  });
})();
