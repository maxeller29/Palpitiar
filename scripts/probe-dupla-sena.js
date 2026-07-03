'use strict';
// Probe único para entender a estrutura do response da API da Caixa para Dupla Sena
const https = require('https');
function fetch(num) {
  return new Promise((resolve) => {
    const url = `https://servicebus2.caixa.gov.br/portaldeloterias/api/duplasena/${num}`;
    const req = https.get(url, {headers: {Accept:'application/json','User-Agent':'probe/1.0'}}, res => {
      let b = ''; res.setEncoding('utf8');
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch(e) { resolve({_parseErr: b.slice(0,500)}); } });
    });
    req.on('error', e => resolve({_err: e.message}));
    req.setTimeout(20000, () => { req.destroy(); resolve({_err:'timeout'}); });
  });
}
(async () => {
  const r = await fetch(2600); // concurso recente
  const keys = Object.keys(r);
  console.log('=== KEYS ===\n', keys.join('\n'));
  console.log('\n=== DEZENAS FIELDS ===');
  keys.filter(k => k.toLowerCase().includes('dezena') || k.toLowerCase().includes('numero') || k.toLowerCase().includes('sorteio')).forEach(k => {
    console.log(k + ':', JSON.stringify(r[k]));
  });
  console.log('\n=== DATA/NUMERO ===');
  ['numero','dataApuracao','numeroConcursoProximo','dataProximoConcurso','valorEstimadoProximoConcurso'].forEach(k => {
    if (r[k] !== undefined) console.log(k+':', r[k]);
  });
  console.log('\n=== RATEIO ===');
  if (r.listaRateioPremio) {
    r.listaRateioPremio.forEach((x,i) => console.log(i, JSON.stringify(x)));
  }
})();
