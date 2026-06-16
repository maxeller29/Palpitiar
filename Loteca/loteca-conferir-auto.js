/**
 * loteca-conferir-auto.js
 * Conferência automática para GitHub Actions
 * 
 * - Busca todos os concursos não encerrados
 * - Para cada um: tenta conferir via API Caixa (oficial) ou football-data.org (parcial)
 * - Encerra automaticamente quando todos os jogos têm resultado
 * - Saída via GITHUB_OUTPUT
 */

'use strict';

const https = require('https');
const fs    = require('fs');

const SUPABASE_URL  = process.env.SUPABASE_URL || 'https://oslvqimllizsdtxwkrag.supabase.co';
const SUPABASE_KEY  = process.env.SUPABASE_KEY;
const FD_TOKEN      = process.env.FOOTBALL_DATA_TOKEN || '8daf406ac51644daadfd28e15e294fe2';
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT || null;

if (!SUPABASE_KEY) { console.error('SUPABASE_KEY nao definida'); process.exit(1); }

// ─── Mapeamento nomes Caixa → football-data ───────────────────────────────────
const NOMES_MAP = {
  'BRASIL':'Brazil','MARROCOS':'Morocco','HAITI':'Haiti','ESCOCIA':'Scotland',
  'ESCOCIA/SCT':'Scotland','ALEMANHA':'Germany','CURACAO':'Curaçao',
  'HOLANDA':'Netherlands','JAPAO':'Japan','COSTA DO MARFIM':"Ivory Coast",
  'EQUADOR':'Ecuador','SUECIA':'Sweden','TUNISIA':'Tunisia','ESPANHA':'Spain',
  'CABO VERDE':'Cape Verde','BELGICA':'Belgium','EGITO':'Egypt',
  'ARABIA SAUDITA':'Saudi Arabia','URUGUAI':'Uruguay','FRANCA':'France',
  'SENEGAL':'Senegal','IRAQUE':'Iraq','NORUEGA':'Norway','ARGENTINA':'Argentina',
  'ARGELIA':'Algeria','PORTUGAL':'Portugal','CONGO':'DR Congo',
  'INGLATERRA':'England','CROACIA':'Croatia','REPUBLICA TCHECA':'Czechia',
  'AFRICA DO SUL':'South Africa','SUICA':'Switzerland','BOSNIA HERZEGOVINA':'Bosnia and Herzegovina',
  'CANADA':'Canada','CATAR':'Qatar','MEXICO':'Mexico','COREIA DO SUL':'South Korea',
  'ESTADOS UNIDOS':'United States','AUSTRALIA':'Australia','HOLANDA':'Netherlands',
  'UZBEQUISTAO':'Uzbekistan','COLOMBIA':'Colombia','PANAMA':'Panama','GANA':'Ghana',
};

function normStr(s) {
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
}
function nomeMatch(apiName, caixaNome) {
  const mapped = NOMES_MAP[caixaNome.toUpperCase()];
  const targets = mapped ? [mapped, caixaNome] : [caixaNome];
  const n = normStr(apiName);
  return targets.some(t => n.includes(normStr(t)) || normStr(t).includes(n.slice(0,4)));
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────
function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: Object.assign({'User-Agent':'Mozilla/5.0'}, headers||{})
    }, (res) => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{
        if(res.statusCode>=400) return reject(new Error(`HTTP ${res.statusCode}`));
        try{resolve(JSON.parse(d));}catch{reject(new Error('nao-JSON'));}
      });
    });
    req.on('error',reject);
    req.setTimeout(12000,()=>{req.destroy();reject(new Error('timeout'));});
  });
}

function sb(method, table, body, params) {
  return new Promise((resolve,reject)=>{
    const url=new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    if(params) Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
    const payload=body?JSON.stringify(body):null;
    const req=https.request(url,{method,headers:{
      'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,
      'Content-Type':'application/json','Prefer':'return=representation',
    }},(res)=>{
      let d='';res.on('data',c=>d+=c);
      res.on('end',()=>{
        if(res.statusCode>=400) return reject(new Error(`Supabase ${res.statusCode}: ${d.slice(0,200)}`));
        try{resolve(d?JSON.parse(d):[]);}catch{resolve([]);}
      });
    });
    req.on('error',reject);
    if(payload) req.write(payload);
    req.end();
  });
}

