# Resumo da Sessão — Desenvolvimento Loteca · Palpitiar
**Data:** 10–11/jun/2026 · **Projeto:** palpitiar.com.br

---

## CONTEXTO GERAL

O Palpitiar já tem funcionando: Mega-Sena, Lotofácil e Quina (geradores de combinações, conferência automática via GitHub Actions, blog, Instagram/Facebook). A **Loteca é uma nova modalidade em desenvolvimento**, com lógica diferente das demais — não gera combinações por usuário, mas uma **análise única por concurso** com 14 partidas de futebol.

---

## O QUE FOI CONSTRUÍDO NESTA SESSÃO

### 1. Série Histórica da Loteca
- 1.254 concursos coletados (fev/2002–jun/2026) via API Caixa
- Bug corrigido: API envia valores monetários em centavos sem separador → dividir por 100
- Chave correta da API: `listaResultadoEquipeEsportiva` (não `listaResultadoEquipesOrdenado`)
- Scripts: `gerar_historico_loteca.py` e `corrigir_valores_loteca.py`

### 2. Análise Estatística Completa
**Premiação:**
- Taxa de acúmulo: **45,6%** (572 concursos sem ganhador 14pts)
- Rateio mediano 14pts: **R$ 105.130**
- Maior prêmio: **R$ 6,2M** (concurso 943, jun/2021 — após 10 semanas de seca)
- Efeito seca: mediana sobe de R$149K (1 seca) → R$426K (3 secas) → R$2,67M+ (6+)
- Ruptura em 2020: acúmulo sobe de 41% para 57% (futebol mais equilibrado)

**Resultados por partida:**
- Coluna1 global: **47,2%** · Empate: **26,2%** · Coluna2: **26,6%**
- Era atual (2020-2026): 45,3% / 28,1% / 26,6% ← priors usados no modelo
- Jogo 10: único com desvio estatisticamente significativo (51,4% c1, z=+2,96)
- Jogos 1 e 9: mais abertos (44,8% c1)
- **Nunca ocorreu** um volante com 14 coluna1 em 24 anos
- Único volante sem coluna1: concurso #400 (18/02/2010) — 7X + 7C2
- Não há autocorrelação entre jogos consecutivos (max desvio: 2,1pp)

**Distribuição de c1 por volante:**
- Pico: 6 c1 (20,6% dos concursos) · Mediana: 7 · Média: 6,61
- Zona normal 6–7 c1: 38,8% dos concursos
- Concursos premiados: média 7,37 c1 · Acumulados: média 5,71 c1

### 3. Modelo de Análise (Poisson Bivariada)
**Arquivo:** `modelo_analise_loteca.py`

Score 0–100 por time, soma ponderada de 7 fatores:
| Fator | Peso |
|---|---|
| Força relativa dos times | 25% |
| Forma recente (casa/fora separados) | 20% |
| Tipo e fase da competição | 20% |
| Mando de campo | 15% |
| H2H | 10% |
| Contexto motivacional | 7% |
| Odds de mercado | 3% |

**Classificação:** score ≥ 65 = Fácil · 45–64 = Médio · <45 = Difícil  
**Ação:** Fácil → simples · Médio → duplo · Difícil → triplo

**Regras especiais obrigatórias:**
- Clássico regional (Derby, Ba-Vi, Grenal, Re-Pa): −10 a −15pts automático
- Clássico nacional (Fla-Bot, Derby paulista): −12 a −14pts
- Eliminatório mata-mata: −8 a −15pts adicionais
- Time pode poupar jogadores: −20pts automático

**ERRO CORRIGIDO:** versão inicial tinha todos os 14 jogos como Coluna 1 e clássicos classificados como "Fácil". Corrigido para: 2 Fáceis (Atlético Madrid×Espanyol; Bragantino×Mirassol), 4 Médios, 8 Difíceis. Santos×São Paulo virou Coluna 2 (São Paulo 58×Santos 36).

### 4. Coletor de Dados
**Arquivo:** `coletor_dados_loteca.py`

Arquitetura de fontes em cascata:
1. **API-Futebol** (api-futebol.com.br) → times brasileiros, Bearer token, 50 req/dia grátis
   - Endpoint `/tabela` → forma recente (ultimos_jogos V/E/D), gols pró/contra
   - Endpoint `/partidas` → separação casa/fora com médias específicas por mando
2. **SofaScore** (JSON público) → times europeus, biblioteca `sofascore-wrapper` PyPI
3. **OddsPortal** → validação das odds, scraping HTML
4. **Transfermarkt** → valor de mercado do elenco, scraping mensal
5. **Ogol** → times regionais pequenos, fallback
6. **GE/ESPN** → escalações/lesões, manual pelo editor no painel admin

**Normalização de nomes:** tabela `times_mapeamento` no Supabase mapeia nome da Caixa → IDs em cada fonte.

**Timing de publicação:**
- **Análise Preliminar** (terça/quarta após anúncio): 80% dos dados disponíveis, sem escalações
- **Análise Final** (sexta/sábado): com escalações e lesões confirmadas — versão para apostar

### 5. Estratégia de Cartões — 10 Configurações
Baseada na fronteira de Pareto (melhor probabilidade por faixa de preço):

