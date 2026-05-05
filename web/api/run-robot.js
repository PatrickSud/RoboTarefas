const { EC2Client, StartInstancesCommand } = require('@aws-sdk/client-ec2')

const ec2 = new EC2Client({
  region: process.env.MY_AWS_REGION || 'sa-east-1',
  credentials: {
    accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY
  }
})

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Método não permitido.' })
    return
  }

  const { action, autoShutdown } = req.body || {}
  const apiUrl = process.env.ROBOT_API_URL
  const apiToken = process.env.ROBOT_API_TOKEN
  const instanceId = process.env.AWS_INSTANCE_ID

  if (!apiUrl || !apiToken || !instanceId) {
    res.status(500).json({ ok: false, message: 'Configurações incompletas.' })
    return
  }

  try {
    if (action === 'start') {
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