function setOutput(key,value) {
  if(GITHUB_OUTPUT) fs.appendFileSync(GITHUB_OUTPUT,`${key}=${value}\n`);
  console.log(`[output] ${key}=${value}`);
}

function calcResultado(g1,g2) {
  if(g1===null||g1===undefined) return null;
  if(g1>g2) return 'coluna1';
  if(g1===g2) return 'empate';
  return 'coluna2';
}

const sleep = ms => new Promise(r=>setTimeout(r,ms));

// ─── Buscar via API Caixa ─────────────────────────────────────────────────────
async function conferirViaCaixa(numero) {
  const url = `https://servicebus2.caixa.gov.br/portaldeloterias/api/loteca/${numero}`;
  const dados = await httpGet(url);
  const jogos = dados.listaResultadoEquipeEsportiva || [];
  const temPlacar = jogos.some(j => j.nuGolEquipeUm !== null && j.nuGolEquipeUm !== undefined);
  if (!temPlacar) return null;
  return { dados, jogos: [...jogos].sort((a,b)=>a.nuJogo-b.nuJogo) };
}

// ─── Buscar via football-data.org ─────────────────────────────────────────────
async function buscarPartidas() {
  const data = await httpGet(
    'https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED',
    {'X-Auth-Token': FD_TOKEN}
  );
  return data.matches || [];
}

