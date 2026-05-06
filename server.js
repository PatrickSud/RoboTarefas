require('dotenv').config()

const http = require('http')
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const util = require('util')
const { createClient } = require('@supabase/supabase-js')
const { cleanupOldPrints } = require('./services/storageCleanupService')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// ==========================================
// LOGGER & SUPABASE SYNC
// ==========================================
let logBuffer = []
let flushTimer = null

async function flushLogs() {
  if (logBuffer.length === 0) return
  const logsToInsert = logBuffer.splice(0, logBuffer.length)
  try {
    const records = logsToInsert.map(msg => ({ message: msg }))
    await supabase.from('system_logs').insert(records)
  } catch (err) {
    originalConsoleError('Erro ao salvar logs no Supabase:', err.message)
  }
}

function queueLog(msg) {
  logBuffer.push(msg)
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null
      flushLogs()
    }, 2000)
  }
}

const originalConsoleLog = console.log
const originalConsoleError = console.error

function handleLog(text, isError = false) {
  if (isError) originalConsoleError(text)
  else originalConsoleLog(text)
  queueLog(text)
}

console.log = (...args) => handleLog(util.format(...args), false)
console.error = (...args) => handleLog(util.format(...args), true)
// ==========================================

const port = Number(process.env.ROBOT_API_PORT || 3001)
const token = process.env.ROBOT_API_TOKEN
const retentionDays = Number(process.env.PRINT_RETENTION_DAYS || 7)
const idleTimeoutMin = Number(process.env.IDLE_TIMEOUT_MIN || 10)

let running = false
let lastRun = null
let lastExitCode = null
let idleTimer = null
let autoRunTimer = null
let shutdownEnabled = process.env.AUTO_SHUTDOWN === 'true'

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
  if (shutdownEnabled && !running) {
    console.log(
      `Timer de inatividade iniciado: ${idleTimeoutMin} minutos para desligar...`
    )
    idleTimer = setTimeout(
      () => {
        console.log('Inatividade detectada. Desligando a máquina...')
        spawn('shutdown', ['/s', '/t', '60'])
      },
      idleTimeoutMin * 60 * 1000
    )
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  })
  res.end(JSON.stringify(payload))
}

function isAuthorized(req) {
  if (!token) return false
  const authHeader = req.headers.authorization || ''
  return authHeader === `Bearer ${token}`
}

function unauthorizedMessage(req) {
  if (!token) {
    return 'Não autorizado: ROBOT_API_TOKEN não está configurado na AWS.'
  }

  const authHeader = req.headers.authorization || ''
  if (!authHeader) {
    return 'Não autorizado: cabeçalho Authorization não foi recebido.'
  }

  return 'Não autorizado: ROBOT_API_TOKEN da AWS é diferente do token configurado no Netlify.'
}

function runRobot(shouldShutdown = process.env.AUTO_SHUTDOWN === 'true', isManual = false) {
  shutdownEnabled = shouldShutdown
  running = true
  lastRun = new Date().toISOString()
  lastExitCode = null
  console.log(
    `Desligamento automático: ${shouldShutdown ? 'ATIVO' : 'INATIVO'} | Execução Manual: ${isManual}`
  )

  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, IS_MANUAL_RUN: String(isManual) }
  })

  child.stdout.on('data', data => {
    const lines = data.toString().split('\n')
    lines.forEach(line => {
      if (line.trim()) handleLog(line.trim(), false)
    })
  })

  child.stderr.on('data', data => {
    const lines = data.toString().split('\n')
    lines.forEach(line => {
      if (line.trim()) handleLog(line.trim(), true)
    })
  })

  child.on('exit', async code => {
    running = false
    lastExitCode = code
    console.log(`Execução do robô finalizada com código ${code}`)

    if (shouldShutdown) {
      console.log('AUTO_SHUTDOWN ativo. Desligando a máquina em 60 segundos...')
      await flushLogs()
      await runCleanup()
      spawn('shutdown', ['/s', '/t', '60'])
    } else {
      await flushLogs()
      await runCleanup()
      resetIdleTimer()
    }
  })
}

async function runCleanup() {
  try {
    const result = await cleanupOldPrints(retentionDays)
    console.log(`Limpeza de prints: ${result.removedCount} arquivo(s) removido(s).`)

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - retentionDays);
    const { error: logError } = await supabase.from('system_logs').delete().lt('created_at', dateLimit.toISOString());
    if (logError) console.error('Erro ao limpar logs antigos do Supabase:', logError.message);
    else console.log(`Limpeza de logs antigos do Supabase concluída (retenção: ${retentionDays} dias).`);

    const { data: cleanedRows, error: historyError } = await supabase.rpc('cleanup_old_run_results', { keep_count: 30 });
    if (historyError) console.error('Erro ao limpar histórico de execuções:', historyError.message);
    else console.log(`Limpeza de histórico de execuções concluída: ${cleanedRows ?? 0} registro(s) removido(s) (mantendo 30 por conta).`);

    await syncMonthlyWithdrawals();

  } catch (error) {
    console.error('Falha na limpeza automática:', error.message)
  }
}

