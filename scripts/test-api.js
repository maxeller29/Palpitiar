const Anthropic = require('@anthropic-ai/sdk');

console.log('🔍 Testando Claude API...');
console.log('API Key presente:', !!process.env.ANTHROPIC_API_KEY);
console.log('API Key primeiros caracteres:', process.env.ANTHROPIC_API_KEY?.substring(0, 20) + '...');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function testar() {
  try {
    console.log('\n📤 Enviando requisição para Claude...');
    
    const message = await client.messages.create({
      model: "claude-opus-4.6",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: "Diga 'funcionando!' em uma palavra."
        }
      ],
    });

    console.log('✅ Sucesso!');
    console.log('Resposta:', message.content[0].text);
  } catch (erro) {
    console.error('❌ Erro:', erro.message);
    console.error('Detalhes:', erro);
  }
}

testar();
