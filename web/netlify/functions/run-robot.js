const {
  EC2Client,
  StartInstancesCommand,
  DescribeInstancesCommand
} = require('@aws-sdk/client-ec2')

const ec2 = new EC2Client({
  region: process.env.MY_AWS_REGION || 'sa-east-1',
  credentials: {
    accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY
  }
})

async function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`)
      if (res.ok) return true
    } catch (e) {
      // Ignora erro de conexão enquanto espera o boot
    }
    await new Promise(r => setTimeout(r, 5000))
  }
  return false
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, message: 'Método não permitido.' })
    }
  }

  const apiUrl = process.env.ROBOT_API_URL
  const apiToken = process.env.ROBOT_API_TOKEN
  const instanceId = process.env.AWS_INSTANCE_ID

  if (!apiUrl || !apiToken || !instanceId) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        message: 'Configurações de API ou AWS incompletas no Netlify.'
      })
    }
  }

  try {
    // 1. Tenta ligar a instância
    console.log(`Iniciando instância ${instanceId}...`)
    await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }))

    // 2. Aguarda o servidor ficar pronto (boot + API start)
    console.log('Aguardando servidor ficar online...')
    const isOnline = await waitForServer(apiUrl.replace(/\/$/, ''))

    if (!isOnline) {
      return {
        statusCode: 504,
        body: JSON.stringify({
          ok: false,
          message: 'O servidor AWS demorou muito para ligar.'
        })
      }
    }

    // 3. Dispara o robô
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    })

    const payload = await response.json()
    return {
      statusCode: response.status,
      body: JSON.stringify(payload)
    }
  } catch (error) {
    return {
      statusCode: 502,
      body: JSON.stringify({
        ok: false,
        message: `Falha no processo: ${error.message}`
      })
    }
  }
}
