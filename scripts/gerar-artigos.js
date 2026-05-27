const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// Configurar cliente da Claude
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Dados dos 3 artigos a gerar
const artigos = [
  {
    titulo: "Dezenas mais sorteadas na Mega-Sena",
    arquivo: "artigo-dezenas-mais-sorteadas-megasena.html",
    keyword: "dezenas mais sorteadas mega-sena",
    categoria: "mega-sena",
    prompt: `Crie um artigo completo sobre dezenas mais sorteadas na Mega-Sena.
Requisitos:
- Mínimo 900 palavras
- Baseado em análise de 3.010+ concursos históricos
- Incluir tabela com as dezenas mais frequentes
- Otimizado para SEO com a keyword: "dezenas mais sorteadas mega-sena"
- Tom informativo mas acessível
- Incluir aviso de jogo responsável ao final
Formato: HTML válido pronto para publicação`
  },
  {
    titulo: "Como funciona a Lotofácil — guia completo",
    arquivo: "artigo-como-funciona-lotofacil.html",
    keyword: "como funciona lotofácil",
    categoria: "lotofacil",
    prompt: `Crie um guia completo sobre como funciona a Lotofácil.
Requisitos:
- Mínimo 900 palavras
- Explicar regras, prêmios, probabilidades
- Ideal para iniciantes
- Incluir tabela de prêmios e categorias
- Otimizado para SEO com keyword: "como funciona lotofácil"
- Dicas estratégicas práticas
- Incluir aviso de jogo responsável
Formato: HTML válido pronto para publicação`
  },
  {
    titulo: "Quina vs Lotofácil: qual tem mais chances?",
    arquivo: "artigo-quina-vs-lotofacil.html",
    keyword: "quina vs lotofácil",
    categoria: "geral",
    prompt: `Crie um artigo comparativo entre Quina e Lotofácil.
Requisitos:
- Mínimo 900 palavras
- Comparação lado a lado (regras, probabilidades, prêmios)
- Qual tem mais chances de ganho
- Tabelas comparativas
- Otimizado para SEO com keyword: "quina vs lotofácil"
- Qual escolher segundo perfil do jogador
- Incluir aviso de jogo responsável
Formato: HTML válido pronto para publicação`
  }
];

// Template HTML base
const htmlTemplate = (titulo, conteudo, categoria, keyword, data) => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo} · Palpitiar</title>
<meta name="description" content="${titulo} - Análise completa com dados históricos reais.">
<meta name="keywords" content="${keyword}">
<meta name="robots" content="index, follow">
<meta name="author" content="Palpitiar">

<meta property="og:type" content="article">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${titulo} - Análise com dados de 13.700+ concursos históricos.">
<meta property="og:image" content="https://palpitiar.com.br/icon-512.png">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,600;9..144,800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

<style>
  :root {
    --bg:#0a1a14;--bg-2:#0f2419;--ink:#f4ebd0;
    --ink-dim:rgba(244,235,208,.62);--ink-faint:rgba(244,235,208,.28);
    --gold:#d4a84b;--green:#4caf7d;--line:rgba(244,235,208,.1);
    --display:'Fraunces',Georgia,serif;--mono:'JetBrains Mono',monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:var(--bg);color:var(--ink);font-family:var(--display);font-size:16px;line-height:1.7;min-height:100vh}
  .wrap{position:relative;max-width:820px;margin:0 auto;padding:0 24px 60px}
  h1{font-size:44px;margin:40px 0 20px;color:var(--ink)}
  h2{font-size:24px;margin:44px 0 16px;color:var(--ink);border-bottom:1px solid var(--line);padding-bottom:10px}
  p{color:var(--ink-dim);margin-bottom:20px;line-height:1.85}
  a{color:var(--gold);text-decoration:none;border-bottom:1px solid rgba(212,168,75,.3)}
  table{width:100%;border-collapse:collapse;margin:24px 0;font-size:13px}
  th{padding:10px 14px;text-align:left;background:rgba(212,168,75,.08);color:var(--gold);border:1px solid var(--line)}
  td{padding:10px 14px;border:1px solid var(--line);color:var(--ink-dim)}
  .warning-box{background:rgba(196,69,45,.06);border:1px solid rgba(196,69,45,.2);border-left:3px solid #c4452d;border-radius:2px;padding:16px 20px;margin:28px 0}
  .warning-box p{margin-bottom:0;font-size:14px;color:var(--ink-dim)}
  footer{margin-top:60px;padding:24px 0;border-top:1px solid var(--line);text-align:center;color:var(--ink-faint);font-size:10px}
</style>
</head>
<body>
<div class="wrap">
  <h1>${titulo}</h1>
  <p style="color:var(--ink-faint);margin-bottom:30px">${data}</p>

  ${conteudo}

  <div class="warning-box">
    <p><strong>Jogue com responsabilidade.</strong> As análises estatísticas apresentadas neste artigo têm caráter informativo e educativo. Nenhum método garante prêmios em loterias. O Palpitiar não tem vínculo com a Caixa Econômica Federal. Exclusivo para maiores de 18 anos.</p>
  </div>

  <footer>
    <p>Palpitiar · 2026 | <a href="/blog.html">← Voltar ao Blog</a></p>
  </footer>
</div>
</body>
</html>`;

// Função principal
async function gerarArtigos() {
  console.log('🚀 Iniciando geração de artigos...\n');

  const data = new Date().toLocaleDateString('pt-BR');
  
  for (const artigo of artigos) {
    try {
      console.log(`📝 Gerando: ${artigo.titulo}...`);

      // Chamar Claude API
      const message = await client.messages.create({
        model: "claude-opus-4.6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: artigo.prompt
          }
        ],
      });

      // Extrair conteúdo
      const conteudo = message.content[0].type === 'text' 
        ? message.content[0].text 
        : '';

      // Gerar HTML
      const html = htmlTemplate(
        artigo.titulo,
        conteudo,
        artigo.categoria,
        artigo.keyword,
        data
      );

      // Salvar arquivo
      const caminhoArquivo = path.join(
        __dirname,
        '..',
        'blog',
        artigo.arquivo
      );

      // Criar pasta blog se não existir
      const pastaBlog = path.dirname(caminhoArquivo);
      if (!fs.existsSync(pastaBlog)) {
        fs.mkdirSync(pastaBlog, { recursive: true });
      }

      fs.writeFileSync(caminhoArquivo, html, 'utf8');
      console.log(`✅ Salvo: ${artigo.arquivo}\n`);

    } catch (erro) {
      console.error(`❌ Erro ao gerar ${artigo.titulo}:`);
      console.error(erro);
      process.exit(1);
    }
  }

  console.log('\n✅ Todos os artigos foram gerados com sucesso!');
}

// Executar
gerarArtigos().catch(erro => {
  console.error('❌ Erro crítico:', erro);
  process.exit(1);
});
