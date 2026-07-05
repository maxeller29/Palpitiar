'use strict';
// scripts/criar-historico-timemania.js
// Busca TODA a série histórica da Timemania (concursos 1-N) da API oficial da Caixa.
// Usa batches paralelos para ser rápido. Salva em timemania-historico.json na raiz.
// Uso: node scripts/criar-historico-timemania.js

const fs     = require('fs');
const path   = require('path');
const https  = require('https');
const crypto = require('crypto');
const zlib   = require('zlib');

const BASE_URL        = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/timemania';
const CONCURSO_INICIO = 1;
const CONCURSO_FIM    = 2500; // atualizar se houver mais
const BATCH_SIZE      = 4;    // sem bloqueio de WAF confirmado — pode paralelizar moderadamente
const DELAY_BATCH     = 500;  // ms entre lotes
const OUT_FILE        = path.join(process.cwd(), 'timemania-historico.json');

// Servidor da Caixa exige legacy renegotiation TLS — Node 18+/OpenSSL 3
// bloqueiam isso por padrão, causando falha em 100% das requisições
// (ECONNRESET/handshake). Este agent reabilita a compatibilidade.
const agent = new https.Agent({
  keepAlive: true,
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
});

function sleep(ms) { return new Promise(ok => setTimeout(ok, ms)); }

function descomprimir(res) {
  // Descomprime o corpo de acordo com o content-encoding real da resposta
  const enc = (res.headers['content-encoding'] || '').toLowerCase();
  if (enc === 'gzip') return res.pipe(zlib.createGunzip());
  if (enc === 'br')   return res.pipe(zlib.createBrotliDecompress());
  if (enc === 'deflate') return res.pipe(zlib.createInflate());
  return res; // sem compressão
}

function lerCorpo(res) {
  return new Promise((resolve, reject) => {
    const stream = descomprimir(res);
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

function fetchConcurso(num, tentativa = 0) {
  return new Promise((resolve) => {
    const url = BASE_URL + '/' + num;
    const req = https.get(url, {
      agent,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://loterias.caixa.gov.br/Paginas/Timemania.aspx',
        'Origin': 'https://loterias.caixa.gov.br',
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
      }
    }, async res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }

      if (res.statusCode !== 200) {
        let corpoErro = '';
        try { corpoErro = await lerCorpo(res); } catch (e) { corpoErro = '[erro ao descomprimir: ' + e.message + ']'; }
        if (!global.__erroHttpLogado) {
          global.__erroHttpLogado = true;
          const diag = '=== DIAGNOSTICO HTTP NAO-200 (primeira ocorrencia) ===\n' +
            'concurso: ' + num + '\n' +
            'status:   ' + res.statusCode + '\n' +
            'headers:  ' + JSON.stringify(res.headers, null, 2) + '\n' +
            'corpo:    ' + corpoErro.slice(0, 2000) + '\n' +
            '================================\n';
          fs.appendFileSync(path.join(process.cwd(), 'debug-timemania.log'), diag, 'utf8');
        }
        if (tentativa < 3) {
          const espera = res.statusCode === 403 ? 5000 * (tentativa + 1) : 1500 * (tentativa + 1);
          return setTimeout(() => fetchConcurso(num, tentativa + 1).then(resolve), espera);
        }
        return resolve({ _erro: res.statusCode, _num: num });
      }

      let body = '';
      try { body = await lerCorpo(res); }
      catch (e) {
        if (!global.__erroDescompLogado) {
          global.__erroDescompLogado = true;
          const diag = '=== DIAGNOSTICO ERRO AO DESCOMPRIMIR (primeira ocorrencia) ===\n' +
            'concurso: ' + num + '\n' +
            'content-encoding: ' + res.headers['content-encoding'] + '\n' +
            'erro: ' + e.message + '\n' +
            '================================\n';
          fs.appendFileSync(path.join(process.cwd(), 'debug-timemania.log'), diag, 'utf8');
        }
        return resolve({ _erro: 'descompressao', _num: num });
      }

      try { resolve(JSON.parse(body)); }
      catch(e) {
        if (!global.__erroParseLogado) {
          global.__erroParseLogado = true;
          const diag = '=== DIAGNOSTICO 200 OK MAS JSON INVALIDO (primeira ocorrencia) ===\n' +
            'concurso: ' + num + '\n' +
            'status:   ' + res.statusCode + '\n' +
            'headers:  ' + JSON.stringify(res.headers, null, 2) + '\n' +
            'corpo bruto (primeiros 3000 chars):\n' + body.slice(0, 3000) + '\n' +
            '================================\n';
          fs.appendFileSync(path.join(process.cwd(), 'debug-timemania.log'), diag, 'utf8');
        }
        resolve({ _erro: 'parse', _num: num });
      }
    });
    req.on('error', (err) => {
      if (!global.__erroRedeLogado) {
        global.__erroRedeLogado = true;
        const diag = '=== DIAGNOSTICO ERRO DE REDE (primeira ocorrencia) ===\n' +
          'concurso: ' + num + '\n' +
          'code:     ' + err.code + '\n' +
          'message:  ' + err.message + '\n' +
          '================================\n';
        fs.appendFileSync(path.join(process.cwd(), 'debug-timemania.log'), diag, 'utf8');
      }
      if (tentativa < 3) {
        return setTimeout(() => fetchConcurso(num, tentativa + 1).then(resolve), 1500 * (tentativa + 1));
      }
      resolve({ _erro: 'network:' + (err.code || err.message), _num: num });
    });
    req.setTimeout(25000, () => { req.destroy(); resolve({ _erro: 'timeout', _num: num }); });
  });
}

