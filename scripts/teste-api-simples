# No seu terminal local, crie um arquivo test-api-simple.js:
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

console.log("API Key presente:", !!process.env.ANTHROPIC_API_KEY);
console.log("Primeiros caracteres:", process.env.ANTHROPIC_API_KEY.substring(0, 10));

client.messages
  .create({
    model: "claude-opus-4.6",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: "Olá! Você consegue me responder?",
      },
    ],
  })
  .then((response) => {
    console.log("✅ Sucesso!");
    console.log("Resposta:", response.content[0].text);
  })
  .catch((error) => {
    console.log("❌ Erro:", error.message);
    console.log("Tipo:", error.code || error.status);
  });
