'use strict';
// scripts/atualizar-historico.js
// Busca apenas os concursos novos da API da Caixa e appenda ao JSON histórico.
// Para usar: node scripts/atualizar-historico.js  (rodar da RAIZ do repositório)

const fs   = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://servicebus2.caixa.gov.br/portaldeloterias/api';
const DELAY_MS = 800;

// ── Localizar os JSONs automaticamente ───────────────────
// Tenta a raiz do repo e, se não encontrar, tenta scripts/
function encontrarJson(nomeArquivo) {
  // Raiz do repositório: process.cwd() quando rodado via "node scripts/..."
  const candidatos = [
    path.join(process.cwd(), nomeArquivo),
    path.join(__dirname, nomeArquivo),
    path.join(__dirname, '..', nomeArquivo)
  ];
  for (const c of candidatos) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Nao encontrei ' + nomeArquivo + '\nProcurado em:\n  ' + candidatos.join('\n  '));
}

// ── Configuração das loterias ─────────────────────────────
const LOTERIAS = [
  {
    id:      'mega-sena',
    slug:    'megasena',
    arquivo: 'mega-sena-historico.json',
    qtdDez:  6,
    premios(r) {
      const p = {};
      const f = r.listaRateioPremio || r.premiacoes || [];
      const mF = { 0:'s',  1:'qn',  2:'qd'  };
      const mG = { 0:'gs', 1:'gqn', 2:'gqd' };
      f.forEach((x,i) => {
        if (mF[i]) {
          p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
          p[mG[i]] = x.numeroDeGanhadores ?? x.numeradorGanhadores ?? x.ganhadores ?? 0;
        }
      });
      return p;
    }
  },
  {
    id:      'lotofacil',
    slug:    'lotofacil',
    arquivo: 'lotofacil-historico.json',
    qtdDez:  15,
    premios(r) {
      const p = {};
      const f = r.listaRateioPremio || r.premiacoes || [];
      const mF = { 0:'15',1:'14',2:'13',3:'12',4:'11' };
      const mG = { 0:'g15',1:'g14',2:'g13',3:'g12',4:'g11' };
      f.forEach((x,i) => {
        if (mF[i]) {
          p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
          p[mG[i]] = x.numeroDeGanhadores ?? x.numeradorGanhadores ?? x.ganhadores ?? 0;
        }
      });
      return p;
    }
  },
  {
    id:      'quina',
    slug:    'quina',
    arquivo: 'quina-historico.json',
    qtdDez:  5,
    premios(r) {
      const p = {};
      const f = r.listaRateioPremio || r.premiacoes || [];
      const mF = { 0:'5',1:'4',2:'3',3:'2' };
      const mG = { 0:'g5',1:'g4',2:'g3',3:'g2' };
      f.forEach((x,i) => {
        if (mF[i]) {
          p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
          p[mG[i]] = x.numeroDeGanhadores ?? x.numeradorGanhadores ?? x.ganhadores ?? 0;
        }
      });
      return p;
    }
  },
  {
    id:      'lotomania',
    slug:    'lotomania',
    arquivo: 'lotomania-historico.json',
    qtdDez:  20,
    range:   { min: 0, max: 99 },
    premios(r) {
      const p = {};
      const f = r.listaRateioPremio || r.premiacoes || [];
      const mF = { 0:'20',1:'19',2:'18',3:'17',4:'16',5:'0' };
      const mG = { 0:'g20',1:'g19',2:'g18',3:'g17',4:'g16',5:'g0' };
      f.forEach((x,i) => {
        if (mF[i] !== undefined) {
          p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
          p[mG[i]] = x.numeroDeGanhadores ?? x.numeradorGanhadores ?? x.ganhadores ?? 0;
        }
      });
      return p;
    }
  },
  {
    id:      'milionaria',
    slug:    'maismilionaria',
    arquivo: 'milionaria-historico.json',
    qtdDez:  6,
    range:   { min: 1, max: 50 },
    milionaria: true,
    premios(r) {
      const p = {};
      const f = r.listaRateioPremio || r.premiacoes || [];
      // faixas: sena+2t, sena+1t, sena+0t, quina+2t, quina+1t, quadra+2t, quadra+1t
      const mF = { 0:'s2t',1:'s1t',2:'s0t',3:'q2t',4:'q1t',5:'qt2t',6:'qt1t' };
      const mG = { 0:'gs2t',1:'gs1t',2:'gs0t',3:'gq2t',4:'gq1t',5:'gqt2t',6:'gqt1t' };
      f.forEach((x,i) => {
        if (mF[i]) {
          p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
          p[mG[i]] = x.numeroDeGanhadores ?? x.numeradorGanhadores ?? x.ganhadores ?? 0;
        }
      });
      return p;
    }
  },
  {
    id:      'dupla-sena',
    slug:    'duplasena',
    arquivo: 'dupla-sena-historico.json',
    qtdDez:  6,
    dual:    true,
    premios(r) {
      const p = {};
      const f = r.listaRateioPremio || r.premiacoes || [];
      const mF = { 0:'s1',1:'q1',2:'qt1',3:'t1',4:'s2',5:'q2',6:'qt2',7:'t2' };
      const mG = { 0:'gs1',1:'gq1',2:'gqt1',3:'gt1',4:'gs2',5:'gq2',6:'gqt2',7:'gt2' };
      f.forEach((x,i) => {
        if (mF[i] !== undefined) {
          p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
          p[mG[i]] = x.numeroDeGanhadores ?? x.numeradorGanhadores ?? x.ganhadores ?? 0;
        }
      });
      return p;
    }
  },
  {
    id:      'timemania',
    slug:    'timemania',
    arquivo: 'timemania-historico.json',
    qtdDez:  7,
    range:   { min: 1, max: 80 },
    // Ordem do listaRateioPremio assumida como: 7,6,5,4,3 acertos + Time do Coração por último.
    // Validar contra uma resposta real da API antes de confiar no detalhamento por faixa (dezenas/ganhadores principais não dependem disso).
    premios(r) {
      const p = {};
      const f = r.listaRateioPremio || r.premiacoes || [];
      const mF = { 0:'7',1:'6',2:'5',3:'4',4:'3',5:'tc' };
      const mG = { 0:'g7',1:'g6',2:'g5',3:'g4',4:'g3',5:'gtc' };
      f.forEach((x,i) => {
        if (mF[i] !== undefined) {
          p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
          p[mG[i]] = x.numeroDeGanhadores ?? x.numeradorGanhadores ?? x.ganhadores ?? 0;
        }
      });
      return p;
    }
  },
  {
    id:      'dia-de-sorte',
    slug:    'diadesorte',
    arquivo: 'diadesorte-historico.json',
    qtdDez:  7,
    range:   { min: 1, max: 31 },
    // Ordem do listaRateioPremio assumida como: 7,6,5,4 acertos + Mês da Sorte por último.
    // Validar contra uma resposta real da API antes de confiar no detalhamento por faixa (dezenas/ganhadores principais não dependem disso).
    premios(r) {
      const p = {};
      const f = r.listaRateioPremio || r.premiacoes || [];
      const mF = { 0:'7',1:'6',2:'5',3:'4',4:'ms' };
      const mG = { 0:'g7',1:'g6',2:'g5',3:'g4',4:'gms' };
      f.forEach((x,i) => {
        if (mF[i] !== undefined) {
          p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
          p[mG[i]] = x.numeroDeGanhadores ?? x.numeradorGanhadores ?? x.ganhadores ?? 0;
        }
      });
      return p;
    }
  }
];