function casarJogo(resumo, partidas) {
  const partes = resumo.split(' x ');
  const nomeCasa = partes[0]?.trim();
  const nomeVisit = partes[1]?.trim();
  if (!nomeCasa || !nomeVisit) return null;

  for (const p of partidas) {
    const home = p.homeTeam?.name || '';
    const away = p.awayTeam?.name || '';
    const casaBate  = nomeMatch(home, nomeCasa)  || nomeMatch(away, nomeCasa);
    const visitBate = nomeMatch(home, nomeVisit) || nomeMatch(away, nomeVisit);
    if (casaBate && visitBate) {
      const casaEhHome = nomeMatch(home, nomeCasa);
      const g1 = casaEhHome ? p.score?.fullTime?.home : p.score?.fullTime?.away;
      const g2 = casaEhHome ? p.score?.fullTime?.away : p.score?.fullTime?.home;
      return { g1, g2, status: p.status };
    }
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n' + '='.repeat(60));
  console.log('LOTECA — CONFERENCIA AUTOMATICA');
  console.log(new Date().toISOString());
  console.log('='.repeat(60));

  try {
    // Buscar concursos não encerrados com data passada
    const hoje = new Date().toISOString().split('T')[0];
    const concursos = await sb('GET','loteca_concursos',null,{
      status_analise: 'not.eq.encerrado',
      data_sorteio: `lte.${hoje}`,
      select: 'id,numero,status_analise,data_sorteio',
      order: 'numero.desc',
    });

    if (concursos.length === 0) {
      console.log('\nNenhum concurso pendente de conferencia.');
      setOutput('conferidos', '0');
      setOutput('encerrados', '0');
      process.exit(0);
    }

    console.log(`\n${concursos.length} concurso(s) para conferir.`);

    // Buscar partidas finalizadas uma vez (reutilizar para todos os concursos)
    let partidasFD = [];
    try {
      console.log('\nBuscando partidas finalizadas na football-data.org...');
      partidasFD = await buscarPartidas();
      console.log(`  ${partidasFD.length} partidas encontradas`);
    } catch(e) {
      console.log(`  football-data.org indisponivel: ${e.message}`);
    }

    let totalConferidos = 0;
    let totalEncerrados = 0;
    const resumos = [];

    for (const concurso of concursos) {
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`Concurso ${concurso.numero} (${concurso.status_analise}) — ${concurso.data_sorteio}`);

      const jogos = await sb('GET','loteca_jogos_analise',null,{
        concurso_id: `eq.${concurso.id}`,
        select: 'id,ordem,resumo,resultado_sugerido,resultado_real,acertou',
        order: 'ordem.asc',
      });

      let atualizados = 0;
      let jaComResult = jogos.filter(j=>j.resultado_real).length;

      // Tentar API Caixa primeiro
      let caixaOk = false;
      try {
        const caixa = await conferirViaCaixa(concurso.numero);
        if (caixa) {
          console.log('  Resultados disponíveis na API Caixa!');
          for(let idx=0;idx<jogos.length;idx++) {
            const jogo = jogos[idx];
            const api  = caixa.jogos[idx];
            if (!api) continue;
            const resultadoReal = calcResultado(api.nuGolEquipeUm, api.nuGolEquipeDois);
            if (!resultadoReal) continue;
            if (jogo.resultado_real === resultadoReal) continue;
            const acertou = resultadoReal === jogo.resultado_sugerido;
            await sb('PATCH','loteca_jogos_analise',{resultado_real:resultadoReal,acertou},{id:`eq.${jogo.id}`});
            const icon = acertou?'✓':'✗';
            console.log(`  [${String(jogo.ordem).padStart(2)}] ${icon} ${api.nuGolEquipeUm}x${api.nuGolEquipeDois} | ${resultadoReal} | ${jogo.resumo}`);
            atualizados++;
          }

          // Verificar se todos têm resultado → encerrar
          const jogosAtualizados = await sb('GET','loteca_jogos_analise',null,{
            concurso_id:`eq.${concurso.id}`,select:'resultado_real',
          });
          const todosProntos = jogosAtualizados.every(j=>j.resultado_real);

          if (todosProntos) {
            const rateioPremio = caixa.dados.listaRateioPremio || [];
            const faixa14 = rateioPremio.find(r=>r.descricaoFaixa?.includes('14'));
            const faixa13 = rateioPremio.find(r=>r.descricaoFaixa?.includes('13'));
            await sb('PATCH','loteca_concursos',{
              status_analise:'encerrado',
              acumulado: caixa.dados.acumulado||false,
              arrecadacao: caixa.dados.valorArrecadado||null,
              ganhadores_14: faixa14?.numeroDeGanhadores??null,
              rateio_14: faixa14?.valorPremio??null,
              ganhadores_13: faixa13?.numeroDeGanhadores??null,
              rateio_13: faixa13?.valorPremio??null,
            },{id:`eq.${concurso.id}`});
            console.log(`  ✓ ENCERRADO — todos os ${jogos.length} jogos conferidos`);
            totalEncerrados++;
            resumos.push(`Concurso ${concurso.numero}: ENCERRADO`);
          } else {
            const comResult = jogosAtualizados.filter(j=>j.resultado_real).length;
            resumos.push(`Concurso ${concurso.numero}: ${comResult}/${jogos.length} resultados via Caixa`);
          }
          caixaOk = true;
        }
      } catch(e) {
        console.log(`  API Caixa: ${e.message} — usando football-data.org`);
      }

      // Fallback: football-data.org (parcial)
      if (!caixaOk && partidasFD.length > 0) {
        for (const jogo of jogos) {
          if (jogo.resultado_real) continue;
          const match = casarJogo(jogo.resumo, partidasFD);
          if (!match || match.status !== 'FINISHED') continue;
          const resultadoReal = calcResultado(match.g1, match.g2);
          if (!resultadoReal) continue;
          const acertou = resultadoReal === jogo.resultado_sugerido;
          await sb('PATCH','loteca_jogos_analise',{resultado_real:resultadoReal,acertou},{id:`eq.${jogo.id}`});
          const icon = acertou?'✓':'✗';
          console.log(`  [${String(jogo.ordem).padStart(2)}] ${icon} ${match.g1}x${match.g2} | ${resultadoReal} | ${jogo.resumo}`);
          atualizados++;
        }

        const jogosAtualizados = await sb('GET','loteca_jogos_analise',null,{
          concurso_id:`eq.${concurso.id}`,select:'resultado_real',
        });
        const comResult = jogosAtualizados.filter(j=>j.resultado_real).length;
        resumos.push(`Concurso ${concurso.numero}: ${comResult}/${jogos.length} resultados (parcial football-data)`);
      }

      totalConferidos += atualizados;
      await sleep(500);
    }

    setOutput('conferidos', String(totalConferidos));
    setOutput('encerrados', String(totalEncerrados));
    setOutput('resumo', resumos.join(' | ').replace(/\n/g,' '));

    console.log('\n' + '='.repeat(60));
    console.log(`CONCLUIDO — ${totalConferidos} jogos atualizados | ${totalEncerrados} concurso(s) encerrado(s)`);
    console.log('='.repeat(60));

  } catch(err) {
    console.error(`\nERRO: ${err.message}`);
    setOutput('conferidos','0');
    setOutput('encerrados','0');
    setOutput('resumo',`ERRO: ${err.message}`);
    process.exit(1);
  }
})();
