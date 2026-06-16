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
  const concurso = await sb('loteca_concursos', { numero: 'eq.1256', select: 'id,status_analise' });
  console.log('Concurso:', concurso[0]);

  const jogos = await sb('loteca_jogos_analise', {
    concurso_id: `eq.${concurso[0].id}`,
    ordem: 'eq.4',
    select: 'ordem,resumo,score_casa,score_visit,p_coluna1,p_empate,p_coluna2,classificacao,resultado_sugerido,cobertura'
  });
  console.log('\nJogo 4 no banco:');
  console.log(jogos[0]);
})();
