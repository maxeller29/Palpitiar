@echo off
cd /d "%~dp0"
git add dupla-sena.html lotoia-db.js index.html lotomania.html timemania.html diadesorte.html netlify/functions/resultado.js scripts/criar-historico-timemania.js scripts/criar-historico-diadesorte.js timemania-historico.json diadesorte-historico.json stats-engine.js stats-mega-sena.html stats-lotofacil.html stats-quina.html stats-lotomania.html stats-dupla-sena.html stats-timemania.html stats-diadesorte.html mega-sena.html lotofacil.html quina.html termos.html privacidade.html blog.html
git commit -m "feat: implementa Timemania, Dia de Sorte e paginas de estatisticas

TIMEMANIA
- timemania.html: pagina de gerador estatistico (universo 1-80, 10 dezenas, R$3,50)
- scripts/criar-historico-timemania.js: busca serie historica completa da Caixa
- netlify/functions/resultado.js: adiciona endpoint timemania

DIA DE SORTE
- diadesorte.html: pagina de gerador estatistico (universo 1-31, 7 dezenas, R$2,50)
- scripts/criar-historico-diadesorte.js: busca serie historica completa da Caixa

COMPARTILHADOS
- lotoia-db.js: adiciona PREMIOS_FIXOS, FAIXAS_PREMIADAS e ep para timemania e dia-de-sorte
- index.html: cards desktop/mobile e nav links para timemania e dia-de-sorte

ESTATISTICAS
- stats-engine.js: modulo compartilhado com computeStats, SVG charts e generateConclusions
- stats-mega-sena.html, stats-lotofacil.html, stats-quina.html: paginas de analise historica
- stats-lotomania.html, stats-dupla-sena.html, stats-timemania.html, stats-diadesorte.html
- mega-sena.html, lotofacil.html, quina.html, lotomania.html, dupla-sena.html: botao Ver estatisticas

FIXES ANTERIORES
- fix(dupla-sena): corrige bug de salvarCombinacoes e suporte no lotoia-db
- fix(lotomania): remove cards de probabilidade de 16 acertos
- fix(index): corrige grid mobile para quadrantes de tamanho igual"
git push
pause