| Nível | Config | Preço | Chance 14pts | Bônus 13pts |
|---|---|---|---|---|
| Econômico | 2d+0t | R$8 | 1 em 4.205 | +2 |
| Equilibrado | 2d+1t | R$24 | 1 em 2.187 | +4 |
| Reforçado | 3d+1t | R$48 | 1 em 1.458 | +5 |
| **Inteligente ★** | **2d+2t** | **R$72** | **1 em 1.137** | **+6** |
| Avançado | 2d+3t | R$216 | 1 em 591 | +8 |
| Completo | 4d+2t | R$288 | 1 em 505 | +8 |
| Máx.Cobertura | 3d+3t | R$432 | 1 em 394 | +9 |
| **5 Triplos ◆** | **0d+5t** | **R$486** | **1 em 360** | **+10** |
| Premium | 4d+3t | R$864 | 1 em 263 | +10 |
| **6 Triplos ◆** | **0d+6t** | **R$1.458** | **1 em 187** | **+12** |

Valores validados em loterias.caixa.gov.br. 5t e 6t adicionados após revisão — estão na fronteira de Pareto e geram muitos prêmios de 13pts bônus ao gabaritar.

**Lógica de alocação:** triplos nos jogos mais abertos (Difíceis), duplos nos médios, simples nos favoritos claros.

### 6. Página loteca.html
**Arquivo:** `loteca.html` — página pública completa

Funcionalidades implementadas:
- Layout 2 colunas: análise dos 14 jogos (esquerda) + seletor de cartões sticky (direita)
- Score 0–100 por time com barra visual e cor (verde/dourado/vermelho)
- Decomposição do score por fator (força, forma, mando, H2H)
- Resumo da escolha (1–2 linhas) + justificativa completa (expansível ao clicar)
- Tag de cobertura por jogo (simples/duplo/triplo com colunas cobertas)
- Barra de probabilidade 1/X/2 por jogo
- 3 abas: Análise dos 14 jogos | Visão Geral | Como Funciona
- Status Preliminar/Final com semáforo colorido
- 10 cartões selecionáveis com volante completo gerado automaticamente
- Alocação inteligente: triplos nos jogos mais abertos, duplos nos médios
- Botão imprimir
- Dados mockados com estrutura pronta para substituição por dados reais do Supabase

### 7. Banco de Dados — 6 Tabelas Supabase ✅ CRIADAS

**Status: tabelas criadas e confirmadas no Supabase** (oslvqimllizsdtxwkrag)

| Tabela | Colunas | Dados iniciais |
|---|---|---|
| `competicoes_config` | 12 | 22 competições pré-populadas |
| `times_mapeamento` | 20 | 42 times com IDs em todas as fontes |
| `loteca_concursos` | 17 | — |
| `h2h_historico` | 10 | — |
| `times_forma_recente` | 20 | — |
| `loteca_jogos_analise` | 40 | — |

Também criados: RLS (leitura pública, escrita service_role), 4 triggers de `atualizado_em`, 1 view `vw_loteca_analise_completa`.

**Arquivo SQL:** `loteca_supabase_schema.sql`

---

## ARQUIVOS ENTREGUES NESTA SESSÃO

| Arquivo | Descrição |
|---|---|
| `gerar_historico_loteca.py` | Coleta série histórica via API Caixa |
| `corrigir_valores_loteca.py` | Correção do bug de valores ×100 |
| `coletor_dados_loteca.py` | Coletor de forma dos times (multicamada) |
| `modelo_analise_loteca.py` | Modelo Poisson + score + classificação |
| `loteca.html` | Página pública completa (dados mockados) |
| `loteca_analise_historica.html` | Dashboard análise histórica completa |
| `loteca_tendencias_posicao.html` | Análise de tendências por posição |
| `loteca_distribuicao_concurso.html` | Distribuição C1/X/C2 por concurso |
| `loteca_estrategia_cartoes.html` | Estratégia das 10 configurações |
| `loteca_diretrizes_classificacao.html` | Diretrizes dos 7 fatores (doc técnico) |
| `loteca_arquitetura_coleta.html` | Arquitetura de coleta completa |
| `loteca_supabase_schema.sql` | Schema SQL das 6 tabelas ✅ |

---

## PENDÊNCIAS — PRÓXIMOS PASSOS

### Imediato
1. **Criar conta API-Futebol** (ct.api-futebol.com.br) — chave Bearer token necessária para coleta real
2. **Construir `pipeline_loteca.py`** — orquestra coleta → cálculo de scores → gravação no Supabase
3. **Construir painel admin** — interface para revisar análise gerada e publicar (Preliminar/Final)

### Pendente da Fase 2
- Fonte para jogos internacionais (SofaScore — implementação completa do scraping)
- Dicionário mestre completo de times (ampliar além dos 42 pré-cadastrados)
- GitHub Actions de coleta automática (terça 18h + sexta 20h)
- Backtesting automático após cada concurso
- Integrar loteca.html ao site ao vivo (substituir dados mockados por Supabase)

---

## DECISÕES DE DESIGN

- A Loteca **não gera combinações por usuário** — gera análise única por concurso + 10 cartões predefinidos
- Apostador escolhe apenas pelo orçamento, sem personalização
- Dados mockados no HTML prontos para substituição por JSON do Supabase
- Análise em 2 estágios: Preliminar (sem escalações) → Final (com escalações)
- Fator clássico é **obrigatório** — reduz score de 10–15pts independente da força dos times
