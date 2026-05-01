require('dotenv').config()

const http = require('http')
const { spawn } = require('child_process')
const { cleanupOldPrints } = require('./services/storageCleanupService')

const port = Number(process.env.ROBOT_API_PORT || 3001)
const token = process.env.ROBOT_API_TOKEN
const retentionDays = Number(process.env.PRINT_RETENTION_DAYS || 30)

let running = false
let lastRun = null
let lastExitCode = null

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

function runRobot() {
  running = true
  lastRun = new Date().toISOString()
  lastExitCode = null

  const child = spawn(process.execPath, ['index.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env
  })

  child.on('exit', code => {
    running = false
    lastExitCode = code
    console.log(`Execução do robô finalizada com código ${code}`)
  })
}

async function runCleanup() {
  try {
    const result = await cleanupOldPrints(retentionDays)
    console.log(`Limpeza de prints: ${result.removedCount} arquivo(s) removido(s).`)
  } catch (error) {
    console.error('Falha na limpeza automática de prints:', error.message)
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  if (req.url === '/health' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, running, lastRun, lastExitCode })
    return
  }

  if (req.url === '/run' && req.method === 'POST') {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { ok: false, message: 'Não autorizado.' })
      return
    }

    if (running) {
      sendJson(res, 409, { ok: false, message: 'O robô já está em execução.' })
      return
    }

    await runCleanup()
    runRobot()
    sendJson(res, 202, { ok: true, message: 'Execução iniciada.', lastRun })
    return
  }

  if (req.url === '/cleanup-prints' && req.method === 'POST') {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { ok: false, message: 'Não autorizado.' })
      return
    }

    const result = await cleanupOldPrints(retentionDays)
    sendJson(res, 200, { ok: true, ...result })
    return
  }

  sendJson(res, 404, { ok: false, message: 'Endpoint não encontrado.' })
})

server.listen(port, () => {
  console.log(`API do RoboTarefas ouvindo na porta ${port}`)
  if (!token) console.warn('ROBOT_API_TOKEN não configurado. Endpoints protegidos não funcionarão.')
  runCleanup()
  setInterval(runCleanup, 24 * 60 * 60 * 1000)
})
