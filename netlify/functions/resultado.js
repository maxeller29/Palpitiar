// netlify/functions/resultado.js
// Proxy para a API da Caixa — resolve o problema de CORS
// Deploy: coloque esta pasta em netlify/functions/ no seu site

exports.handler = async (event) => {
  const { loteria, concurso } = event.queryStringParameters || {};
  
  if (!loteria || !concurso) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Parâmetros loteria e concurso são obrigatórios' })
    };
  }

  // Mapeia nomes para endpoint da Caixa
  const endpoints = {
    'mega-sena':  'megasena',
    'lotofacil':  'lotofacil',
    'quina':      'quina',
    'lotomania':  'lotomania',
  };
  
  const endpoint = endpoints[loteria];
  if (!endpoint) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Loteria inválida' }) };
  }

  const url = `https://servicebus2.caixa.gov.br/portaldeloterias/api/${endpoint}/${concurso}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        'Accept': 'application/json',
        'Referer': 'https://loterias.caixa.gov.br/',
        'Origin': 'https://loterias.caixa.gov.br',
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `API da Caixa retornou ${response.status}` })
      };
    }

    const data = await response.json();
    
    // Extrai dezenas e rateio
    const dezenas = (data.listaDezenas || []).map(d => parseInt(d, 10)).sort((a, b) => a - b);
    const rateio  = (data.listaRateioPremio || []).map(p => ({
      faixa:      p.descricaoFaixa,
      ganhadores: p.numeroDeGanhadores,
      valor:      p.valorPremio,
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        concurso:    data.numero,
        data:        data.dataApuracao,
        dezenas,
        rateio,
        acumulado:   data.acumulado || false,
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
