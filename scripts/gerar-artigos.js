const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Artigos a serem gerados
const artigos = [
  {
    titulo: 'Dezenas mais sorteadas na Mega-Sena',
    keyword: 'dezenas mais sorteadas mega-sena',
    filename: 'artigo-dezenas-mais-sorteadas-megasena.html',
    prompt: `Escreva um artigo SEO-otimizado e completo (mínimo 900 palavras) sobre "Dezenas mais sorteadas na Mega-Sena".

O artigo deve:
1. Explicar quais são as dezenas mais frequentes nos últimos 10 anos
2. Analisar a probabilidade estatística
3. Discutir se escolher números frequentes é uma estratégia viável
4. Incluir uma tabela com as 10 dezenas mais sorteadas
5. Mencionar links internos para o gerador de Mega-Sena
6. Incluir aviso sobre responsabilidade no jogo

Use linguagem clara, profissional e envolvente. Estruture com headings H2 e H3. Use \`\`\`html para marcar quando precisa de HTML, mas escreva apenas o conteúdo do artigo sem tags HTML.`,
    categoria: 'mega-sena',
    tag: 'Análise'
  },
  {
    titulo: 'Como funciona a Lotofácil — guia completo',
    keyword: 'como funciona lotofácil',
    filename: 'artigo-como-funciona-lotofacil.html',
    prompt: `Escreva um artigo SEO-otimizado e completo (mínimo 900 palavras) sobre "Como funciona a Lotofácil — guia completo".

O artigo deve:
1. Explicar as regras básicas da Lotofácil
2. Descrever a estrutura de prêmios (15, 14, 13, 12, 11 acertos)
3. Mencionar a frequência de sorteios (diária)
4. Explicar as probabilidades matemáticas
5. Descrever como jogar (online e em casas lotéricas)
6. Incluir uma tabela comparativa com outras loterias
7. Mencionar links internos para o gerador de Lotofácil
8. Incluir aviso sobre responsabilidade no jogo

Use linguagem clara, profissional e envolvente. Estruture com headings H2 e H3. Use \`\`\`html para marcar quando precisa de HTML, mas escreva apenas o conteúdo do artigo sem tags HTML.`,
    categoria: 'lotofacil',
    tag: 'Guia Completo'
  },
  {
    titulo: 'Quina vs Lotofácil: qual tem mais chances?',
    keyword: 'quina vs lotofácil',
    filename: 'artigo-quina-vs-lotofacil.html',
    prompt: `Escreva um artigo SEO-otimizado e completo (mínimo 900 palavras) sobre "Quina vs Lotofácil: qual tem mais chances?".

O artigo deve:
1. Comparar as regras de ambas as loterias
2. Analisar as probabilidades de ganho em cada categoria
3. Discutir custo-benefício (investimento vs retorno esperado)
4. Avaliar frequência de sorteios
5. Explicar qual é "melhor" para cada tipo de jogador
6. Incluir tabela comparativa detalhada
7. Mencionar links internos para geradores de ambas
8. Incluir aviso sobre responsabilidade no jogo

Use linguagem clara, profissional e envolvente. Estruture com headings H2 e H3. Use \`\`\`html para marcar quando precisa de HTML, mas escreva apenas o conteúdo do artigo sem tags HTML.`,
    categoria: 'comparacao',
    tag: 'Comparação'
  }
];

// Template HTML para artigos
function gerarHTMLArticle(titulo, conteudo, keyword, categoria, tag) {
  const data = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<!-- ===== SEO ===== -->
<title>${titulo} · Palpitiar</title>
<meta name="description" content="Artigo completo sobre ${keyword}. Análise detalhada, estatísticas e estratégias para loterias brasileiras.">
<meta name="keywords" content="${keyword}">
<meta name="robots" content="index, follow">
<meta name="author" content="Palpitiar">
<link rel="canonical" href="https://palpitiar.com.br/${gerarFileName(titulo)}">

<!-- Open Graph -->
<meta property="og:type" content="article">
<meta property="og:url" content="https://palpitiar.com.br/${gerarFileName(titulo)}">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="Artigo completo sobre ${keyword}.">
<meta property="og:image" content="https://palpitiar.com.br/icon-512.png">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Palpitiar">
<meta property="article:published_time" content="${data}">
<meta property="article:author" content="Palpitiar">
<meta property="article:section" content="Loterias">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${titulo}">
<meta name="twitter:description" content="Artigo completo sobre ${keyword}.">
<meta name="twitter:image" content="https://palpitiar.com.br/icon-512.png">

<!-- Schema.org Article -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${titulo}",
  "description": "Artigo completo sobre ${keyword}.",
  "url": "https://palpitiar.com.br/${gerarFileName(titulo)}",
  "datePublished": "${data}",
  "dateModified": "${data}",
  "author": {
    "@type": "Organization",
    "name": "Palpitiar",
    "url": "https://palpitiar.com.br"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Palpitiar",
    "url": "https://palpitiar.com.br",
    "logo": {
      "@type": "ImageObject",
      "url": "https://palpitiar.com.br/icon-512.png"
    }
  }
}
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,600;9..144,800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-192.png">