// ── Helpers ───────────────────────────────────────────────
function sleep(ms) { return new Promise(ok => setTimeout(ok, ms)); }

function formatarData(d) {
  if (!d) return null;
  const p = d.split('/');
  return p.length === 3 ? p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0') : d;
}

function fetchJSON(url) {
  if (typeof fetch === 'function') {
    return fetch(url, { headers: { 'Accept':'application/json', 'User-Agent':'palpitiar-bot/1.0' } })
      .then(res => { if(res.status===404)return null; if(!res.ok)throw new Error('HTTP '+res.status); return res.json(); });
  }
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers:{'Accept':'application/json','User-Agent':'palpitiar-bot/1.0'} }, res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP '+res.statusCode)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
  });
}

function calcularStats(draws, qtdDez, range, dual, milionaria) {
  const lo = (range && range.min !== undefined) ? range.min : 1;
  const hi = (range && range.max !== undefined) ? range.max : (qtdDez===6?60:qtdDez===15?25:80);
  const freqMap={}, ultimoSorteio={};
  for(let n=lo;n<=hi;n++) freqMap[n]=0;
  let somaTotal=0, comAcert=0, semAcert=0;
  draws.forEach((d,idx) => {
    somaTotal += d[2].reduce((s,n)=>s+n,0);
    // dual/milionaria: d=[num,date,dez[],dez2[]/trevos[],ganhadores,...]; single: d=[num,date,dez[],ganhadores,...]
    const g = (dual || milionaria) ? d[4] : d[3];
    if(g>0) comAcert++; else semAcert++;
    d[2].forEach(n => { freqMap[n]=(freqMap[n]||0)+1; ultimoSorteio[n]=idx; });
    if(dual && Array.isArray(d[3])) d[3].forEach(n => { freqMap[n]=(freqMap[n]||0)+1; ultimoSorteio[n]=idx; });
  });
  const total=draws.length, last=total-1;
  const frequencia={}, atraso={};
  Object.keys(freqMap).forEach(n => { frequencia[n]=freqMap[n]; atraso[n]=last-(ultimoSorteio[n]!==undefined?ultimoSorteio[n]:-1); });
  const s=Object.entries(freqMap).sort((a,b)=>b[1]-a[1]);
  const somas=draws.map(d=>d[2].reduce((a,b)=>a+b,0));
  const mediaPares=draws.reduce((s,d)=>s+d[2].filter(n=>n%2===0).length,0)/total;
  return {
    comAcertadores:comAcert, semAcertadores:semAcert,
    percentualComAcertadores:Number((comAcert/total*100).toFixed(1)),
    frequencia, atraso,
    quentes:s.slice(0,5).map(([n])=>Number(n)),
    frias:s.slice(-5).map(([n])=>Number(n)),
    somaMedia:Number((somaTotal/total).toFixed(1)),
    somaMin:Math.min.apply(null,somas), somaMax:Math.max.apply(null,somas),
    mediaPares:Number(mediaPares.toFixed(2))
  };
}

