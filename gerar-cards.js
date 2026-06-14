/**
 * gerar-cards.js — Palpitiar Social
 * Gera cards a partir de um plano-lote.json:
 *   1) Gemini API cria a ARTE-BASE (fundo decorativo, sem texto)
 *   2) Sharp compoe por cima, com precisao: titulo, destaque, dezenas,
 *      logo/icone Palpitiar, mascote (coruja) e disclaimer obrigatorio.
 *
 * Uso:  node gerar-cards.js plano-lote.json
 *
 * Requer:  npm install @google/genai sharp
 * Env:     GEMINI_API_KEY  (NUNCA commitar a chave; use .env / secrets)
 *
 * Identidade (diretrizes do GEM "Palpitiar - Criacao de Card"):
 *   - Fundo: preto escovado / grafite muito escuro
 *   - Destaques: dourado/ouro em gradiente; texto de leitura em branco
 *   - Tech: circuitos sutis, pontos luminosos dourados nos cantos
 *   - Mascote: coruja tecnologica nos cantos (assets/coruja.png, opcional)
 *   - Assinatura: logo horizontal OU icone "P"
 *   - Rodape obrigatorio: "Jogue com responsabilidade | +18"
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";

// ---------- Tokens de marca ----------
const BRAND = {
  gold: "#d4a84b",
  goldLight: "#f0cd7a",
  white: "#f5efe2",
  // Acento de fundo por loteria (apenas leve matiz; base sempre escura)
  loteriaTint: {
    "mega-sena": "#0d1f17",
    "lotofacil": "#1d1030",
    "quina": "#0a1430",
    "quina-sao-joao": "#2a1605",
    "loteca": "#1a1208",
    "default": "#101010"
  },
  disclaimerPadrao: "Jogue com responsabilidade  |  +18"
};

const ASSETS = {
  icon: path.resolve("assets/icon-P.png"),
  logo: path.resolve("assets/logo-horizontal.png"),
  coruja: path.resolve("assets/coruja.png") // opcional; se nao existir, e ignorada
};

// ---------- Prompt de marca para a ARTE-BASE (Gemini) ----------
// Importante: pedimos SO O FUNDO. Texto e numeros sao cravados pelo Sharp.
function promptArteBase(peca) {
  const base = peca.prompt_arte || "";
  return [
    "Plano de fundo decorativo para um card de rede social, estilo premium e tecnologico.",
    "Fundo PRETO ESCOVADO / GRAFITE MUITO ESCURO com textura sutil.",
    "Elementos de inteligencia artificial: circuitos integrados delicados, linhas conectadas e",
    "pontos luminosos dourados (#d4a84b) concentrados nos cantos, remetendo a redes neurais.",
    "Atmosfera sofisticada, elegante, com brilho dourado suave.",
    "ABSOLUTAMENTE SEM TEXTO, SEM NUMEROS, SEM LETRAS, SEM LOGOTIPOS — apenas o fundo.",
    "Deixe a regiao central relativamente limpa para sobreposicao posterior.",
    base
  ].join(" ");
}

// ---------- Gemini: gera a arte-base e devolve um Buffer PNG ----------
async function gerarArteBase(ai, peca, modelo) {
  const resp = await ai.models.generateContent({
    model: modelo,
    contents: promptArteBase(peca),
    config: { responseModalities: ["IMAGE"] }
  });
  const parts = resp?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    if (p.inlineData?.data) {
      return Buffer.from(p.inlineData.data, "base64");
    }
  }
  throw new Error(`Gemini nao retornou imagem para a peca ${peca.id}`);
}

// ---------- Helpers de composicao (SVG -> overlay via Sharp) ----------
function escapeXml(s = "") {
  return String(s).replace(/[<>&'"]/g, c =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

// Monta a camada SVG com titulo, destaque, subtitulo, dezenas e disclaimer.
function camadaTexto(peca) {
  const { w, h } = peca.dimensao;
  const cx = w / 2;
  const isStory = h / w > 1.7; // 9:16

  // Posicoes verticais relativas (ajustadas para post 4:5 e story 9:16)
  const yTitulo   = isStory ? h * 0.30 : h * 0.16;
  const yDestaque = isStory ? h * 0.38 : h * 0.27;
  const ySub      = isStory ? h * 0.43 : h * 0.33;
  const yBolas    = isStory ? h * 0.55 : h * 0.50;
  const yDisc     = h - 60;

  // Tamanhos com auto-ajuste do destaque para nao vazar nas laterais.
  // Estimativa de largura ~0.58*fontSize por caractere (Georgia bold maiusculo).
  const margem = w * 0.10; // 10% de cada lado de respiro
  const maxLargura = w - margem * 2;
  const fsTitulo0  = Math.round(w * 0.072);
  let   fsTitulo   = fsTitulo0;
  const nTit = (peca.titulo || "").length;
  if (nTit > 0) {
    const larguraTit = nTit * fsTitulo * 0.56;
    if (larguraTit > maxLargura) fsTitulo = Math.floor(maxLargura / (nTit * 0.56));
  }
  let   fsDestaque = Math.round(w * 0.11);
  const nDest = (peca.destaque || "").length;
  if (nDest > 0) {
    const larguraEstim = nDest * fsDestaque * 0.58;
    if (larguraEstim > maxLargura) {
      fsDestaque = Math.floor(maxLargura / (nDest * 0.58));
    }
  }
  const fsSub      = Math.round(w * 0.032);
  const fsDisc     = Math.round(w * 0.020);

  // Bolas de dezenas
  const dezenas = peca.dezenas || [];
  const r = Math.round(w * 0.062);
  const gap = Math.round(r * 2.25);
  const perRow = isStory ? 4 : Math.min(dezenas.length, 6);
  let bolas = "";
  dezenas.forEach((d, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const rowCount = Math.min(perRow, dezenas.length - row * perRow);
    const rowWidth = (rowCount - 1) * gap;
    const x = cx - rowWidth / 2 + col * gap;
    const y = yBolas + row * (gap + 6);
    bolas += `
      <circle cx="${x}" cy="${y}" r="${r}" fill="url(#ball)" stroke="${BRAND.goldLight}" stroke-width="2"/>
      <text x="${x}" y="${y + r * 0.33}" text-anchor="middle"
            font-family="monospace" font-weight="bold" font-size="${Math.round(r * 0.85)}"
            fill="#101010">${escapeXml(d)}</text>`;
  });

  const titulo   = peca.titulo   ? `<text x="${cx}" y="${yTitulo}" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="${fsTitulo}" fill="url(#gold)">${escapeXml(peca.titulo)}</text>` : "";
  const destaque = peca.destaque ? `<text x="${cx}" y="${yDestaque}" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" font-size="${fsDestaque}" fill="url(#gold)">${escapeXml(peca.destaque)}</text>` : "";
  const sub      = peca.subtitulo? `<text x="${cx}" y="${ySub}" text-anchor="middle" font-family="monospace" font-size="${fsSub}" fill="${BRAND.white}" opacity="0.8">${escapeXml(peca.subtitulo)}</text>` : "";
  const disc     = `<text x="${cx}" y="${yDisc}" text-anchor="middle" font-family="sans-serif" font-size="${fsDisc}" fill="${BRAND.white}" opacity="0.55">${escapeXml(peca.disclaimer || BRAND.disclaimerPadrao)}</text>`;

  return Buffer.from(`
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${BRAND.goldLight}"/>
          <stop offset="100%" stop-color="${BRAND.gold}"/>
        </linearGradient>
        <radialGradient id="ball" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stop-color="${BRAND.goldLight}"/>
          <stop offset="60%" stop-color="${BRAND.gold}"/>
          <stop offset="100%" stop-color="#a87f2e"/>
        </radialGradient>
      </defs>
      ${titulo}${destaque}${sub}${bolas}${disc}
    </svg>`);
}

// ---------- Pipeline de uma peca ----------
async function comporPeca(ai, peca, modelo, pastaSaida) {
  const { w, h } = peca.dimensao;

  // 1) arte-base do Gemini, redimensionada para a dimensao alvo (cover)
  let arte;
  try {
    const buf = await gerarArteBase(ai, peca, modelo);
    arte = await sharp(buf).resize(w, h, { fit: "cover" }).png().toBuffer();
  } catch (e) {
    // fallback: fundo escuro solido com leve matiz da loteria
    const tint = BRAND.loteriaTint[peca.loteria] || BRAND.loteriaTint.default;
    arte = await sharp({ create: { width: w, height: h, channels: 4,
      background: tint } }).png().toBuffer();
    console.warn(`  [aviso] peca ${peca.id}: usando fundo fallback (${e.message})`);
  }

  const overlays = [{ input: camadaTexto(peca) }];

  // 2) logo horizontal (rodape) — assinatura de marca
  if (fs.existsSync(ASSETS.logo)) {
    const logoW = Math.round(w * 0.42);
    const logo = await sharp(ASSETS.logo).resize({ width: logoW }).png().toBuffer();
    const logoMeta = await sharp(logo).metadata();
    overlays.push({ input: logo, left: Math.round((w - logoW) / 2), top: h - 120 - (logoMeta.height || 0) });
  }

  // 3) mascote coruja (canto inferior) — se o asset existir
  if (fs.existsSync(ASSETS.coruja)) {
    const owlW = Math.round(w * 0.20);
    const owl = await sharp(ASSETS.coruja).resize({ width: owlW }).png().toBuffer();
    const owlMeta = await sharp(owl).metadata();
    overlays.push({ input: owl, left: w - owlW - 30, top: h - (owlMeta.height || 0) - 150 });
  } else {
    console.warn(`  [info] peca ${peca.id}: assets/coruja.png ausente — card gerado sem mascote.`);
  }

  // 4) compoe tudo
  const final = await sharp(arte).composite(overlays).png().toBuffer();

  const out = path.join(pastaSaida, `${peca.nome_arquivo}.png`);
  fs.mkdirSync(pastaSaida, { recursive: true });
  fs.writeFileSync(out, final);
  console.log(`  OK -> ${out}`);
}

// ---------- Main ----------
async function main() {
  const planoPath = process.argv[2];
  if (!planoPath) { console.error("Uso: node gerar-cards.js <plano-lote.json>"); process.exit(1); }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error("ERRO: defina GEMINI_API_KEY no ambiente (.env)."); process.exit(1); }

  const plano = JSON.parse(fs.readFileSync(planoPath, "utf8"));
  const modelo = plano.modelo || "gemini-2.5-flash-image";
  const pastaSaida = plano.pasta_saida || "./saida";
  const ai = new GoogleGenAI({ apiKey });

  console.log(`Lote: ${plano.lote} | modelo: ${modelo} | ${plano.pecas.length} pecas`);

  // Validacao de nomes (falha cedo se faltar campo)
  for (const p of plano.pecas) {
    if (!p.nome_arquivo || !p.dimensao) {
      console.error(`ERRO: peca ${p.id} sem nome_arquivo ou dimensao.`); process.exit(1);
    }
  }

  for (const peca of plano.pecas) {
    console.log(`Peca ${peca.id} (${peca.plataforma}/${peca.tipo}, ${peca.dimensao.w}x${peca.dimensao.h})`);
    await comporPeca(ai, peca, modelo, pastaSaida);
  }
  console.log("Concluido.");
}

main().catch(e => { console.error(e); process.exit(1); });
