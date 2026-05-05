const { createClient } = require('@supabase/supabase-js')

// Configuração do Supabase (Usando as variáveis já existentes no Netlify)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Função auxiliar para chamar a nossa própria function de execução do robô
async function triggerRobotExecution(apiUrl, apiToken, instanceId) {
  // Chamamos o endpoint do Robô diretamente na AWS para evitar timeouts em cascata no Netlify
  // 1. Liga a instância
  const { EC2Client, StartInstancesCommand } = require('@aws-sdk/client-ec2')
  const ec2 = new EC2Client({
    region: process.env.MY_AWS_REGION || 'sa-east-1',
    credentials: {
      accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY
    }
  })

  console.log(`[Scheduled] Ligando instância ${instanceId}...`)
  await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }))

  console.log('[Scheduled] Aguardando API da AWS ficar online...')
  const startTime = Date.now()
  let ready = false
  while (!ready && Date.now() - startTime < 420000) {
    await new Promise(r => setTimeout(r, 15000))
    try {
      const health = await fetch(`${apiUrl.replace(/\/$/, '')}/health`, {
        signal: AbortSignal.timeout(8000)
      })
      const data = await health.json()
      ready = Boolean(data.ok)
    } catch (e) {
      ready = false
    }
  }

  if (!ready) {
    throw new Error('API da AWS não ficou online dentro do tempo esperado.')
  }

  console.log('[Scheduled] Disparando execução do robô...')
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ autoShutdown: true }),
    signal: AbortSignal.timeout(10000)
  })
  const payload = await res.json()
  if (!res.ok) {
    throw new Error(
      payload.message || `Falha HTTP ${res.status} ao disparar robô.`
    )
  }

  return payload
}

export default async (req, context) => {
  const now = new Date()
  const brasiliaNow = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  )
  const brasiliaHour = brasiliaNow.getHours()
  const todayStr = brasiliaNow.toISOString().split('T')[0]

  console.log(
    `[Scheduled] Verificando agendamento. Hora atual (Brasília): ${brasiliaHour}:00`
  )

  try {
    const { data: config, error } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', 'schedule')
      .single()

    if (error || !config) {
      console.error('[Scheduled] Erro ao carregar configurações:', error)
      return
    }

    const { enabled, hour, last_run } = config.value

    if (!enabled) {
      console.log('[Scheduled] Agendamento desativado.')
      return
    }

    if (brasiliaHour < hour) {
      console.log(`[Scheduled] Ainda antes do horário agendado (${hour}:00).`)
      return
    }

    if (last_run === todayStr) {
      console.log('[Scheduled] Robô já foi executado hoje.')
      return
    }

    // Configurações da API
    const apiUrl = process.env.ROBOT_API_URL
    const apiToken = process.env.ROBOT_API_TOKEN
    const instanceId = process.env.AWS_INSTANCE_ID

    console.log('[Scheduled] Iniciando execução agendada...')
    if (!apiUrl || !apiToken || !instanceId) {
      throw new Error(
        'Variáveis ROBOT_API_URL, ROBOT_API_TOKEN ou AWS_INSTANCE_ID não configuradas no Netlify.'
      )
    }

    await triggerRobotExecution(apiUrl, apiToken, instanceId)

    // Atualiza o last_run para hoje
    await supabase
      .from('global_settings')
      .update({ value: { ...config.value, last_run: todayStr } })
      .eq('key', 'schedule')

    console.log('[Scheduled] Execução agendada concluída com sucesso.')

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    console.error('[Scheduled] Erro crítico na execução agendada:', err.message)
    return new Response(JSON.stringify({ ok: false, message: err.message }), {
      status: 500
    })
  }
}

export const config = {
  schedule: '*/15 * * * *'
}