function parseDezenas(raw) {
  return (raw || []).map(d => parseInt(d, 10)).sort((a, b) => a - b);
}

function parsePremios(r) {
  const f = r.listaRateioPremio || [];
  // Faixas Timemania: [0]=7ac [1]=6ac [2]=5ac [3]=4ac [4]=3ac
  const mF = { 0:'7', 1:'6', 2:'5', 3:'4', 4:'3' };
  const mG = { 0:'g7', 1:'g6', 2:'g5', 3:'g4', 4:'g3' };
  const p = {};
  f.forEach((x, i) => {
    if (mF[i] !== undefined) {
      p[mF[i]] = x.valorPremio ?? x.valor ?? 0;
      p[mG[i]] = x.numeroDeGanhadores ?? x.ganhadores ?? 0;
    }
  });
  return p;
}

function formatarData(d) {
  if (!d) return null;
  const p = d.split('/');
  return p.length === 3 ? p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0') : d;
}

function calcularStats(draws) {
  // Timemania: números 1-80, 7 dezenas sorteadas por concurso (aposta mínima é de 10 números)
  const MAX = 80;
  const freqMap = {}, ultimoSorteio = {};
  for (let n = 1; n <= MAX; n++) freqMap[n] = 0;

  let somaTotal = 0;
  draws.forEach((d, idx) => {
    const dezenas = d[2];
    somaTotal += dezenas.reduce((s, n) => s + n, 0);
    dezenas.forEach(n => {
      freqMap[n] = (freqMap[n] || 0) + 1;
      ultimoSorteio[n] = idx;
    });
  });

  const total = draws.length, last = total - 1;
  const frequencia = {}, atraso = {};
  Object.keys(freqMap).forEach(n => {
    frequencia[n] = freqMap[n];
    atraso[n] = last - (ultimoSorteio[n] !== undefined ? ultimoSorteio[n] : -1);
  });

  const sorted = Object.entries(freqMap).sort((a, b) => b[1] - a[1]);
  const somas  = draws.map(d => d[2].reduce((a, b) => a + b, 0));
  const mediaPares = draws.reduce((s, d) => s + d[2].filter(n => n % 2 === 0).length, 0) / total;

  return {
    frequencia, atraso,
    quentes: sorted.slice(0, 10).map(([n]) => Number(n)),
    frias:   sorted.slice(-10).map(([n]) => Number(n)),
    somaMedia: Number((somaTotal / total).toFixed(1)),
    somaMin: Math.min(...somas),
    somaMax: Math.max(...somas),
    mediaPares: Number(mediaPares.toFixed(2)),
    totalConcursos: total,
  };
}

