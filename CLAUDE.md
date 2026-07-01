# CLAUDE.md

Este arquivo fornece orientações ao Claude Code (claude.ai/code) ao trabalhar com o código deste repositório.

## Visão Geral do Projeto

**Palpitiar** — gerador de combinações de loteria com IA e análise estatística. Publicado em `palpitiar.com.br` via Netlify. Sem etapa de build; todas as páginas são arquivos HTML/CSS/JS simples servidos diretamente.

## Comandos

```bash
# Gerar artigos do blog com Claude (requer a variável de ambiente ANTHROPIC_API_KEY)
npm run gerar-artigos

# Atualizar os JSONs de histórico das loterias manualmente
node scripts/atualizar-historico.js

# Executar um script específico
node scripts/<script>.js
```

Nenhuma suite de testes ou linter está configurado.

## Arquitetura

### Páginas (apenas HTML, sem framework)
Cada loteria tem sua própria página independente com toda a lógica inline:
- `index.html` — home / landing page
- `mega-sena.html`, `lotofacil.html`, `quina.html` — geradores de combinações por loteria
- `analisar.html` — ferramenta de análise histórica de números
- `loteca.html` / `Loteca/` — análise da Loteca (bolão de futebol), com subpasta própria
- `admin.html` / `admin-loteca.html` — painel administrativo para gerenciamento de combinações (noindex)
- `blog.html` + `blog/artigo-*.html` — artigos SEO gerados pelo Claude

### Módulo JS compartilhado: `lotoia-db.js`
Carregado por todas as páginas de loteria. Expõe `window.LotoiaDB` com:
- Cliente REST do Supabase (`_sb`) — chamadas REST diretas usando a anon key hardcoded
- `salvarCombinacoes()` — salva combinações geradas na tabela `combinacoes` do Supabase
- `conferirConcurso()` — busca o resultado do sorteio e marca combinações como premiadas ou não
- `conferirTodosPendentes()` — verifica em lote todas as combinações pendentes
- `buscarTotaisGerais()` — contagem paginada para contornar o limite de 1000 linhas do Supabase
- Tabelas de prêmios nas constantes `PREMIOS_FIXOS` e `FAIXAS_PREMIADAS`

### Backend / Serverless
- `netlify/functions/resultado.js` — proxy CORS para `servicebus2.caixa.gov.br` (API oficial de loterias da Caixa)

### Dados históricos
Três arquivos JSON grandes consumidos pelos geradores em tempo de execução:
- `mega-sena-historico.json`, `lotofacil-historico.json`, `quina-historico.json`

Estrutura: `{ meta: { ultimoConcurso, totalConcursos, ultimaData }, concursos: [...] }`

São atualizados pelo workflow do GitHub Actions `atualizar-historico.yml`, que executa `scripts/atualizar-historico.js` agendado (ter–dom às 01:00 UTC) e faz commit + deploy no Netlify quando há mudanças.

### Service Worker (`sw.js`)
- **Network First** para páginas HTML (sempre atualizadas)
- **Cache First** para os três arquivos `*-historico.json` (grandes, raramente mudam durante uma sessão)
- Strings de versão do cache: `lotoia-v2` / `lotoia-data-v2` — incremente ambas para forçar invalidação de cache

### Geração de artigos (`scripts/gerar-artigos.js`)
Usa `@anthropic-ai/sdk` para chamar o Claude e gerar artigos SEO. Executado via workflow do GitHub Actions `gerar-artigos.yml` (diariamente às 05:00 UTC, faz commit na pasta `blog/`).

### Tabelas do Supabase
| Tabela | Finalidade |
|---|---|
| `combinacoes` | Combinações geradas com status (`pendente`/`premiada`/`expirada`) |
| `sorteios_conferidos` | Resultados de sorteios já verificados |
| `resumo_por_faixa` | Resumo agregado de prêmios por faixa |
| `contadores_gerados` | Totais acumulados de combinações geradas por loteria |

### Sistema de design
Todas as páginas compartilham uma paleta de variáveis CSS definida inline em cada página:
- `--bg` verde-escuro/preto, `--ink` creme quente, `--gold` (#d4a84b), `--green` (#4caf7d), `--blue` (#6b8cda), `--red` (#c4452d)
- Fontes: `Fraunces` (display/serif) + `JetBrains Mono` (monoespaçada), carregadas do Google Fonts

### Subpasta Loteca
`Loteca/` é um módulo semi-independente para análise da Loteca, com seus próprios scripts para coleta, análise e conferência de resultados. A página pública principal é `loteca.html` na raiz.

## Restrições importantes
- Sem pipeline de build — edições nos arquivos HTML entram em produção no próximo deploy do Netlify
- A anon key do Supabase é exposta intencionalmente (client-side, somente perfil anon); não trate como segredo
- Os arquivos JSON históricos podem ser grandes (>1 MB cada); o service worker os armazena em cache de forma agressiva
- A API de loterias da Caixa (`servicebus2.caixa.gov.br`) tem restrições de CORS — sempre roteie chamadas do navegador pelo proxy Netlify em `/.netlify/functions/resultado`