async function syncMonthlyWithdrawals() {
  console.log('Iniciando sincronização de saques mensais...');
  try {
    const [{ data: accounts }, { data: results }] = await Promise.all([
      supabase.from('accounts').select('*'),
      supabase.from('account_run_results').select('*').order('executed_at', { ascending: true })
    ]);

    if (!results || results.length === 0) return;

    const historyByAccount = new Map();
    for (const result of results) {
      const key = result.account_id ? `account:${result.account_id}` : null;
      if (!key) continue; 
      if (!historyByAccount.has(key)) historyByAccount.set(key, []);
      historyByAccount.get(key).push(result);
    }

    const monthlyData = [];

    for (const account of accounts || []) {
      const key = `account:${account.id}`;
      const history = historyByAccount.get(key) || [];
      if (history.length < 2) continue;

      const rate = account.exchange_rate || 1;
      const fee = account.withdrawal_fee || 0;

      for (let i = 1; i < history.length; i++) {
        const prev = history[i-1];
        const curr = history[i];
        
        const prevBal = parseBalance(prev.balance) * rate;
        const currBal = parseBalance(curr.balance) * rate;

        if (prevBal > 0 && currBal < prevBal) {
          const amount = prevBal - currBal;
          const date = new Date(curr.executed_at);
          const year = date.getFullYear();
          const month = date.getMonth() + 1;

          const monthKey = `${year}-${month}-${key}`;
          let entry = monthlyData.find(d => d.monthKey === monthKey);
          if (!entry) {
            entry = { 
              monthKey, year, month, 
              account_key: key, 
              account_name: account.name, 
              platform: account.platform,
              total_gross: 0, 
              total_net: 0, 
              withdrawal_count: 0 
            };
            monthlyData.push(entry);
          }
          entry.total_gross += amount;
          entry.total_net += amount * (1 - fee / 100);
          entry.withdrawal_count += 1;
        }
      }
    }

    for (const data of monthlyData) {
      const { monthKey, ...payload } = data;
      await supabase.from('monthly_withdrawals').upsert(payload, { onConflict: 'year,month,account_key' });
    }

    console.log('Sincronização de saques mensais concluída.');
  } catch (err) {
    console.error('Erro na sincronização de saques mensais:', err.message);
  }
}

function parseBalance(value) {
  const normalized = String(value ?? '0')
    .replace(/[^\d,.-]/g, '')
    .replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  if (req.url === '/health' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      running,
      lastRun,
      lastExitCode,
      tokenConfigured: Boolean(token)
    })
    return
  }

  if (req.url === '/run' && req.method === 'POST') {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { ok: false, message: unauthorizedMessage(req) })
      return
    }

    if (running) {
      sendJson(res, 409, { ok: false, message: 'O robô já está em execução.' })
      return
    }

    let body = ''
    for await (const chunk of req) body += chunk
    const { autoShutdown: bodyShutdown, isManual } = JSON.parse(body || '{}')
    const shouldShutdown =
      bodyShutdown !== undefined
        ? bodyShutdown
        : process.env.AUTO_SHUTDOWN === 'true'

    if (idleTimer) clearTimeout(idleTimer)
    if (autoRunTimer) {
      clearTimeout(autoRunTimer)
      autoRunTimer = null
    }
    
    await runCleanup()
    runRobot(shouldShutdown, isManual === true)
    sendJson(res, 202, { ok: true, message: 'Execução iniciada.', lastRun })
    return
  }

  if (req.url === '/cleanup-prints' && req.method === 'POST') {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { ok: false, message: unauthorizedMessage(req) })
      return
    }

    const result = await cleanupOldPrints(retentionDays)
    sendJson(res, 200, { ok: true, ...result })
    return
  }

  if (req.url === '/logs' && req.method === 'GET') {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { ok: false, message: unauthorizedMessage(req) })
      return
    }
    try {
      const logPath = path.join(__dirname, 'log_sistema.txt')
      const content = fs.existsSync(logPath)
        ? fs.readFileSync(logPath, 'utf8')
        : ''
      const lines = content.split('\n')
      const lastLines = lines.slice(-300).join('\n')
      sendJson(res, 200, { ok: true, logs: lastLines })
    } catch (e) {
      sendJson(res, 200, { ok: true, logs: '(Nenhum log disponível)' })
    }
    return
  }

  sendJson(res, 404, { ok: false, message: 'Endpoint não encontrado.' })
})

server.listen(port, () => {
  console.log(`API do RoboTarefas ouvindo na porta ${port}`)
  if (!token)
    console.warn(
      'ROBOT_API_TOKEN não configurado. Endpoints protegidos não funcionarão.'
    )
  runCleanup()
  resetIdleTimer()
  setInterval(runCleanup, 24 * 60 * 60 * 1000)
  
  // Inicia automaticamente o robô se nenhuma requisição /run for feita em 30 segundos
  autoRunTimer = setTimeout(() => {
    if (!running) {
      console.log('Iniciando robô automaticamente após boot...')
      runRobot(process.env.AUTO_SHUTDOWN === 'true', false)
    }
  }, 30000)
})
