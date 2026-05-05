import { EC2Client, StartInstancesCommand } from '@aws-sdk/client-ec2'

function getRequiredEnv() {
  const required = [
    'ROBOT_API_URL',
    'ROBOT_API_TOKEN',
    'AWS_INSTANCE_ID',
    'MY_AWS_ACCESS_KEY_ID',
    'MY_AWS_SECRET_ACCESS_KEY'
  ]
  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    return {
      ok: false,
      message: `Configurações incompletas na Vercel: ${missing.join(', ')}`
    }
  }

  return {
    ok: true,
    apiUrl: process.env.ROBOT_API_URL,
    apiToken: process.env.ROBOT_API_TOKEN,
    instanceId: process.env.AWS_INSTANCE_ID,
    region: process.env.MY_AWS_REGION || 'sa-east-1',
    accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY
  }
}

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === 'object') return req.body

  try {
    return JSON.parse(req.body)
  } catch {
    return {}
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Método não permitido.' })
    return
  }

  const { action, autoShutdown } = parseBody(req)
  const env = getRequiredEnv()

  if (!env.ok) {
    res.status(500).json(env)
    return
  }

  const { apiUrl, apiToken, instanceId } = env

  try {
    if (action === 'start') {
      const ec2 = new EC2Client({
        region: env.region,
        credentials: {
          accessKeyId: env.accessKeyId,
          secretAccessKey: env.secretAccessKey
        }
      })
      await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }))
      res.status(200).json({ ok: true, status: 'starting' })
      return
    }

    if (action === 'health') {
      try {
        const response = await fetch(`${apiUrl.replace(/\/$/, '')}/health`, {
          signal: AbortSignal.timeout(5000)
        })
        const payload = await response.json()
        res.status(200).json({ ok: true, ...payload })
      } catch {
        res.status(200).json({ ok: false, status: 'offline' })
      }
      return
    }

    if (action === 'run') {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ autoShutdown }),
        signal: AbortSignal.timeout(8000)
      })
      const payload = await response.json()
      res.status(response.status).json(payload)
      return
    }

    if (action === 'logs') {
      try {
        const response = await fetch(`${apiUrl.replace(/\/$/, '')}/logs`, {
          headers: { Authorization: `Bearer ${apiToken}` },
          signal: AbortSignal.timeout(8000)
        })
        const payload = await response.json()
        res.status(200).json(payload)
      } catch {
        res.status(200).json({ ok: false, logs: '' })
      }
      return
    }

    res.status(400).json({ ok: false, message: 'Ação inválida.' })
  } catch (error) {
    res.status(502).json({ ok: false, message: error.message })
  }
}
