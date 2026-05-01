const { EC2Client, StartInstancesCommand } = require('@aws-sdk/client-ec2')

const ec2 = new EC2Client({
  region: process.env.MY_AWS_REGION || 'sa-east-1',
  credentials: {
    accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY
  }
})

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, message: 'Método não permitido.' })
    }
  }

  const { action } = JSON.parse(event.body || '{}')
  const apiUrl = process.env.ROBOT_API_URL
  const apiToken = process.env.ROBOT_API_TOKEN
  const instanceId = process.env.AWS_INSTANCE_ID

  if (!apiUrl || !apiToken || !instanceId) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, message: 'Configurações incompletas.' })
    }
  }

  try {
    // AÇÃO 1: Ligar a instância (rápido)
    if (action === 'start') {
      await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }))
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, status: 'starting' })
      }
    }

    // AÇÃO 2: Verificar se a API já subiu (rápido)
    if (action === 'health') {
      try {
        const res = await fetch(`${apiUrl.replace(/\/$/, '')}/health`, {
          signal: AbortSignal.timeout(5000)
        })
        const data = await res.json()
        return { statusCode: 200, body: JSON.stringify({ ok: true, ...data }) }
      } catch (e) {
        return {
          statusCode: 200,
          body: JSON.stringify({ ok: false, status: 'offline' })
        }
      }
    }

    // AÇÃO 3: Disparar o robô (rápido - o server.js responde 202 imediatamente)
    if (action === 'run') {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(8000)
      })
      const payload = await response.json()
      return { statusCode: response.status, body: JSON.stringify(payload) }
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ ok: false, message: 'Ação inválida.' })
    }
  } catch (error) {
    return {
      statusCode: 502,
      body: JSON.stringify({ ok: false, message: error.message })
    }
  }
}