async function main() {
  console.log('=== Criar histórico Timemania ===');
  console.log('Concursos: ' + CONCURSO_INICIO + ' a ' + CONCURSO_FIM + ' (até o último disponível)');
  console.log('Batch size: ' + BATCH_SIZE + ' | Delay: ' + DELAY_BATCH + 'ms\n');

  const draws = [];
  const erros = [];
  let processados = 0;
  let ultimoEncontrado = 0;

  for (let inicio = CONCURSO_INICIO; inicio <= CONCURSO_FIM; inicio += BATCH_SIZE) {
    const fim = Math.min(inicio + BATCH_SIZE - 1, CONCURSO_FIM);
    const nums = [];
    for (let n = inicio; n <= fim; n++) nums.push(n);

    const resultados = await Promise.all(nums.map(n => fetchConcurso(n)));

    let algumNulo = false;
    resultados.forEach((r, i) => {
      const num = nums[i];
      if (!r) {
        algumNulo = true;
        return;
      }
      if (r._erro) { erros.push({ num, erro: r._erro }); return; }

      const dezenas = parseDezenas(r.listaDezenas);
      if (dezenas.length !== 7) {
        if (!global.__erroFormatoLogado) {
          global.__erroFormatoLogado = true;
          const diag = '=== DIAGNOSTICO FORMATO INESPERADO (200 OK, mas dezenas invalidas, primeira ocorrencia) ===\n' +
            'concurso: ' + num + '\n' +
            'dezenas encontradas: ' + dezenas.length + '\n' +
            'chaves do JSON retornado: ' + Object.keys(r).join(', ') + '\n' +
            'JSON completo:\n' + JSON.stringify(r, null, 2).slice(0, 3000) + '\n' +
            '================================\n';
          fs.appendFileSync(path.join(process.cwd(), 'debug-timemania.log'), diag, 'utf8');
        }
        erros.push({ num, erro: 'dezenas_invalidas_' + dezenas.length }); return;
      }

      const data = formatarData(r.dataApuracao);
      const ganhadores = r.listaRateioPremio?.[0]?.numeroDeGanhadores ?? 0;
      draws.push([num, data, dezenas, parseInt(ganhadores, 10) || 0, parsePremios(r)]);
      ultimoEncontrado = num;
      processados++;
    });

    const pct = Math.round((fim / CONCURSO_FIM) * 100);
    process.stdout.write('\r  [' + pct + '%] ' + fim + ' | OK:' + processados + ' Erros:' + erros.length + '   ');

    // Para se encontrar muitos 404s consecutivos (além do último concurso)
    if (algumNulo && inicio > ultimoEncontrado + BATCH_SIZE * 2) break;

    if (fim < CONCURSO_FIM) await sleep(DELAY_BATCH);
  }

  console.log('\n\nOrdenando...');
  draws.sort((a, b) => a[0] - b[0]);

  if (erros.length > 0) {
    console.log('AVISOS — ' + erros.length + ' erros:');
    erros.slice(0, 20).forEach(e => console.log('  Concurso ' + e.num + ': ' + e.erro));
  }

  if (draws.length === 0) {
    console.error('NENHUM concurso obtido — verifique a URL da API.');
    process.exit(1);
  }

  console.log('Calculando estatísticas...');
  const stats = calcularStats(draws);
  const hoje  = new Date().toISOString().slice(0, 10);

  const json = {
    meta: {
      loteria: 'Timemania',
      fonte: 'Caixa Econômica Federal — série histórica oficial',
      geradoEm: hoje,
      totalConcursos: draws.length,
      primeiroConcurso: draws[0][0],
      ultimoConcurso: draws[draws.length - 1][0],
      primeiraData: draws[0][1],
      ultimaData: draws[draws.length - 1][1],
      formato: '[numero, "YYYY-MM-DD", [dezenas_1_a_80], ganhadores_7ac, {premios}]',
      regras: {
        universo: '1-80 (80 números)',
        dezenasSorteadas: 7,
        dezenasAposta: 10,
        faixas: ['7ac','6ac','5ac','4ac','3ac']
      },
      enriquecidoEm: hoje
    },
    stats,
    draws
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(json), 'utf8');
  console.log('\n=== CONCLUÍDO ===');
  console.log('Arquivo: ' + OUT_FILE);
  console.log('Total concursos: ' + draws.length);
  console.log('Primeiro: ' + draws[0][0] + ' (' + draws[0][1] + ')');
  console.log('Último:   ' + draws[draws.length-1][0] + ' (' + draws[draws.length-1][1] + ')');
  console.log('Tamanho: ' + (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2) + ' MB');
}

main().catch(e => { console.error('\nERRO FATAL:', e.message); process.exit(1); });
