import { EC2Client, StartInstancesCommand } from '@aws-sdk/client-ec2'
import {
  SchedulerClient,
  GetScheduleCommand,
  UpdateScheduleCommand
} from '@aws-sdk/client-scheduler'

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

function describeFetchError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return 'Timeout ao conectar na API do robô. Verifique se server.js iniciou na AWS, se a porta está liberada e se ROBOT_API_URL aponta para o IP/endereço correto.'
  }

  if (error?.cause?.code) {
    return `Falha ao conectar na API do robô (${error.cause.code}). Verifique ROBOT_API_URL, firewall/security group e se npm run api está iniciando no boot da AWS.`
  }

  return error?.message || 'Falha desconhecida ao conectar na API do robô.'
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
      } catch (error) {
        res.status(200).json({
          ok: false,
          status: 'offline',
          message: describeFetchError(error)
        })
      }
      return
    }

    if (action === 'status') {
      const status = {
        ok: false,
        status: 'offline',
        logs: ''
      }

      try {
        const healthResponse = await fetch(
          `${apiUrl.replace(/\/$/, '')}/health`,
          {
            signal: AbortSignal.timeout(5000)
          }
        )
        const healthPayload = await healthResponse.json()
        Object.assign(status, {
          ok: Boolean(healthPayload.ok),
          ...healthPayload
        })
      } catch (error) {
        status.ok = false
        status.message = describeFetchError(error)
      }

      if (status.ok) {
        try {
          const logsResponse = await fetch(
            `${apiUrl.replace(/\/$/, '')}/logs`,
            {
              headers: { Authorization: `Bearer ${apiToken}` },
              signal: AbortSignal.timeout(8000)
            }
          )
          const logsPayload = await logsResponse.json()
          status.logs = logsPayload.logs || ''
        } catch (error) {
          status.logs = ''
          status.logsMessage = describeFetchError(error)
        }
      }

      res.status(200).json(status)
      return
    }

    if (action === 'run') {
      const { autoShutdown, isManual } = parseBody(req)
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ autoShutdown, isManual }),
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
      } catch (error) {
        res
          .status(200)
          .json({ ok: false, logs: '', message: describeFetchError(error) })
      }
      return
    }

    if (action === 'get-schedule') {
      const scheduler = new SchedulerClient({
        region: env.region,
        credentials: {
          accessKeyId: env.accessKeyId,
          secretAccessKey: env.secretAccessKey
        }
      })

      const scheduleName =
        process.env.EVENTBRIDGE_SCHEDULE_NAME || 'Ligar-Robo-Tarefas'
      const scheduleGroup = process.env.EVENTBRIDGE_SCHEDULE_GROUP || 'default'

      const schedule = await scheduler.send(
        new GetScheduleCommand({
          Name: scheduleName,
          GroupName: scheduleGroup
        })
      )

      const cronExpr = schedule.ScheduleExpression || ''
      const cronMatch = cronExpr.match(/cron\((\d+)\s+(\d+)/)
      const hour = cronMatch ? parseInt(cronMatch[2]) : null
      const minute = cronMatch ? parseInt(cronMatch[1]) : 0
      const enabled = schedule.State === 'ENABLED'

      res.status(200).json({
        ok: true,
        enabled,
        hour,
        minute,
        expression: cronExpr,
        timezone: schedule.ScheduleExpressionTimezone || ''
      })
      return
    }

    if (action === 'update-schedule') {
      const { enabled: newEnabled, hour: newHour } = parseBody(req)

      const scheduler = new SchedulerClient({
        region: env.region,
        credentials: {
          accessKeyId: env.accessKeyId,
          secretAccessKey: env.secretAccessKey
        }
      })

      const scheduleName =
        process.env.EVENTBRIDGE_SCHEDULE_NAME || 'Ligar-Robo-Tarefas'
      const scheduleGroup = process.env.EVENTBRIDGE_SCHEDULE_GROUP || 'default'

      const current = await scheduler.send(
        new GetScheduleCommand({
          Name: scheduleName,
          GroupName: scheduleGroup
        })
      )

      const updateParams = {
        Name: scheduleName,
        GroupName: scheduleGroup,
        FlexibleTimeWindow: current.FlexibleTimeWindow,
        Target: current.Target,
        ScheduleExpressionTimezone:
          current.ScheduleExpressionTimezone || 'America/Sao_Paulo',
        ScheduleExpression: current.ScheduleExpression,
        State: current.State
      }

      if (newEnabled !== undefined) {
        updateParams.State = newEnabled ? 'ENABLED' : 'DISABLED'
      }

      const { hours } = parseBody(req)

      if (hours !== undefined && Array.isArray(hours)) {
        if (hours.length === 0) {
          updateParams.State = 'DISABLED'
        } else {
          const tz = current.ScheduleExpressionTimezone || 'America/Sao_Paulo'
          const hoursString = hours.join(',')
          updateParams.ScheduleExpression = `cron(0 ${hoursString} * * ? *)`
          updateParams.ScheduleExpressionTimezone = tz
          updateParams.State = 'ENABLED'
        }
      } else if (newHour !== undefined && newHour !== null) {
        const tz = current.ScheduleExpressionTimezone || 'America/Sao_Paulo'
        updateParams.ScheduleExpression = `cron(0 ${newHour} * * ? *)`
        updateParams.ScheduleExpressionTimezone = tz
      }

      await scheduler.send(new UpdateScheduleCommand(updateParams))

      res.status(200).json({ ok: true, message: 'Agendamento atualizado.' })
      return
    }

    res.status(400).json({ ok: false, message: 'Ação inválida.' })
  } catch (error) {
    res.status(502).json({ ok: false, message: error.message })
  }
}
