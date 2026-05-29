const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ Erro: ANTHROPIC_API_KEY não está definida!");
  process.exit(1);
}

console.log("🔑 API Key presente:", process.env.ANTHROPIC_API_KEY.substring(0, 15) + "...");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const artigos = [
  {
    titulo: "Estratégias de Jogo Responsável em Loterias",
    keyword: "jogo responsável loterias",
    filename: "artigo-jogo-responsavel-loterias.html",
    prompt: `Escreva um artigo completo (900+ palavras) sobre "Estratégias de Jogo Responsável em Loterias".

O artigo deve incluir:
1. Por que não gastar mais do que pode permitir
2. Como estabelecer um orçamento saudável para loterias
3. Sinais de alerta para dependência de jogos
4. Dicas práticas para jogar com responsabilidade
5. Recursos e links para ajuda profissional
6. Estatísticas sobre jogos de azar

Use linguagem clara e empática. Estruture com H2 e H3. Inclua disclaimer sobre saúde mental.`,
  },
  {
    titulo: "História e Evolução das Loterias Brasileiras",
    keyword: "história loterias brasileiras",
    filename: "artigo-historia-loterias-brasileiras.html",
    prompt: `Escreva um artigo completo (900+ palavras) sobre "História e Evolução das Loterias Brasileiras".

O artigo deve incluir:
1. Origem das loterias no Brasil (décadas passadas)
2. Como surgiram a Mega-Sena, Lotofácil e Quina
3. Mudanças nas regras ao longo dos anos
4. Impacto social e econômico das loterias
5. Evolução tecnológica (de papel para digital)
6. Dados curiosos sobre loterias brasileiras

Use linguagem envolvente e histórica. Estruture com H2 e H3. Seja informativo e educativo.`,
  },
  {
    titulo: "Combinações Ganhadores: Análise de Padrões Reais",
    keyword: "padrões números ganhadores loterias",
    filename: "artigo-padroes-combinacoes-ganhadores.html",
    prompt: `Escreva um artigo completo (900+ palavras) sobre "Combinações Ganhadores: Análise de Padrões Reais".

O artigo deve incluir:
1. Padrões estatísticos que mais saem em loterias
2. Análise de números pares vs ímpares
3. Sequências e combinações que mais ganham
4. Dados históricos de milhares de concursos
5. Como usar análise de padrões (com responsabilidade)
6. Limitações da previsão em jogos de azar
7. Dicas baseadas em estatísticas reais

Use linguagem técnica mas acessível. Incluir gráficos/tabelas mentais. Sempre ressaltar que é análise, não garantia.`,
  },
];

function criarHTML(titulo, conteudo) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo} · Palpitiar</title>
<meta name="description" content="${titulo}">
<meta name="robots" content="index, follow">
</head>
<body style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333;">
<h1>${titulo}</h1>
<div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #d4a84b; margin: 20px 0;">
  <p><strong>Aviso:</strong> Este artigo é informativo. Jogos de azar envolvem risco. Jogue responsavelmente.</p>
</div>
<div>${conteudo.replace(/\n\n/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>
<hr>
<p><small>Artigo gerado em ${new Date().toLocaleDateString('pt-BR')} • Palpitiar</small></p>
</body>
</html>`;
}

async function gerarArtigos() {
  console.log("\n🚀 Iniciando geração de artigos...\n");

  let sucessos = 0;
  let erros = 0;

  for (const artigo of artigos) {
    try {
      console.log(`📝 Gerando: ${artigo.titulo}...`);

      const message = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: artigo.prompt,
          },
        ],
      });

      const conteudo = message.content[0].type === "text" ? message.content[0].text : "";
      const html = criarHTML(artigo.titulo, conteudo);

      const blogDir = path.join(process.cwd(), "blog");
      if (!fs.existsSync(blogDir)) {
        fs.mkdirSync(blogDir, { recursive: true });
      }

      const caminhoArquivo = path.join(blogDir, artigo.filename);
      fs.writeFileSync(caminhoArquivo, html, "utf-8");

      console.log(`   ✅ Salvo: ${artigo.filename}\n`);
      sucessos++;
    } catch (erro) {
      console.error(`   ❌ Erro: ${erro.message}\n`);
      erros++;
    }
  }

  console.log(`\n📊 Resultado: ${sucessos} sucesso(s), ${erros} erro(s)`);
  if (sucessos === 0) process.exit(1);
}

gerarArtigos().catch((erro) => {
  console.error("Erro fatal:", erro);
  process.exit(1);
});