<style>
  :root{--bg:#0a1a14;--bg-2:#0f2419;--ink:#f4ebd0;--ink-dim:rgba(244,235,208,.62);--ink-faint:rgba(244,235,208,.28);--gold:#d4a84b;--green:#4caf7d;--blue:#6b8cda;--line:rgba(244,235,208,.1);--display:'Fraunces',Georgia,serif;--mono:'JetBrains Mono',monospace}
  *{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{background:var(--bg);color:var(--ink);font-family:var(--display);font-size:16px;line-height:1.7;min-height:100vh}
  body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse 800px 500px at 80% 10%,rgba(212,168,75,.05),transparent 60%)}

  .wrap{position:relative;z-index:1;max-width:900px;margin:0 auto;padding:0 24px 60px}

  .site-nav{display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid var(--line);margin-bottom:48px}
  .site-nav-logo{font-family:var(--display);font-weight:800;font-style:italic;font-size:22px;letter-spacing:-.02em;color:var(--ink);text-decoration:none}
  .site-nav-logo em{color:var(--gold)}
  .site-nav-links{display:flex;gap:6px}
  .site-nav-link{font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;padding:7px 14px;border-radius:2px;text-decoration:none;color:var(--ink-dim);transition:all .2s;border:1px solid transparent}
  .site-nav-link:hover{color:var(--ink);border-color:var(--line)}

  .article-header{margin-bottom:40px;padding-bottom:32px;border-bottom:1px solid var(--line)}
  .article-tag{font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:12px;display:block}
  .article-title{font-family:var(--display);font-weight:600;font-size:clamp(32px,5vw,52px);letter-spacing:-.02em;line-height:1.1;color:var(--ink);margin-bottom:16px}
  .article-meta{font-family:var(--mono);font-size:11px;color:var(--ink-dim)}
  .article-intro{font-family:var(--display);font-size:18px;color:var(--ink-dim);margin-bottom:40px;line-height:1.6}

  .prose h2{font-family:var(--display);font-weight:600;font-size:28px;color:var(--ink);margin:40px 0 20px;letter-spacing:-.01em;padding-bottom:12px;border-bottom:1px solid var(--line)}
  .prose h3{font-family:var(--display);font-weight:600;font-size:20px;color:var(--gold);margin:28px 0 14px}
  .prose p{color:var(--ink-dim);margin-bottom:18px;font-size:16px;line-height:1.85}
  .prose p strong{color:var(--ink)}
  .prose ul,.prose ol{color:var(--ink-dim);padding-left:24px;margin-bottom:20px;font-size:16px}
  .prose li{margin-bottom:10px;line-height:1.7}
  .prose a{color:var(--gold);text-decoration:none;border-bottom:1px solid rgba(212,168,75,.3);transition:border-color .2s}
  .prose a:hover{border-color:var(--gold)}

  .prose table{width:100%;border-collapse:collapse;margin:24px 0;font-family:var(--mono);font-size:13px}
  .prose th{padding:10px 14px;text-align:left;background:rgba(212,168,75,.08);color:var(--gold);border:1px solid var(--line)}
  .prose td{padding:10px 14px;border:1px solid var(--line);color:var(--ink-dim)}

  .highlight{background:rgba(212,168,75,.08);border:1px solid rgba(212,168,75,.2);border-left:3px solid var(--gold);padding:18px 22px;margin:28px 0}
  .warning-box{background:rgba(196,69,45,.06);border:1px solid rgba(196,69,45,.2);border-left:3px solid #c4452d;padding:16px 20px;margin:28px 0}
  .warning-box p{margin-bottom:0;font-size:14px;color:var(--ink-dim)}

  .cta-box{background:rgba(76,175,125,.08);border:1px solid rgba(76,175,125,.25);border-radius:4px;padding:24px 28px;margin:36px 0;text-align:center}
  .cta-box p{color:var(--ink-dim);margin-bottom:16px}
  .cta-btn{display:inline-block;padding:12px 28px;background:var(--gold);color:#0a1a14;border-radius:2px;font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;transition:all .2s}
  .cta-btn:hover{background:#e8c474;transform:translateY(-1px)}

  footer{margin-top:60px;padding:24px 0;border-top:1px solid var(--line);display:flex;justify-content:center;gap:24px;flex-wrap:wrap}
  footer a,footer span{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint);text-decoration:none;transition:color .2s}
  footer a:hover{color:var(--ink-dim)}

  @media(max-width:640px){
    .wrap{padding:0 16px 40px}
    .article-title{font-size:28px}
  }
</style>
</head>
<body>
<div class="wrap">

  <nav class="site-nav">
    <a class="site-nav-logo" href="/index.html">Palpit<em>ia</em>r</a>
    <div class="site-nav-links">
      <a class="site-nav-link" href="/mega-sena.html">Mega-Sena</a>
      <a class="site-nav-link" href="/lotofacil.html">Lotofácil</a>
      <a class="site-nav-link" href="/quina.html">Quina</a>
      <a class="site-nav-link" href="/blog.html">Blog</a>
    </div>
  </nav>

  <article>
    <header class="article-header">
      <span class="article-tag">${tag}</span>
      <h1 class="article-title">${titulo}</h1>
      <div class="article-meta">
        <span class="article-date">${new Date().toLocaleDateString('pt-BR', {year: 'numeric', month: 'long', day: 'numeric'})}</span>
        <span class="article-read">· ~9 min de leitura</span>
      </div>
    </header>

    <div class="prose">
      ${conteudo}
    </div>

    <div class="warning-box">
      <p><strong>⚠️ Responsabilidade no jogo:</strong> Jogos de azar envolvem risco. Jogue apenas o que você pode perder. Se você ou alguém próximo tem dificuldades com apostas, procure ajuda. <a href="https://www.ncpg.org.br/" style="color:var(--gold)">Saiba mais sobre jogo responsável</a>.</p>
    </div>

    <div class="cta-box">
      <p>Quer gerar suas próprias combinações?</p>
      <a class="cta-btn" href="/index.html">Voltar para Geradores</a>
    </div>
  </article>

  <footer>
    <a href="/index.html">Home</a>
    <span>·</span>
    <a href="/sobre.html">Sobre</a>
    <span>·</span>
    <a href="/contato.html">Contato</a>
    <span>·</span>
    <a href="/privacidade.html">Privacidade</a>
  </footer>

</div>
</body>
</html>`;
}

function gerarFileName(titulo) {
  return titulo
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '') + '.html';
}

// Função para gerar artigos
async function gerarArtigos() {
  console.log('🚀 Iniciando geração de artigos...\n');

  for (const artigo of artigos) {
    try {
      console.log(`📝 Gerando: ${artigo.titulo}...`);

      const message = await client.messages.create({
        model: 'claude-opus-4.6',
        max_tokens: 3000,
        messages: [
          {
            role: 'user',
            content: artigo.prompt
          }
        ]
      });

      const conteudo = message.content[0].type === 'text' ? message.content[0].text : '';

      // Remove markdown se houver
      const conteudoLimpo = conteudo
        .replace(/```html\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const htmlCompleto = gerarHTMLArticle(artigo.titulo, conteudoLimpo, artigo.keyword, artigo.categoria, artigo.tag);

      // Criar diretório se não existir
      const blogDir = path.join(process.cwd(), 'blog');
      if (!fs.existsSync(blogDir)) {
        fs.mkdirSync(blogDir, { recursive: true });
      }

      // Salvar arquivo
      const caminhoArquivo = path.join(blogDir, artigo.filename);
      fs.writeFileSync(caminhoArquivo, htmlCompleto, 'utf-8');

      console.log(`   ✅ Salvo: ${artigo.filename}\n`);
    } catch (erro) {
      console.error(`   ❌ Erro ao gerar ${artigo.titulo}:`, erro.message);
    }
  }

  console.log('✨ Geração de artigos concluída!');
}

// Executar
gerarArtigos().catch(console.error);
