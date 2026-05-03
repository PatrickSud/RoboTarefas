require('dotenv').config()
const https = require('https')

const apiKey = process.env.GOOGLE_AI_API_KEY
const model = process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash'

if (!apiKey) {
  console.error('❌ GOOGLE_AI_API_KEY não encontrada no .env')
  process.exit(1)
}

console.log(`🔑 Chave encontrada: ${apiKey.slice(0, 8)}...`)
console.log(`🤖 Modelo: ${model}`)
console.log('📡 Testando conexão com Google AI Studio...\n')

const body = JSON.stringify({
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Responda apenas: "Fallback IA funcionando!"' }]
    }
  ]
})

const req = https.request(
  {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  },
  res => {
    let data = ''
    res.on('data', chunk => {
      data += chunk
    })
    res.on('end', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        console.error(`❌ Erro HTTP ${res.statusCode}:`)
        try {
          const err = JSON.parse(data)
          console.error('   ', err.error?.message || data)
        } catch {
          console.error('   ', data)
        }
        process.exit(1)
      }

      try {
        const json = JSON.parse(data)
        const resposta = json?.candidates?.[0]?.content?.parts?.[0]?.text || ''
        console.log('✅ Gemini respondeu:', resposta.trim())
        console.log('\n🟢 Integração funcionando corretamente!')
      } catch (e) {
        console.error('❌ Falha ao parsear resposta:', e.message)
        console.error('   Resposta bruta:', data)
        process.exit(1)
      }
    })
  }
)

req.on('error', e => {
  console.error('❌ Erro de rede:', e.message)
  process.exit(1)
})

req.write(body)
req.end()
