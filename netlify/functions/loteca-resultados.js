// netlify/functions/loteca-resultados.js
// Proxy server-side para buscar resultados ao vivo de jogos da Loteca
// Uso: /.netlify/functions/loteca-resultados?concurso=1255&data=2026-06-14

const https = require('https');

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Palpitiar/1.0)',
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON inválido')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// 1. ESPN — Copa do Mundo 2026
async function buscarESPN(dataISO) {
  try {
    const d8 = dataISO.replace(/-/g, '');
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${d8}`;
    const d = await httpGet(url);
    return (d.events || []).map(e => {
      const c = e.competitions?.[0];
      const comp = c?.competitors || [];
      const home = comp.find(t => t.homeAway === 'home');
      const away = comp.find(t => t.homeAway === 'away');
      const tipo = c?.status?.type || {};
      const status = tipo.completed ? 'FT'
        : tipo.id === '2' ? 'LIVE' : 'NS';
      return {
        homeTeam: home?.team?.displayName || '',
        awayTeam: away?.team?.displayName || '',
        homeScore: status !== 'NS' ? parseInt(home?.score ?? '') : null,
        awayScore: status !== 'NS' ? parseInt(away?.score ?? '') : null,
        status,
        fonte: 'espn',
      };
    }).filter(j => j.homeTeam);
  } catch (e) {
    console.log('[ESPN]', e.message);
    return [];
  }
}

// 2. API-Sports (chave do usuário)
async function buscarAPISports(dataISO) {
  try {
    const key = process.env.APIFOOTBALL_KEY || 'fb7adb6b119535409dbfa87eb73134f0';
    const url = `https://v3.football.api-sports.io/fixtures?league=1&season=2026&from=${dataISO}&to=${dataISO}`;
    const d = await httpGet(url, { 'x-apisports-key': key });
    return (d.response || []).map(m => ({
      homeTeam: m.teams.home.name,
      awayTeam: m.teams.away.name,
      homeScore: m.goals.home,
      awayScore: m.goals.away,
      status: m.fixture.status.short,
      fonte: 'api-sports',
    }));
  } catch (e) {
    console.log('[API-Sports]', e.message);
    return [];
  }
}

// 3. API da Caixa (apenas quando todos os jogos terminarem)
async function buscarCaixa(numero) {
  try {
    const url = `https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca/${numero}`;
    return await httpGet(url);
  } catch (e) {
    console.log('[Caixa]', e.message);
    return null;
  }
}

exports.handler = async (event) => {
  const { concurso, data } = event.queryStringParameters || {};
  const dataISO = data || new Date().toISOString().slice(0, 10);

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  };

  try {
    let partidas = [];
    let fonte = '';

    // Tentativa 1: ESPN
    partidas = await buscarESPN(dataISO);
    if (partidas.length) {
      fonte = 'espn';
    } else {
      // Tentativa 2: API-Sports
      partidas = await buscarAPISports(dataISO);
      if (partidas.length) fonte = 'api-sports';
    }

    // Tentativa 3: Caixa (completo)
    if (!partidas.length && concurso) {
      const caixa = await buscarCaixa(concurso);
      if (caixa?.listaResultadoEquipeEsportiva) {
        const jogosApi = [...caixa.listaResultadoEquipeEsportiva]
          .sort((a, b) => a.nuJogo - b.nuJogo);
        partidas = jogosApi.map(j => ({
          homeTeam: j.nomeEquipeUm || '',
          awayTeam: j.nomeEquipeDois || '',
          homeScore: j.nuGolEquipeUm ?? null,
          awayScore: j.nuGolEquipeDois ?? null,
          status: j.nuGolEquipeUm !== null ? 'FT' : 'NS',
          fonte: 'caixa',
          // Extra: premiação
          rateio14: caixa.listaRateioPremio?.find(r => r.descricaoFaixa?.includes('14'))?.valorPremio,
          ganhadores14: caixa.listaRateioPremio?.find(r => r.descricaoFaixa?.includes('14'))?.numeroDeGanhadores,
        }));
        fonte = 'caixa';
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        fonte,
        data: dataISO,
        total: partidas.length,
        partidas,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, erro: e.message }),
    };
  }
};
