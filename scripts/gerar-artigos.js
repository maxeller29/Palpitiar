const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

// Validar API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ Erro: ANTHROPIC_API_KEY não está definida!");
  process.exit(1);
}

console.log("🔑 API Key presente:", process.env.ANTHROPIC_API_KEY.substring(0, 15) + "...");

// Inicializar cliente
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Artigos a serem gerados
const artigos = [
  {
    titulo: "Dezenas mais sorteadas na Mega-Sena",
    keyword: "dezenas mais sorteadas mega-sena",
    filename: "artigo-dezenas-mais-sorteadas-megasena.html",
    prompt: `Escreva um artigo completo (900+ palavras) sobre as dezenas mais sorteadas na Mega-Sena.

Inclua: análise estatística, top 10 dezenas, probabilidades, se é viável usar essa estratégia, e links para o gerador.
Use heading H2 e H3. Sem HTML tags, apenas o conteúdo em texto simples.`,
  },
  {
    titulo: "Como funciona a Lotofácil — guia completo",
    keyword: "como funciona lotofácil",
    filename: "artigo-como-funciona-lotofacil.html",
    prompt: `Escreva um guia completo (900+ palavras) sobre como funciona a Lotofácil.

Inclua: regras básicas, estrutura de prêmios (15, 14, 13, 12, 11 acertos), como jogar, probabilidades e links para o gerador.
Use heading H2 e H3. Sem HTML tags, apenas o conteúdo em texto simples.`,
  },
  {
    titulo: "Quina vs Lotofácil: qual tem mais chances?",
    keyword: "quina vs lotofácil",
    filename: "artigo-quina-vs-lotofacil.html",
    prompt: `Escreva uma análise completa (900+ palavras) comparando Quina e Lotofácil.

Inclua: comparação de regras, probabilidades, custo-benefício, qual é melhor para cada tipo de jogador, e links para geradores.
Use heading H2 e H3. Sem HTML tags, apenas o conteúdo em texto simples.`,
  },
];

// Template HTML básico
function criarHTML(titulo, conteudo) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo} · Palpitiar</title>
<meta name="description" content="${titulo}">
</head>
<body style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333;">
<h1>${titulo}</h1>
<div>${conteudo.replace(/\n\n/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>
<hr>
<p><small>Artigo gerado automaticamente • ${new Date().toLocaleDateString('pt-BR')}</small></p>
</body>
</html>`;
}

// Função para gerar artigos
async function gerarArtigos() {
  console.log("\n🚀 Iniciando geração de artigos...\n");

  let sucessos = 0;
  let erros = 0;

  for (const artigo of artigos) {
    try {
      console.log(`📝 Gerando: ${artigo.titulo}...`);

      const message = await client.messages.create({
        model: "claude-opus-4.6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: artigo.prompt,
          },
        ],
      });

      const conteudo =
        message.content[0].type === "text" ? message.content[0].text : "";

      const html = criarHTML(artigo.titulo, conteudo);

      // Criar diretório se não existir
      const blogDir = path.join(process.cwd(), "blog");
      if (!fs.existsSync(blogDir)) {
        fs.mkdirSync(blogDir, { recursive: true });
      }

      // Salvar arquivo
      const caminhoArquivo = path.join(blogDir, artigo.filename);
      fs.writeFileSync(caminhoArquivo, html, "utf-8");

      console.log(`   ✅ Salvo: ${artigo.filename}\n`);
      sucessos++;
    } catch (erro) {
      console.error(`   ❌ Erro: ${erro.message}`);
      console.error(`   Tipo: ${erro.code || erro.status || "desconhecido"}\n`);
      erros++;
    }
  }

  console.log(`\n📊 Resultado: ${sucessos} sucesso(s), ${erros} erro(s)`);

  if (sucessos > 0) {
    console.log("✨ Geração parcial concluída!");
  } else {
    console.log("⚠️  Nenhum artigo foi gerado!");
    process.exit(1);
  }
}

// Executar
gerarArtigos().catch((erro) => {
  console.error("Erro fatal:", erro);
  process.exit(1);
});