// ── Atualizar uma loteria ─────────────────────────────────
async function atualizarLoteria(cfg) {
  const arquivo = encontrarJson(cfg.arquivo);
  console.log('[' + cfg.id + '] JSON em: ' + arquivo);

  const existente = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const draws = existente.draws;
  const ultimoConcurso = draws.length > 0 ? draws[draws.length-1][0] : 0;
  console.log('[' + cfg.id + '] Ultimo concurso: ' + ultimoConcurso);

  let proximo=ultimoConcurso+1, novos=0;
  let ultimoProcessado=ultimoConcurso, ultimaData=draws.length>0?draws[draws.length-1][1]:null;

  while (true) {
    process.stdout.write('  -> Concurso ' + proximo + '... ');
    let resultado;
    try { resultado = await fetchJSON(BASE_URL+'/'+cfg.slug+'/'+proximo); }
    catch(e) { console.log('ERRO: '+e.message); break; }
    if (!resultado) { console.log('nao existe ainda.'); break; }

    const data=formatarData(resultado.dataApuracao||resultado.data);

    if (cfg.milionaria) {
      const dezenas=(resultado.listaDezenas||[]).map(Number).sort((a,b)=>a-b);
      const trevos=(resultado.trevosSorteados||resultado.listaTrevos||[]).map(Number).sort((a,b)=>a-b);
      if (dezenas.length !== 6) { console.log('dezenas invalidas ('+dezenas.length+'). Abortando.'); break; }
      const ganhadores=parseInt(resultado.listaRateioPremio?.[0]?.numeroDeGanhadores)||0;
      draws.push([proximo, data, dezenas, trevos, ganhadores, cfg.premios(resultado)]);
    } else if (cfg.dual) {
      const dez1=(resultado.listaDezenas||[]).map(Number).sort((a,b)=>a-b);
      const dez2=(resultado.listaDezenasSegundoSorteio||[]).map(Number).sort((a,b)=>a-b);
      if (dez1.length !== 6 || dez2.length !== 6) { console.log('dezenas invalidas ('+dez1.length+'/'+dez2.length+'). Abortando.'); break; }
      const ganhadores=parseInt(resultado.listaRateioPremio?.[0]?.numeroDeGanhadores)||0;
      draws.push([proximo, data, dez1, dez2, ganhadores, cfg.premios(resultado)]);
    } else {
      const dezenas=(resultado.listaDezenas||resultado.dezenas||[]).map(Number).sort((a,b)=>a-b);
      if (dezenas.length !== cfg.qtdDez) { console.log('dezenas invalidas ('+dezenas.length+'). Abortando.'); break; }
      const ganhadores=resultado.numeroDeGanhadores??resultado.numeradorGanhadores??resultado.ganhadores??0;
      draws.push([proximo, data, dezenas, ganhadores, cfg.premios(resultado)]);
    }
    novos++; ultimoProcessado=proximo; ultimaData=data;
    console.log('OK ('+data+')');
    proximo++;
    await sleep(DELAY_MS);
  }

  if (novos === 0) { console.log('  Nenhum concurso novo.\n'); return false; }

  existente.draws = draws;
  existente.stats = calcularStats(draws, cfg.qtdDez, cfg.range, cfg.dual, cfg.milionaria);
  const hoje = new Date().toISOString().slice(0,10);
  existente.meta = Object.assign({}, existente.meta, {
    geradoEm:hoje, totalConcursos:draws.length,
    ultimoConcurso:ultimoProcessado, ultimaData, enriquecidoEm:hoje
  });
  fs.writeFileSync(arquivo, JSON.stringify(existente), 'utf8');
  console.log('  Salvo: '+draws.length+' concursos (+'+novos+' novos).\n');
  return true;
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  console.log('=== Atualizar historico de loterias ===');
  console.log('Data: ' + new Date().toISOString());
  console.log('Node: ' + process.version);
  console.log('CWD:  ' + process.cwd() + '\n');

  let algumAtualizado = false;
  for (const cfg of LOTERIAS) {
    try {
      if (await atualizarLoteria(cfg)) algumAtualizado = true;
    } catch(e) {
      console.error('[' + cfg.id + '] ERRO FATAL: ' + e.message);
      process.exitCode = 1;
    }
  }

  if (algumAtualizado) {
    console.log('[OK] JSONs atualizados — commit sera feito.');
    // Sinaliza para o workflow que houve mudancas (alem do git diff)
    try { fs.writeFileSync(path.join(process.cwd(), '.historico-atualizado'), '1'); } catch(_){}
  } else {
    console.log('[OK] Nenhum JSON precisou de atualizacao.');
  }
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
