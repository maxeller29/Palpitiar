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
  // ID que o admin está usando
  const porId = await sb('loteca_jogos_analise', {
    id: 'eq.3ba8d30d-5f4b-4bca-81db-adf7ebe3b407',
    select: 'id,ordem,resumo,score_casa,score_visit'
  });
  console.log('Busca por ID (admin usa):', porId);

  // ID real do jogo 4
  const concurso = await sb('loteca_concursos', { numero: 'eq.1256', select: 'id' });
  const porOrdem = await sb('loteca_jogos_analise', {
    concurso_id: `eq.${concurso[0].id}`,
    ordem: 'eq.4',
    select: 'id,ordem,resumo,score_casa,score_visit'
  });
  console.log('Jogo 4 real no banco:', porOrdem[0]);
})();
