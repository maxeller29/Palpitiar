/**
 * loteca-diagnostico.js
 * Inspeciona o JSON real retornado pela API da Caixa para a Loteca.
 * Uso: node loteca-diagnostico.js
 *
 * Mostra a estrutura completa de um concurso recente e do próximo (1255).
 * Cole a saída no chat para continuar o desenvolvimento do pipeline.
 */

const https = require('https');

const CONCURSOS = [1254, 1255]; // 1254 = último encerrado, 1255 = próximo

function get(numero) {
  return new Promise((resolve, reject) => {
    const url = numero
      ? `https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca/${numero}`
      : `https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca`;

    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ numero, status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ numero, status: res.statusCode, body: data.slice(0, 500) });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function inspecionar(resultado) {
  const { numero, status, body } = resultado;
  console.log('\n' + '='.repeat(60));
  console.log(`CONCURSO ${numero ?? '(ultimo)'} — HTTP ${status}`);
  console.log('='.repeat(60));

  if (typeof body !== 'object') {
    console.log('RESPOSTA NAO-JSON:', body);
    return;
  }

  // Campos de topo
  const campos = Object.keys(body);
  console.log('\n[CAMPOS RAIZ]');
  campos.forEach(c => {
    const v = body[c];
    const tipo = Array.isArray(v) ? `array[${v.length}]` : v === null ? 'null' : typeof v;
    const preview = Array.isArray(v) && v.length > 0
      ? JSON.stringify(v[0]).slice(0, 120)
      : String(v).slice(0, 80);
    console.log(`  ${c.padEnd(40)} ${tipo.padEnd(12)} ${preview}`);
  });

  // Foco em listaResultadoEquipeEsportiva (jogos)
  if (body.listaResultadoEquipeEsportiva && body.listaResultadoEquipeEsportiva.length > 0) {
    console.log('\n[listaResultadoEquipeEsportiva — PRIMEIRO JOGO]');
    console.log(JSON.stringify(body.listaResultadoEquipeEsportiva[0], null, 2));
    console.log(`\n  Total de jogos: ${body.listaResultadoEquipeEsportiva.length}`);
  } else {
    console.log('\n[listaResultadoEquipeEsportiva] = null ou vazio (concurso ainda nao publicado?)');
  }

  // listaResultadoEquipesOrdenado (alternativo)
  if (body.listaResultadoEquipesOrdenado && body.listaResultadoEquipesOrdenado.length > 0) {
    console.log('\n[listaResultadoEquipesOrdenado — PRIMEIRO JOGO]');
    console.log(JSON.stringify(body.listaResultadoEquipesOrdenado[0], null, 2));
  }

  // Prêmios
  if (body.listaRateioPremio) {
    console.log('\n[listaRateioPremio]');
    console.log(JSON.stringify(body.listaRateioPremio, null, 2));
  }

  // Campos úteis para loteca_concursos
  console.log('\n[MAPEAMENTO loteca_concursos]');
  console.log(`  numero          = ${body.numero}`);
  console.log(`  data_sorteio    = ${body.dataApuracao}`);
  console.log(`  acumulado       = ${body.acumulado}`);
  console.log(`  arrecadacao     = ${body.valorArrecadado}`);
  console.log(`  estimativa_prox = ${body.valorEstimadoProximoConcurso}`);
  console.log(`  proxConcurso    = ${body.numeroConcursoProximo}`);
}

(async () => {
  console.log('Buscando dados da Loteca na API da Caixa...\n');

  for (const num of CONCURSOS) {
    try {
      const res = await get(num);
      inspecionar(res);
    } catch (err) {
      console.log(`\nERRO ao buscar concurso ${num}: ${err.message}`);
    }
    // Pausa entre requisições
    await new Promise(r => setTimeout(r, 800));
  }

  console.log('\n' + '='.repeat(60));
  console.log('Diagnostico concluido. Cole a saida acima no chat.');
  console.log('='.repeat(60));
})();