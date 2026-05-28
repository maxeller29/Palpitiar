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
    titulo: "Dezenas mais sorteadas na Mega-Sena",
    filename: "artigo-dezenas-mais-sorteadas-megasena.html",
    prompt: `Escreva um artigo completo (900+ palavras) sobre as dezenas mais sorteadas na Mega-Sena. Inclua análise estatística, top 10 dezenas, e links para o gerador.`,
  },
  {
    titulo: "Como funciona a Lotofácil — guia completo",
    filename: "artigo-como-funciona-lotofacil.html",
    prompt: `Escreva um guia completo (900+ palavras) sobre como funciona a Lotofácil. Inclua regras, prêmios, probabilidades e links para o gerador.`,
  },
  {
    titulo: "Quina vs Lotofácil: qual tem mais chances?",
    filename: "artigo-quina-vs-lotofacil.html",
    prompt: `Escreva uma análise completa (900+ palavras) comparando Quina e Lotofácil. Qual é melhor, probabilidades, custo-benefício.`,
  },
];

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
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${artigo.titulo} · Palpitiar</title>
</head>
<body style="font-family: Arial; max-width: 900px; margin: 0 auto; padding: 20px;">
<h1>${artigo.titulo}</h1>
<div>${conteudo}</div>
<p><small>Artigo gerado em ${new Date().toLocaleDateString('pt-BR')}</small></p>
</body>
</html>`;

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