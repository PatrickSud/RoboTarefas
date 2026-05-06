require('dotenv').config()

// ==========================================
// 1. CONFIGURAÇÕES
// ==========================================
const configuracaoEmail = {
  usuario: process.env.EMAIL_USUARIO,
  senhaApp: process.env.EMAIL_SENHA_APP
}
const numeroAdminWhatsApp = process.env.WHATSAPP_ADMIN_ID
const healthcheckUrl = process.env.HEALTHCHECK_URL
const whatsappReadyTimeoutMs = Number(
  process.env.WHATSAPP_READY_TIMEOUT_MS || 60000
)
let automacaoIniciada = false

const { chromium } = require('playwright')
const nodemailer = require('nodemailer')
const { exec } = require('child_process')
const fs = require('fs')
const https = require('https')
const qrcode = require('qrcode')
const qrcodeTerminal = require('qrcode-terminal')
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const { buscarContasParaProcessar } = require('./services/accountService')
const { salvarResultadoConta } = require('./services/runResultService')
const { uploadPrintToStorage } = require('./services/storageService')
const { getSupabaseClient } = require('./services/supabaseClient')
const supabase = getSupabaseClient()
const googleAiApiKey = process.env.GOOGLE_AI_API_KEY

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }
})

client.on('qr', async qr => {
  qrcodeTerminal.generate(qr, { small: true })
  console.log('Novo QR Code recebido:', qr)
  console.log('Gerando imagem e enviando por e-mail...')

  try {
    // Salva o QR Code como arquivo local para consulta manual
    await qrcode.toFile('qrcode.png', qr)
    console.log('QR Code salvo localmente como qrcode.png')

    const qrBase64 = await qrcode.toDataURL(qr)
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: configuracaoEmail.usuario,
        pass: configuracaoEmail.senhaApp
      }
    })

    await transporter.sendMail({
      from: `"Robô de Tarefas (Aviso)" <${configuracaoEmail.usuario}>`,
      to: configuracaoEmail.usuario,
      subject: 'Aviso: WhatsApp Desconectado - Leia o QR Code',
      html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #d32f2f;">🚨 WhatsApp Desconectado!</h2>
                    <p>O robô perdeu a conexão com o WhatsApp ou a sessão expirou.</p>
                    <p>Por favor, <b>leia o QR Code abaixo</b> usando o WhatsApp no seu celular (Configurações > Aparelhos conectados):</p>
                    <div style="text-align: center; margin: 20px 0;">
                        <img src="cid:qrcode_whatsapp" alt="QR Code WhatsApp" style="width: 300px; border: 5px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,0.1);" />
                    </div>
                    <p style="font-size: 0.9em; color: #666;">Se você não conseguir ver a imagem acima, verifique o anexo deste e-mail ou o arquivo <code>qrcode.png</code> na pasta do robô.</p>
                    <hr />
                    <p style="font-size: 0.8em; color: #999;">Este é um aviso automático gerado pelo seu Robô de Tarefas.</p>
                </div>
            `,
      attachments: [
        {
          filename: 'qrcode.png',
          content: qrBase64.split('base64,')[1],
          encoding: 'base64',
          cid: 'qrcode_whatsapp'
        }
      ]
    })
    console.log('QR Code enviado por e-mail com sucesso.')
  } catch (err) {
    console.error('Falha ao gerar ou enviar o QR code:', err)
  }
})

async function iniciarAutomacao(motivo) {
  if (automacaoIniciada) return
  automacaoIniciada = true
  console.log(`[INFO] Iniciando automação (${motivo})...`)
  try {
    await executarAutomacao()
  } catch (err) {
    console.error('[ERRO] Erro na execução da automação:', err.message)
  }
}

client.on('ready', () => {
  console.log('Cliente WhatsApp está pronto!')
  iniciarAutomacao('WhatsApp pronto')
})

client.initialize()

// Timeout de segurança para iniciar mesmo que o WhatsApp demore/falhe
setTimeout(() => {
  iniciarAutomacao(
    `timeout de ${Math.round(whatsappReadyTimeoutMs / 1000)}s aguardando WhatsApp`
  )
}, whatsappReadyTimeoutMs)

function chamarGoogleAI(payload) {
  return new Promise((resolve, reject) => {
    if (!googleAiApiKey) {
      resolve(null)
      return
    }

    const body = JSON.stringify(payload)
    const model = process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash'
    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent?key=${googleAiApiKey}`,
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
            reject(new Error(`Google AI HTTP ${res.statusCode}: ${data}`))
            return
          }
          resolve(JSON.parse(data))
        })
      }
    )

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function fallbackInteligente(page, contexto, erroOriginal) {
  if (!googleAiApiKey) {
    console.log('Fallback IA desativado: GOOGLE_AI_API_KEY não configurada.')
    return false
  }

  try {
    console.log(`Fallback IA acionado: ${contexto}`)
    const screenshot = await page.screenshot({ fullPage: true, type: 'png' })
    const textoVisivel = await page.innerText('body').catch(() => '')
    const urlAtual = page.url()

    const instrucao =
      'Você controla um navegador Playwright em uma automação. Analise a tela e retorne somente JSON válido no formato {"actions":[...],"reason":"..."}. Ações permitidas: click_text com text, click_selector com selector, fill_selector com selector/value, goto com url, back, wait com ms. Use no máximo 3 ações.'

    const resposta = await chamarGoogleAI({
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${instrucao}\n\nContexto: ${contexto}\nErro: ${erroOriginal?.message || erroOriginal || 'sem erro'}\nURL atual: ${urlAtual}\nTexto visível:\n${textoVisivel.slice(0, 6000)}`
            },
            {
              inline_data: {
                mimeType: 'image/png',
                data: screenshot.toString('base64')
              }
            }
          ]
        }
      ]
    })

    const content = resposta?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const parsed = JSON.parse(
      content
        .replace(/^```json\s*/i, '')
        .replace(/```$/i, '')
        .trim()
    )
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.slice(0, 3)
      : []
    console.log(
      'Fallback IA sugestão:',
      parsed.reason || JSON.stringify(actions)
    )

    for (const action of actions) {
      if (action.type === 'click_text' && action.text) {
        await page
          .getByText(action.text, { exact: false })
          .first()
          .click({ timeout: 5000 })
      } else if (action.type === 'click_selector' && action.selector) {
        await page.locator(action.selector).first().click({ timeout: 5000 })
      } else if (action.type === 'fill_selector' && action.selector) {
        await page
          .locator(action.selector)
          .first()
          .fill(String(action.value || ''), { timeout: 5000 })
      } else if (action.type === 'goto' && action.url) {
        await page.goto(action.url, {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        })
      } else if (action.type === 'back') {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 })
      } else if (action.type === 'wait') {
        await page.waitForTimeout(Math.min(Number(action.ms) || 1000, 10000))
      }
      await page.waitForTimeout(1000)
    }

    return actions.length > 0
  } catch (erroFallback) {
    console.log('Fallback IA falhou:', erroFallback.message)
    return false
  }
}

// Captura erros fatais que não caíram no bloco try/catch
process.on('uncaughtException', async err => {
  console.error('\n🚨 ERRO FATAL IRRECUPERÁVEL DETECTADO 🚨\n', err)
  try {
    if (numeroAdminWhatsApp) {
      await client.sendMessage(
        numeroAdminWhatsApp,
        `🚨 *FALHA CRÍTICA NO SERVIDOR* 🚨\n\nO robô sofreu um erro fatal e foi encerrado abruptamente.\n\n*Detalhe técnico:*\n${err.message}`
      )
    }
  } catch (e) {}

  // Força o encerramento seguro após avisar
  setTimeout(() => process.exit(1), 5000)
})

// ==========================================
// 2. FUNÇÃO PRINCIPAL DO ROBÔ
// ==========================================
async function executarAutomacao() {
  let relatorioFinal = 'Relatório de Saldos das Contas:\n\n'
  const linhasRelatorioPorPlataforma = {}
  const dataHoje = new Date().toLocaleDateString('pt-BR')
  const saldosHoje = {}

  // NOVO: LÓGICA DE TESTE
  // Verifica se existe alguma conta marcada com 'testar: true'
  // Se existir, usa apenas as de teste. Se não existir, usa a lista original completa.
  const { contasParaProcessar, contasDeTeste } =
    await buscarContasParaProcessar()

  if (contasDeTeste.length > 0) {
    console.log(
      `\n⚠️ MODO DE TESTE ATIVADO: Executando apenas ${contasDeTeste.length} conta(s).\n`
    )
  }

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--autoplay-policy=no-user-gesture-required', // Força o vídeo a rodar sozinho
      '--disable-gpu', // Desativa a dependência de placa de vídeo do Windows
      '--mute-audio', // Muta o áudio para evitar bugs de drivers de som
      '--window-size=1280,720',
      '--lang=pt-BR' // Força idioma do navegador para Português do Brasil
    ]
  })

  for (const conta of contasParaProcessar) {
    console.log(`\n--- Iniciando conta: ${conta.nome} (${conta.telefone}) ---`)

    let tentativaAtual = 0
    const MAX_TENTATIVAS = 2

    while (tentativaAtual < MAX_TENTATIVAS) {
      tentativaAtual++
      if (tentativaAtual > 1)
        console.log(
          `\n⟳ Retentativa ${tentativaAtual}/${MAX_TENTATIVAS} para ${conta.nome}...`
        )

      const context = await browser.newContext({
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo'
      })
      const page = await context.newPage()
      let _retry = false

      try {
        let contadorTarefas = 0
        let carteiraReceita = '0.00'
        let caminhoPrintSucesso = ''

        if (conta.plataforma === 'VLM') {
          console.log('Acessando tela de login VLM...')
          await page.goto('https://vlm7.com/#/login')
          await page.waitForTimeout(3000)

          console.log('Preenchendo credenciais VLM...')
          await page.fill(
            "input[placeholder='Por favor, digite seu número de telefone']",
            conta.telefone
          )
          await page.fill(
            "input[placeholder='Por favor, digite a senha de login']",
            conta.senha
          )
          await page.waitForTimeout(1000)

          await page.locator('button:has-text("Fazer login agora")').click()
          console.log('Comando de Entrar enviado.')
          await page.waitForTimeout(5000)

          console.log('Lidando com comunicados...')
          try {
            // Tenta seletores comuns de botão fechar (x) em plataformas Vue/Vant
            await page
              .locator('.close, .van-icon-cross')
              .first()
              .click({ timeout: 3000 })
            await page.waitForTimeout(1000)
          } catch (e) {}

          // Caso o robô tenha clicado no fundo (na imagem da campanha) por acidente e abrido o artigo:
          if (
            page.url().includes('/notice') ||
            page.url().includes('/article')
          ) {
            console.log(
              'Navegou para o artigo acidentalmente. Voltando para Home...'
            )
            await page.goto('https://vlm7.com/#/home')
            await page.waitForTimeout(3000)
          }

          console.log('Iniciando rotina de tarefas VLM...')
          // Rola um pouco a página para encontrar o botão
          try {
            await page.evaluate(() => window.scrollBy(0, 500))
            await page.waitForTimeout(1000)
          } catch (e) {}

          await page.getByText('Imagens Mais Recentes').first().click()
          await page.waitForTimeout(3000)

          let temTarefa = true
          let falhasConsecutivas = 0

          while (temTarefa) {
            let botaoEnviar
            try {
              botaoEnviar = page
                .locator('button:has-text("Ver classificação")')
                .first()
              await botaoEnviar.waitFor({ state: 'visible', timeout: 5000 })
            } catch (e) {
              console.log(
                `Fim natural das tarefas VLM. Total concluído: ${contadorTarefas}`
              )
              temTarefa = false
              falhasConsecutivas = 0
              break
            }

            try {
              console.log(`Processando tarefa #${contadorTarefas + 1}...`)
              await botaoEnviar.click()

              console.log(
                'Aguardando contagem regressiva de 8s + renderização...'
              )
              await page.waitForTimeout(15000) // 8s da VLM + margem

              const btnConfirmar = page
                .locator('button:has-text("Confirmar"):visible')
                .last()
              await btnConfirmar.waitFor({ state: 'visible', timeout: 2000 })
              await btnConfirmar.click({ force: true })
              await page.waitForTimeout(1500)

              // Verifica qual mensagem apareceu após confirmar as estrelas
              try {
                const msgLimite = page
                  .locator('text="O número de vezes de hoje já foi usado"')
                  .first()
                if (await msgLimite.isVisible()) {
                  console.log(
                    `Fim das tarefas VLM atingido (Limite diário). Total concluído: ${contadorTarefas}`
                  )
                  temTarefa = false
                  falhasConsecutivas = 0
                  // Fecha o popup do limite e volta para a lista antes de tirar o print
                  try {
                    await page
                      .locator('button:has-text("Confirmar"):visible')
                      .last()
                      .click({ timeout: 2000 })
                  } catch (e) {}
                  try {
                    await page
                      .locator('.van-nav-bar__left, i.van-icon-arrow-left')
                      .first()
                      .click({ timeout: 3000 })
                  } catch (e) {
                    await page.goBack()
                  }
                  await page.waitForTimeout(2000)
                  break
                }
              } catch (e) {}

              // Se não foi limite, segue o jogo para a segunda confirmação de sucesso
              try {
                // Aguarda a confirmação de que o valor foi recebido
                const lblSucesso = page.getByText('Valor recebido com sucesso')
                await lblSucesso.waitFor({ state: 'visible', timeout: 5000 })

                // Clica no botão Confirmar correspondente
                const btnSucesso = page.getByRole('button', {
                  name: 'Confirmar'
                })
                await btnSucesso.click({ force: true })
                await page.waitForTimeout(1000)
              } catch (e) {
                // Ignora se a segunda tela de confirmação não aparecer
              }

              try {
                // Verifica se "Ver classificação" já está na tela. Se estiver, significa que o Confirmar já nos trouxe de volta!
                const btnLista = page
                  .locator('button:has-text("Ver classificação")')
                  .first()
                if (!(await btnLista.isVisible())) {
                  await page.locator('i').first().click({ timeout: 3000 })
                }
              } catch (e) {
                // Falha silenciosa
              }
              await page.waitForTimeout(3000)

              // Sistema de recuperação: se voltou demais e caiu na Home, clica de volta para a lista
              try {
                const btnListaFinal = page
                  .locator('button:has-text("Ver classificação")')
                  .first()
                if (!(await btnListaFinal.isVisible())) {
                  const btnRecentes = page
                    .getByText('Imagens Mais Recentes')
                    .first()
                  if (await btnRecentes.isVisible()) {
                    console.log('Garantindo abertura da lista de tarefas...')
                    await btnRecentes.click()
                    await page.waitForTimeout(2000)
                  }
                }
              } catch (e) {}

              contadorTarefas++
              falhasConsecutivas = 0
              console.log(
                `  -> Tarefa #${contadorTarefas} concluída com sucesso!`
              )
            } catch (e) {
              falhasConsecutivas++
              console.log(
                `⚠️ Falha na execução da tarefa. Tentativa ${falhasConsecutivas} de 2.`
              )

              if (falhasConsecutivas >= 2) {
                throw new Error(
                  'Falha ao concluir a tarefa VLM após 2 tentativas. Travamento detectado.'
                )
              } else {
                console.log('Forçando retorno para tentar novamente...')
                await page.goto('https://vlm7.com/')
                await page.waitForTimeout(4000)
                try {
                  await page
                    .locator('.close, .van-icon-cross')
                    .first()
                    .click({ timeout: 2000 })
                } catch (err) {}

                if (
                  page.url().includes('/notice') ||
                  page.url().includes('/article')
                ) {
                  await page.goto('https://vlm7.com/#/home')
                  await page.waitForTimeout(3000)
                }

                try {
                  await page.evaluate(() => window.scrollBy(0, 500))
                  await page.waitForTimeout(1000)
                } catch (e) {}
                await page.click('div:has-text("Imagens Mais Recentes")')
                await page.waitForTimeout(3000)
              }
            }
          }

          console.log('Navegando para perfil VLM para capturar saldo...')
          await page.goto('https://vlm7.com/#/user')
          await page.waitForTimeout(3000)

          const locSaldo = page.locator(
            'div:has(p:text-is("Receita total(R$)")) > p:first-child'
          )
          await locSaldo.waitFor({ state: 'visible', timeout: 10000 })

          const carteiraTexto = await locSaldo.innerText()
          carteiraReceita = carteiraTexto.replace(/[^0-9.,]/g, '').trim()
          console.log(`Saldo capturado VLM: ${carteiraReceita}`)

          try {
            caminhoPrintSucesso = `sucesso_${conta.nome}.png`
            await page.screenshot({ path: caminhoPrintSucesso, fullPage: true })
            console.log(`Print de sucesso salvo como ${caminhoPrintSucesso}`)
          } catch (e) {
            caminhoPrintSucesso = ''
          }
        } else if (conta.plataforma === 'Signet') {
          // FLUXO SIGNET (NOVA PLATAFORMA)
          console.log('Acessando tela de login Signet...')
          await page.goto('https://m.signet-jewelers-br.top/#/login')
          await page.waitForTimeout(3000)

          console.log('Tentando preencher credenciais Signet...')
          try {
            // Tenta preencher os dois primeiros inputs da tela (geralmente telefone e senha nessas plataformas)
            const inputs = page.locator('input')
            if ((await inputs.count()) >= 2) {
              await inputs.nth(0).fill(conta.telefone)
              await inputs.nth(1).fill(conta.senha)
            }
            await page.waitForTimeout(1000)

            // Tenta clicar no botão de login
            const botoes = page.locator('button')
            if ((await botoes.count()) > 0) {
              await botoes.first().click()
            }
            await page.waitForTimeout(3000)
          } catch (e) {
            console.log(
              'Aviso: Não foi possível preencher o login automaticamente. Faça manualmente.'
            )
          }

          // Fechar comunicados
          console.log('Verificando comunicados...')
          try {
            const btnConfirmar = page.getByRole('button', { name: 'Confirmar' })
            await btnConfirmar.waitFor({ state: 'visible', timeout: 5000 })
            await btnConfirmar.click()
            await page.waitForTimeout(1000)
          } catch (e) {
            console.log('Nenhum comunicado encontrado.')
          }

          // Check-in Diário (Signet)
          console.log('Acessando tela de Check-in diário Signet...')
          try {
            await page.goto('https://m.signet-jewelers-br.top/#/SignIn')
            await page.waitForTimeout(3000)

            // O botão "Entrar" é uma <div> estilizada com fundo preto.
            // Identificamos que existem dois "Entrar" na tela: o título no topo e o botão real no meio.
            // O botão real possui a classe de fundo preto (bg-[#1A1A1A]) quando está ativo.
            console.log(
              "Procurando botão de Check-in 'Entrar' com estilo específico..."
            )

            const btnReal = page
              .locator('div.bg-\\[\\#1A1A1A\\]:has-text("Entrar")')
              .first()

            if (await btnReal.isVisible({ timeout: 5000 })) {
              console.log("Botão 'Entrar' encontrado. Clicando...")
              await btnReal.click()
              await page.waitForTimeout(3000)

              // Verifica se o botão mudou para cinza (bg-[#c2c2c2]), confirmando o sucesso
              const btnConfirmado = page
                .locator('div.bg-\\[\\#c2c2c2\\]:has-text("Entrar")')
                .first()
              if (await btnConfirmado.isVisible({ timeout: 5000 })) {
                contadorTarefas++
                console.log(
                  '  -> Check-in Signet realizado e confirmado com sucesso!'
                )
              } else {
                console.log(
                  '  -> Botão clicado, mas confirmação visual (mudança para cinza) não detectada.'
                )
                // Incrementamos mesmo assim pois o clique foi dado no botão correto
                contadorTarefas++
              }
            } else {
              // Verifica se o botão já está cinza (check-in já feito hoje)
              const btnJaFeito = page
                .locator('div.bg-\\[\\#c2c2c2\\]:has-text("Entrar")')
                .first()
              if (await btnJaFeito.isVisible({ timeout: 2000 })) {
                console.log(
                  '  -> Check-in Signet já havia sido realizado hoje (botão cinza).'
                )
              } else {
                console.log(
                  "  -> Botão 'Entrar' ativo não encontrado. Verificando se há diálogos de sucesso..."
                )
                try {
                  const btnOk = page
                    .getByRole('button', { name: /Ok|Confirmar|Sucesso/i })
                    .first()
                  if (await btnOk.isVisible({ timeout: 2000 })) {
                    await btnOk.click()
                    contadorTarefas++
                    console.log(
                      '  -> Check-in concluído via diálogo de confirmação.'
                    )
                  } else {
                    console.log('  -> Nenhum botão de check-in detectado.')
                  }
                } catch (err) {
                  console.log(
                    '  -> Falha ao procurar elementos alternativos de check-in.'
                  )
                }
              }
            }

            console.log('Voltando para a tela principal...')
            try {
              await page
                .locator('i.van-icon-arrow-left, .van-nav-bar__left')
                .first()
                .click({ timeout: 3000 })
            } catch (e) {
              await page.goBack()
            }
            await page.waitForTimeout(2000)
          } catch (e) {
            console.log('Aviso: Falha no check-in diário Signet:', e.message)
          }

          // Receber Renda (Tarefas)
          console.log('Indo para o menu de perfil...')
          try {
            await page
              .locator('div:nth-child(5) > .van-badge__wrapper > .w-24')
              .first()
              .click({ timeout: 5000 })
            await page.waitForTimeout(3000)

            console.log("Acessando 'Receber Renda'...")
            await page
              .getByText('Receber Renda')
              .first()
              .click({ timeout: 5000 })
            await page.waitForTimeout(3000)

            let recebendo = true
            while (recebendo) {
              try {
                const btnReceived = page
                  .getByRole('button', { name: 'Received' })
                  .first()
                await btnReceived.waitFor({ state: 'visible', timeout: 3000 })
                await btnReceived.click()
                contadorTarefas++
                console.log(
                  `  -> Renda #${contadorTarefas} recebida com sucesso!`
                )
                await page.waitForTimeout(2000)
              } catch (e) {
                console.log('Fim das rendas disponíveis.')
                recebendo = false
              }
            }

            console.log('Voltando para o perfil...')
            await page.locator('i').first().click({ timeout: 3000 })
            await page.waitForTimeout(3000)

            console.log('Capturando saldo...')
            try {
              const bodyText = await page.innerText('body')
              const match = bodyText.match(/([\d.,]+)\s*Carteira da Equipe/i)
              if (match && match[1]) {
                carteiraReceita = match[1]
              } else {
                const locSaldo = page
                  .locator(':has-text("Carteira da Equipe")')
                  .last()
                const texto = await locSaldo.innerText()
                carteiraReceita = texto.replace(/[^0-9.,]/g, '').trim()
              }
              console.log(`Saldo capturado Signet: ${carteiraReceita}`)
            } catch (e) {
              console.log('Não foi possível capturar o saldo:', e.message)
            }
          } catch (e) {
            console.log('Falha na rotina de perfil (Receber Renda).', e.message)
          }

          try {
            caminhoPrintSucesso = `sucesso_${conta.nome}.png`
            await page.screenshot({ path: caminhoPrintSucesso, fullPage: true })
            console.log(`Print de sucesso salvo como ${caminhoPrintSucesso}`)
          } catch (e) {
            caminhoPrintSucesso = ''
          }
        } else if (conta.plataforma === 'GKWind') {
          // FLUXO GK WIND
          console.log('Acessando tela de login GK Wind...')
          await page.goto('https://gkwindbr.com/login/')
          await page.waitForTimeout(3000)

          console.log('Preenchendo credenciais GK Wind...')
          try {
            const inputs = page.locator('input')
            if ((await inputs.count()) >= 2) {
              // Limpa os campos antes de preencher para evitar duplicação por autofill
              await inputs.nth(0).click()
              await page.keyboard.press('Control+A')
              await page.keyboard.press('Backspace')
              await inputs.nth(0).fill(conta.telefone)

              await inputs.nth(1).click()
              await page.keyboard.press('Control+A')
              await page.keyboard.press('Backspace')
              await inputs.nth(1).fill(conta.senha)
            }
            await page.waitForTimeout(1000)

            await page
              .getByRole('button', { name: 'Entrar' })
              .first()
              .click({ timeout: 5000 })
            await page.waitForTimeout(4000)

            // Verifica se houve erro de login
            const erroLogin = page.getByText(/E-mail ou senha inválidos/i)
            if (await erroLogin.isVisible({ timeout: 2000 })) {
              console.log(
                `🚨 Erro de login na GK Wind (${conta.nome}): E-mail ou senha inválidos.`
              )
              // Tenta fechar o modal de erro para não travar
              try {
                await page
                  .getByRole('button', { name: /Ok|Confirmar/i })
                  .click()
              } catch (e) {}
              continue // Pula para a próxima conta
            }
          } catch (e) {
            console.log('Aviso: Falha no login automático GK Wind:', e.message)
          }

          try {
            const btnSwitchLang = page.getByRole('button', {
              name: /Switch Language|Idioma|Language/i
            })
            const deveTrocarIdioma = await btnSwitchLang
              .isVisible({ timeout: 1500 })
              .catch(() => false)

            if (
              deveTrocarIdioma &&
              !(await page
                .getByText(/Check-in Diário|Saldo Total|Perfil/i)
                .first()
                .isVisible({ timeout: 1000 })
                .catch(() => false))
            ) {
              console.log('Tentando ajustar idioma GK Wind para Português...')
              await btnSwitchLang.click()
              await page.waitForTimeout(1000)
              await page
                .getByRole('option', {
                  name: /Português|Portugues|Portuguese/i
                })
                .first()
                .click({ timeout: 3000 })
              await page.waitForTimeout(3000)
              console.log('Clicando em Entrar após troca de idioma GK Wind...')
              try {
                await page
                  .getByRole('button', { name: /^Entrar$/i })
                  .first()
                  .click({ timeout: 5000 })
                await page.waitForTimeout(4000)
              } catch (e) {}
            }
          } catch (e) {
            console.log(
              'Aviso: Não foi possível ajustar idioma GK Wind, seguindo fluxo multilíngue:',
              e.message
            )
          }

          console.log('Aguardando comunicado de login...')
          try {
            // Clicando no botão de fechar do comunicado (X ou Fechar)
            // O botão geralmente é uma div ou botão com texto "Fechar" ou um ícone de fechar
            const btnFechar = page
              .locator(
                'button:has-text("Fechar"), .close-btn, [aria-label="Close"]'
              )
              .first()
            await btnFechar.waitFor({ state: 'visible', timeout: 8000 })
            await btnFechar.click()
            console.log('Comunicado fechado.')
            await page.waitForTimeout(1500)
          } catch (e) {
            console.log('Nenhum comunicado encontrado ou já fechado.')
          }

          // DEFESA: Se ele foi para uma página em branco ou artigo por clique acidental, nós forçamos a volta
          try {
            await page
              .getByText(/Check-in Diário|Daily Check-in|Check-in/i)
              .first()
              .waitFor({ state: 'visible', timeout: 3000 })
          } catch (e) {
            console.log(
              'Redirecionamento acidental detectado! Forçando retorno para a página inicial...'
            )
            await page.goto('https://gkwindbr.com/')
            await page.waitForTimeout(4000)
            try {
              await page
                .getByRole('button', { name: 'Fechar' })
                .click({ timeout: 2000 })
            } catch (err) {}
          }

          console.log('Acessando Check-in Diário GK Wind...')
          try {
            await page.goto('https://gkwindbr.com/checkin/')
            await page.waitForTimeout(3000)

            console.log("Tentando clicar no botão 'Fazer Check-in Agora'...")
            const btnCheckin = page
              .getByRole('button', {
                name: /Fazer Check-in Agora|Check-in Now|Check in now|Check-in/i
              })
              .first()
            if (await btnCheckin.isVisible({ timeout: 5000 })) {
              await btnCheckin.click()
              await page.waitForTimeout(2000)
              try {
                await page
                  .getByRole('button', { name: /Confirmar|Confirm|OK/i })
                  .first()
                  .click({ timeout: 3000 })
                await page.waitForTimeout(1000)
              } catch (e) {}
              contadorTarefas++
              console.log('  -> Check-in GK Wind realizado com sucesso!')
            } else {
              console.log(
                '  -> Botão de check-in não visível. Provavelmente já feito hoje.'
              )
            }
          } catch (e) {
            await fallbackInteligente(
              page,
              'GK Wind - etapa de check-in diário',
              e
            )
            console.log('Aviso: Falha na etapa de Check-in GK Wind:', e.message)
          }

          console.log('Acessando Perfil...')
          try {
            try {
              // Tentando como 'link' que é muito mais preciso para abas inferiores
              await page
                .getByRole('link', { name: /Perfil|Profile/i })
                .first()
                .click({ timeout: 4000 })
            } catch (e) {
              console.log('Tentando voltar para acessar o Perfil...')
              try {
                await page.locator('i').first().click({ timeout: 2000 })
              } catch (err) {
                await page.goBack()
              }
              await page.waitForTimeout(2000)
              await page
                .getByRole('link', { name: /Perfil|Profile/i })
                .first()
                .click({ timeout: 5000 })
            }
            await page.waitForTimeout(3000)

            console.log('Capturando Saldo Total...')
            const bodyText = await page.innerText('body')
            const match = bodyText.match(
              /([\d.,]+)\s*(Saldo Total|Total Balance)|(Saldo Total|Total Balance)[\s:R$]*([\d.,]+)/i
            )
            if (match) {
              carteiraReceita = match[1] || match[4]
            } else {
              const saldoTxt = await page
                .locator('div')
                .filter({ hasText: /^(Saldo Total|Total Balance)$/i })
                .locator('xpath=preceding-sibling::div')
                .innerText()
              carteiraReceita = saldoTxt.replace(/[^0-9.,]/g, '').trim()
            }
            console.log(`Saldo capturado GK Wind: ${carteiraReceita}`)
          } catch (e) {
            await fallbackInteligente(
              page,
              'GK Wind - acessar perfil ou capturar saldo',
              e
            )
            console.log('Falha ao acessar Perfil ou capturar Saldo.', e.message)
          }

          try {
            caminhoPrintSucesso = `sucesso_${conta.nome}.png`
            await page.screenshot({ path: caminhoPrintSucesso, fullPage: true })
            console.log(`Print de sucesso salvo como ${caminhoPrintSucesso}`)
          } catch (e) {
            caminhoPrintSucesso = ''
          }
        } else if (conta.plataforma === 'Arla') {
          // FLUXO ARLA
          console.log('Acessando tela de login Arla...')
          await page.goto('https://arlavt.com/m/login')
          await page.waitForTimeout(3000)

          console.log('Preenchendo credenciais Arla...')
          try {
            const inputs = page.locator('input')
            if ((await inputs.count()) >= 2) {
              // Limpa campos
              await inputs.nth(0).fill('')
              await inputs.nth(0).fill(conta.telefone)
              await inputs.nth(1).fill('')
              await inputs.nth(1).fill(conta.senha)
            }
            await page.waitForTimeout(1000)

            const btnLogin = page
              .locator(
                'button:has-text("Entrar"), button:has-text("Login"), .van-button'
              )
              .first()
            await btnLogin.click()
            await page.waitForTimeout(5000)
          } catch (e) {
            console.log('Aviso: Falha no preenchimento de login Arla.')
          }

          try {
            const btnPortugues = page
              .locator('div')
              .filter({ hasText: /^Portugu[eê]s do Brasil$/i })
              .first()
            const jaEmPortugues = await btnPortugues
              .isVisible({ timeout: 1500 })
              .catch(() => false)

            if (
              !jaEmPortugues &&
              !(await page
                .getByText(/fazenda|granja|farm/i)
                .first()
                .isVisible({ timeout: 1000 })
                .catch(() => false))
            ) {
              console.log('Tentando ajustar idioma Arla para Português...')
              await page
                .locator('.van-icon, i')
                .first()
                .click({ timeout: 3000 })
              await page.waitForTimeout(2000)
              await page
                .locator('div')
                .filter({ hasText: /^Portugu[eê]s do Brasil$/i })
                .first()
                .click({ timeout: 3000 })
              await page.waitForTimeout(5000)
            }
          } catch (e) {
            console.log(
              'Aviso: Não foi possível ajustar idioma Arla, seguindo fluxo multilíngue:',
              e.message
            )
          }

          // 1. Fechar comunicados (Notificação do sistema)
          console.log('Fechando comunicados Arla...')
          try {
            // O seletor .van-dialog__confirm é o padrão para botões "confirme" em diálogos Vant
            const btnConfirme = page
              .locator(
                '.van-dialog__confirm, button:has-text("confirme"), button:has-text("Confirmar"), button:has-text("Confirm"), button:has-text("Aceptar")'
              )
              .first()
            if (await btnConfirme.isVisible({ timeout: 10000 })) {
              await btnConfirme.click()
              console.log('Comunicado Arla fechado.')
              await page.waitForTimeout(2000)
            }

            // Espera o overlay desaparecer para evitar bloqueio de clique
            try {
              await page.waitForSelector('.van-overlay', {
                state: 'hidden',
                timeout: 5000
              })
            } catch (e) {
              console.log('Aviso: Overlay ainda presente ou não encontrado.')
            }
          } catch (e) {
            console.log('Erro ao fechar comunicados Arla:', e.message)
          }

          // 2. Menu Fazenda e Alimentação
          try {
            console.log('Indo para Fazenda...')
            await page
              .getByText(/fazenda|granja|farm/i)
              .first()
              .click()
            await page.waitForTimeout(3000)

            console.log('Clicando em Alimentação (1)...')
            await page
              .getByRole('button', {
                name: /Alimentar|Alimentação|Alimentacion|Alimentación|Feed|Feeding/i
              })
              .first()
              .click()
            await page.waitForTimeout(3000)

            console.log('Clicando em Alimentação (2)...')
            await page
              .getByRole('button', {
                name: /Alimentar|Alimentação|Alimentacion|Alimentación|Feed|Feeding/i
              })
              .first()
              .click()
            await page.waitForTimeout(3000)

            console.log('Confirmando ação de alimentação...')
            await page
              .getByRole('button', {
                name: /confirme|confirmar|confirm|aceptar/i
              })
              .click()
            await page.waitForTimeout(2000)

            contadorTarefas++
            console.log('  -> Tarefa de Alimentação concluída!')
          } catch (e) {
            await fallbackInteligente(page, 'Arla - tarefa de alimentação', e)
            console.log(
              'Aviso: Falha na tarefa de Alimentação Arla:',
              e.message
            )
          }

          // 3. Check-in Diário
          try {
            console.log('Indo para o perfil via URL...')
            await page.goto('https://arlavt.com/m/user/index')
            await page.waitForTimeout(3000)

            console.log('Acessando área de Check-in...')
            await page
              .getByRole('button', {
                name: /Faça login|Check-in|Login|Iniciar sesión/i
              })
              .click()
            await page.waitForTimeout(3000)

            console.log('Realizando Check-in...')
            await page
              .getByRole('button', {
                name: /Clique para fazer login|Click to log in|Haga clic|Check-in/i
              })
              .click()
            await page.waitForTimeout(3000)
            contadorTarefas++
            console.log('  -> Check-in realizado!')
          } catch (e) {
            await fallbackInteligente(page, 'Arla - check-in diário', e)
            console.log('Aviso: Falha no Check-in Arla:', e.message)
          }

          // 4. Captura de Saldo e Print
          try {
            console.log('Acessando o perfil via URL para capturar saldo...')
            await page.goto('https://arlavt.com/m/user/index')
            await page.waitForTimeout(4000)

            caminhoPrintSucesso = `sucesso_${conta.nome}.png`
            await page.screenshot({ path: caminhoPrintSucesso, fullPage: true })

            const bodyText = await page.innerText('body')
            const match = bodyText.match(/GTQ\s*([\d.,]+)/i)
            if (match) {
              carteiraReceita = match[1]
            } else {
              const locSaldo = page.getByText(/GTQ\s*[\d.,]+/).first()
              const texto = await locSaldo.innerText()
              carteiraReceita = texto.replace(/GTQ/i, '').trim()
            }
            console.log(`Saldo capturado Arla: ${carteiraReceita}`)
          } catch (e) {
            await fallbackInteligente(page, 'Arla - capturar saldo ou print', e)
            console.log(
              'Aviso: Falha ao capturar saldo ou print Arla:',
              e.message
            )
          }
        } else {
          // FLUXO ROYAL AURUM
          console.log('Acessando tela de login Royal Aurum...')
          await page.goto('https://royalaurum0931.com/login')
          await page.waitForTimeout(3000)

          console.log('Preenchendo credenciais...')
          await page.fill(
            'input[placeholder="(11) 99999-9999"]',
            conta.telefone
          )
          await page.fill('input[placeholder="Senha"]', conta.senha)
          await page.waitForTimeout(1000)

          await page.locator('button:has-text("Entrar")').click()
          console.log('Comando de Entrar enviado.')

          await page.waitForTimeout(5000)

          // ==========================================
          // 3. VERIFICAR COMUNICADOS
          // ==========================================

          console.log(
            'Verificando se há comunicados especiais (Ver detalhes)...'
          )
          try {
            const botaoDetalhes = page.getByRole('button', {
              name: 'Ver detalhes'
            })
            await botaoDetalhes.waitFor({ state: 'visible', timeout: 2000 })

            console.log(
              "Aviso especial detectado! Clicando em 'Ver detalhes'..."
            )
            await botaoDetalhes.click()

            console.log(
              "Aguardando liberação do botão 'Voltar' (aprox. 10s)..."
            )
            const botaoVoltar = page.getByRole('button', { name: 'Voltar' })
            await botaoVoltar.waitFor({ state: 'visible', timeout: 10000 })
            await botaoVoltar.click()

            console.log('Retornou do aviso especial com sucesso.')
            await page.waitForTimeout(2000)
          } catch (e) {
            console.log('Nenhum aviso especial encontrado. Seguindo...')
          }

          console.log('Verificando se há comunicados normais na tela...')
          let comunicadosFechados = 0
          while (true) {
            try {
              const botaoFechar = page.locator('.close').first()
              await botaoFechar.waitFor({ state: 'visible', timeout: 4000 })
              await botaoFechar.click({ force: true })
              comunicadosFechados++
              console.log(`Comunicado #${comunicadosFechados} fechado.`)
              await page.waitForTimeout(1500)
            } catch (e) {
              if (comunicadosFechados > 0) {
                console.log(
                  `Total de comunicados fechados: ${comunicadosFechados}. Seguindo...`
                )
              } else {
                console.log('Nenhum comunicado normal encontrado. Seguindo...')
              }
              break
            }
          }

          // ==========================================
          // 4. ROTINA DE TAREFAS (SEU LOOP)
          // ==========================================

          console.log('Iniciando rotina de tarefas...')
          await page.click('a:has-text("Tarefa")')
          await page.waitForTimeout(2000)

          let temTarefa = true
          let falhasConsecutivas = 0

          while (temTarefa) {
            let botaoEnviar
            try {
              botaoEnviar = page
                .locator('button:has-text("Iniciar Tarefa")')
                .first()
              await botaoEnviar.waitFor({ state: 'visible', timeout: 5000 })
            } catch (e) {
              console.log(
                `Fim natural das tarefas. Total concluído: ${contadorTarefas}`
              )
              temTarefa = false
              falhasConsecutivas = 0
              break
            }

            try {
              console.log(`Processando tarefa #${contadorTarefas + 1}...`)
              await botaoEnviar.click()

              await page
                .locator('button[aria-label="5 estrelas"]')
                .waitFor({ state: 'visible', timeout: 15000 })
              await page
                .locator('button[aria-label="5 estrelas"]')
                .click({ force: true })
              await page.waitForTimeout(1000)

              await page
                .locator('button:has-text("Receber Recompensa")')
                .first()
                .click()
              await page.waitForTimeout(3000)

              try {
                await page
                  .locator('button:has-text("Confirmar")')
                  .first()
                  .click({ timeout: 2000 })
                await page.waitForTimeout(1000)
              } catch (e) {}

              contadorTarefas++
              falhasConsecutivas = 0
              console.log(
                `  -> Tarefa #${contadorTarefas} concluída com sucesso!`
              )
            } catch (e) {
              falhasConsecutivas++
              console.log(
                `⚠️ Falha na execução da tarefa (Possível vídeo travado). Tentativa ${falhasConsecutivas} de 2.`
              )

              if (falhasConsecutivas >= 2) {
                throw new Error(
                  'Falha ao concluir a tarefa após 2 tentativas. Travamento detectado.'
                )
              } else {
                console.log(
                  'Forçando retorno para a tela inicial para tentar novamente...'
                )
                await page.goto('https://royalaurum0931.com/')
                await page.waitForTimeout(4000)

                try {
                  await page
                    .locator('.close')
                    .first()
                    .click({ timeout: 2000, force: true })
                } catch (err) {}

                await page.click('a:has-text("Tarefa")')
                await page.waitForTimeout(3000)
              }
            }
          }

          try {
            caminhoPrintSucesso = `sucesso_${conta.nome}.png`
            await page.screenshot({ path: caminhoPrintSucesso, fullPage: true })
            console.log(`Print de sucesso salvo como ${caminhoPrintSucesso}`)
          } catch (e) {
            console.log('Não foi possível tirar o print da tela de sucesso.')
            caminhoPrintSucesso = ''
          }

          // ==========================================
          // 5. CAPTURAR O SALDO NA "MINHA ÁREA"
          // ==========================================
          console.log('Navegando de volta para a Home para capturar o saldo...')
          await page.goto('https://royalaurum0931.com/')
          await page.waitForTimeout(4000)

          try {
            await page
              .locator('.close')
              .first()
              .click({ timeout: 2000, force: true })
          } catch (err) {}

          console.log("Indo para 'Minha área'...")
          try {
            await page.click('text="Minha área"')
          } catch (e) {}
          await page.waitForTimeout(3000)

          const locSaldo = page
            .locator('div:has(span:has-text("Carteira de Receita")) > p')
            .first()
          await locSaldo.waitFor({ state: 'visible', timeout: 10000 })

          const carteiraTexto = await locSaldo.innerText()
          carteiraReceita = carteiraTexto.replace(/[^0-9.,]/g, '').trim()
          console.log(`Saldo capturado: ${carteiraReceita}`)
        }

        if (!linhasRelatorioPorPlataforma[conta.plataforma]) {
          linhasRelatorioPorPlataforma[conta.plataforma] = []
        }
        linhasRelatorioPorPlataforma[conta.plataforma].push(
          `${conta.nome} - Tarefas: ${contadorTarefas} | Saldo: ${carteiraReceita}`
        )
        if (carteiraReceita && carteiraReceita !== '0.00')
          saldosHoje[conta.nome] = {
            saldo: carteiraReceita,
            plataforma: conta.plataforma
          }

        // Upload do print de sucesso, se existir
        let urlPrintSucesso = ''
        if (caminhoPrintSucesso && fs.existsSync(caminhoPrintSucesso)) {
          urlPrintSucesso = await uploadPrintToStorage(
            caminhoPrintSucesso,
            `sucesso_${conta.nome}_${Date.now()}.png`
          )
        }

        await salvarResultadoConta({
          accountId: conta.id,
          nome: conta.nome,
          telefone: conta.telefone,
          plataforma: conta.plataforma,
          status: 'success',
          tarefasConcluidas: contadorTarefas,
          saldo: carteiraReceita,
          caminhoPrint: urlPrintSucesso || caminhoPrintSucesso
        })

        // Chama a função passando o contadorTarefas
        if (conta.email) {
          console.log(
            `Preparando envio de e-mail de status para ${conta.nome}...`
          )
          // Note que adicionamos a variável contadorTarefas e plataforma aqui na chamada
          await enviarEmailIndividual(
            conta.email,
            conta.nome,
            carteiraReceita,
            contadorTarefas,
            dataHoje,
            conta.plataforma
          )
        }

        const numeroEnvio = conta.telefoneWhatsApp || conta.telefone
        if (conta.recebeWhatsApp) {
          console.log(
            `Preparando envio de WhatsApp de status para ${conta.nome}...`
          )
          await enviarWhatsApp(
            numeroEnvio,
            conta.nome,
            carteiraReceita,
            contadorTarefas,
            dataHoje,
            caminhoPrintSucesso,
            conta.plataforma
          )
        }

        // 3. LIMPEZA DO PRINT DE SUCESSO
        if (caminhoPrintSucesso && fs.existsSync(caminhoPrintSucesso)) {
          try {
            fs.unlinkSync(caminhoPrintSucesso)
          } catch (e) {}
        }
      } catch (erro) {
        if (tentativaAtual < MAX_TENTATIVAS) {
          console.log(
            `⚠️ Falha na tentativa ${tentativaAtual}/${MAX_TENTATIVAS} de ${conta.nome}. Retentando em 5s...`
          )
          try {
            await context.close()
          } catch (_e) {}
          await new Promise(r => setTimeout(r, 5000))
          _retry = true
        } else {
          console.error(
            `Falha ao processar a conta de ${conta.nome} (${conta.telefone}):`,
            erro.message
          )
          if (!linhasRelatorioPorPlataforma[conta.plataforma]) {
            linhasRelatorioPorPlataforma[conta.plataforma] = []
          }
          linhasRelatorioPorPlataforma[conta.plataforma].push(
            `${conta.nome}: ERRO - ${erro.message}`
          )

          const caminhoPrint = `erro_${conta.nome}.png`
          try {
            await page.screenshot({ path: caminhoPrint, fullPage: true })
            console.log(`Print de erro salvo como ${caminhoPrint}`)
          } catch (e) {
            console.log('Não foi possível tirar o print da tela.')
          }

          // Upload do print de erro, se existir
          let urlPrintErro = ''
          if (caminhoPrint && fs.existsSync(caminhoPrint)) {
            urlPrintErro = await uploadPrintToStorage(
              caminhoPrint,
              `erro_${conta.nome}_${Date.now()}.png`
            )
          }

          await salvarResultadoConta({
            accountId: conta.id,
            nome: conta.nome,
            telefone: conta.telefone,
            plataforma: conta.plataforma,
            status: 'error',
            tarefasConcluidas: 0,
            saldo: null,
            erro: erro.message,
            caminhoPrint: urlPrintErro || caminhoPrint
          })

          // 1. Envia o E-mail com o print
          if (conta.email) {
            console.log(
              `Preparando envio de e-mail de erro para ${conta.nome}...`
            )
            await enviarEmailErro(
              conta.email,
              conta.nome,
              dataHoje,
              caminhoPrint
            )
          }

          // 2. Envia o WhatsApp com o print
          const numeroEnvio = conta.telefoneWhatsApp || conta.telefone
          if (conta.recebeWhatsApp) {
            console.log(
              `Preparando envio de WhatsApp de erro para ${conta.nome}...`
            )
            await enviarWhatsAppErro(
              numeroEnvio,
              conta.nome,
              dataHoje,
              caminhoPrint
            )
          }

          // 3. LIMPEZA: Agora apagamos a imagem apenas depois de mandar nos dois
          if (caminhoPrint && fs.existsSync(caminhoPrint)) {
            try {
              fs.unlinkSync(caminhoPrint)
            } catch (e) {}
          }
        } // end else (tentativa final)
      } finally {
        try {
          await context.close()
        } catch (_e) {}
        if (!_retry) console.log(`Conta de ${conta.nome} finalizada.\n`)
      }
      if (!_retry) break
    } // end while
  }

  await browser.close()

  const plataformasRelatorio = Object.keys(linhasRelatorioPorPlataforma).sort(
    (a, b) => a.localeCompare(b, 'pt-BR')
  )
  if (plataformasRelatorio.length > 0) {
    relatorioFinal = 'Relatório de Saldos das Contas:\n\n'
    for (const plataforma of plataformasRelatorio) {
      relatorioFinal += `*${plataforma || 'Sem plataforma'}*\n`
      relatorioFinal += linhasRelatorioPorPlataforma[plataforma].join('\n')
      relatorioFinal += '\n\n'
    }
  }

  // ==========================================
  // 5.5. RELATÓRIO COMPARATIVO
  // ==========================================
  try {
    const ontem = new Date()
    ontem.setDate(ontem.getDate() - 1)
    ontem.setHours(0, 0, 0, 0)
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const { data: resultadosOntem } = await supabase
      .from('account_run_results')
      .select('account_name, balance')
      .gte('executed_at', ontem.toISOString())
      .lt('executed_at', hoje.toISOString())
      .eq('status', 'success')

    if (resultadosOntem && resultadosOntem.length > 0) {
      const mapOntem = {}
      for (const r of resultadosOntem) mapOntem[r.account_name] = r.balance

      const linhasComparativo = []
      for (const [nome, entry] of Object.entries(saldosHoje)) {
        if (!entry || typeof entry !== 'object') continue
        const saldo = entry.saldo
        const plataforma = entry.plataforma
        if (!saldo || !plataforma) continue
        const saldoAnt = mapOntem[nome]
        if (saldoAnt) {
          const atual = parseFloat(saldo.replace(',', '.')) || 0
          const ant = parseFloat(saldoAnt.replace(',', '.')) || 0
          const diff = atual - ant
          const emoji = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️'
          const sinal = diff > 0 ? '+' : ''
          linhasComparativo.push(
            `${nome} - ${plataforma}: ${saldo} (ontem: ${saldoAnt} | ${sinal}${diff.toFixed(2)} ${emoji})`
          )
        }
      }
      if (linhasComparativo.length > 0)
        relatorioFinal +=
          '\n📊 Comparativo vs. Ontem:\n' + linhasComparativo.join('\n') + '\n'
    }
  } catch (e) {
    console.log('Aviso: Não foi possível gerar o comparativo:', e.message)
  }

  // ==========================================
  // 6. ENVIAR E-MAIL FINAL E WHATSAPP FINAL
  // ==========================================
  console.log('Enviando e-mail com o relatório...')
  await enviarEmail(relatorioFinal, dataHoje)

  console.log('Enviando relatório final via WhatsApp para o Administrador...')
  try {
    const state = await client.getState()
    if (state === 'CONNECTED') {
      if (numeroAdminWhatsApp) {
        await client.sendMessage(
          numeroAdminWhatsApp,
          `*Relatório Diário (${dataHoje})*\n\n${relatorioFinal}`
        )
        console.log('Relatório final enviado pelo WhatsApp com sucesso!')
      }
    } else {
      console.error(
        `Atenção: A conexão do WhatsApp não está pronta. Status atual: ${state}`
      )
    }
  } catch (e) {
    console.error('Falha ao enviar relatório final pelo WhatsApp:')
    console.error(e)
  }

  // ==========================================
  // 6.5. SINAL DE VIDA (HEALTHCHECKS)
  // ==========================================
  console.log('Enviando sinal de vida para o monitor de infraestrutura...')
  try {
    // Substitua pela SUA URL do Healthchecks
    if (healthcheckUrl) {
      https
        .get(healthcheckUrl, res => {
          console.log(
            `Sinal de vida recebido pelo servidor. Status: ${res.statusCode}`
          )
        })
        .on('error', e => {
          console.error('Erro de rede ao pingar o Healthchecks:', e.message)
        })
    }
  } catch (e) {
    console.error('Falha ao executar o ping:', e.message)
  }

  // ==========================================
  // 7. FINALIZAÇÃO
  // ==========================================
  console.log(
    'Aguardando 5 segundos para a rede processar as mensagens do WhatsApp...'
  )
  await new Promise(resolve => setTimeout(resolve, 5000))

  console.log('\nFechando sessão do WhatsApp...')
  await client.destroy()

  // ==========================================
  // 8. DESLIGAR A MÁQUINA AWS (WINDOWS)
  // ==========================================
  if (process.env.AUTO_SHUTDOWN === 'true') {
    console.log('Robo finalizado. Desligando a máquina AWS em 10 segundos...')
    setTimeout(() => {
      // Comando para Windows: /s (shutdown), /f (force), /t 10 (timeout de 10 segundos)
      exec('shutdown /s /f /t 10', err => {
        if (err) console.error('Erro ao desligar a máquina:', err.message)
        else console.log('Comando de desligamento enviado.')
      })
    }, 10000)
  } else {
    process.exit(0)
  }
}

async function enviarEmail(conteudo, dataHoje) {
  try {
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: configuracaoEmail.usuario,
        pass: configuracaoEmail.senhaApp
      }
    })

    let opcoesEmail = {
      from: `"Robô de Ganhos" <${configuracaoEmail.usuario}>`,
      to: configuracaoEmail.usuario,
      subject: `Automação Concluída - Relatório de Contas (${dataHoje})`,
      text: conteudo
    }

    if (fs.existsSync('log_sistema.txt')) {
      opcoesEmail.attachments = [
        {
          filename: 'log_sistema.txt',
          path: './log_sistema.txt'
        }
      ]
    }

    let info = await transporter.sendMail(opcoesEmail)
    console.log('E-mail final enviado com sucesso! ID:', info.messageId)

    // Deleta o log após o envio bem-sucedido (atendendo ao pedido do usuário)
    // O log_sistema.txt não é excluído aqui pois é usado pelo processo de redirecionamento (EBUSY).
    // O script de boot (iniciar_robo.bat) já reseta o arquivo em cada reinicialização.
  } catch (erro) {
    console.error('Falha ao enviar e-mail final:', erro.message)
  }
}

async function enviarEmailIndividual(
  emailDestino,
  nome,
  saldo,
  qtdTarefas,
  dataHoje,
  plataforma
) {
  try {
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: configuracaoEmail.usuario,
        pass: configuracaoEmail.senhaApp
      }
    })

    let assunto = ''
    let conteudo = ''
    const nomePlataforma =
      plataforma === 'VLM'
        ? 'VLM'
        : plataforma === 'Signet'
          ? 'Signet'
          : plataforma === 'GKWind'
            ? 'GK Wind'
            : plataforma === 'Arla'
              ? 'Arla'
              : 'Royal Aurum'

    // Verifica se fez tarefas ou se já estavam concluídas
    if (qtdTarefas > 0) {
      assunto = `Sucesso: Tarefas Concluídas (${nomePlataforma}) - ${dataHoje}`
      conteudo = `Olá, ${nome}!\n\nO robô concluiu ${qtdTarefas} tarefa(s) na plataforma ${nomePlataforma} hoje (${dataHoje}).\n\nSeu saldo atualizado é: ${saldo}\n\nAtenciosamente,\nRobô de Tarefas SP`
    } else {
      assunto = `Aviso: Sem Tarefas Pendentes (${nomePlataforma}) - ${dataHoje}`
      conteudo = `Olá, ${nome}!\n\nO robô acessou sua conta na plataforma ${nomePlataforma} hoje (${dataHoje}), mas as tarefas já estavam concluídas.\n\nMesmo assim, capturamos seu saldo atual: ${saldo}\n\nAtenciosamente,\nRobô de Tarefas SP`
    }

    await transporter.sendMail({
      from: `"Robô de Tarefas" <${configuracaoEmail.usuario}>`,
      to: emailDestino,
      subject: assunto,
      text: conteudo
    })

    console.log(
      ` -> E-mail de status (Tarefas: ${qtdTarefas}) enviado para ${nome} com sucesso!`
    )
  } catch (erro) {
    console.error(
      ` -> Falha ao enviar e-mail de status para ${nome}:`,
      erro.message
    )
  }
}

async function enviarEmailErro(emailDestino, nome, dataHoje, caminhoPrint) {
  try {
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: configuracaoEmail.usuario,
        pass: configuracaoEmail.senhaApp
      }
    })

    let assunto = `Aviso Urgente: Falha de Acesso - ${dataHoje}`
    let conteudo = `Olá, ${nome}!\n\nO robô tentou acessar sua conta hoje (${dataHoje}), mas encontrou um erro e não conseguiu finalizar o processo.\n\nVeja a imagem em anexo para entender em qual tela o robô travou. Isso pode ajudar a identificar se foi uma instabilidade no site ou um pop-up inesperado.\n\nVerifique a conta quando puder.\n\nAtenciosamente,\nRobô de Tarefas SP`

    let opcoesEmail = {
      from: `"Robô de Tarefas" <${configuracaoEmail.usuario}>`,
      to: emailDestino,
      subject: assunto,
      text: conteudo
    }

    // Se o print foi gerado com sucesso, anexa ao e-mail
    if (caminhoPrint && fs.existsSync(caminhoPrint)) {
      opcoesEmail.attachments = [
        {
          filename: `Erro_${nome}.png`,
          path: `./${caminhoPrint}`
        }
      ]
    }

    await transporter.sendMail(opcoesEmail)
    console.log(
      ` -> E-mail de ERRO com print enviado para ${nome} com sucesso!`
    )
  } catch (erro) {
    console.error(
      ` -> Falha ao enviar e-mail de erro para ${nome}:`,
      erro.message
    )
  }
}

async function enviarWhatsApp(
  numero,
  nome,
  saldo,
  qtdTarefas,
  dataHoje,
  caminhoPrintSucesso,
  plataforma
) {
  try {
    // Verifica se o cliente está pronto antes de tentar enviar
    const state = await client.getState().catch(() => null)
    if (state !== 'CONNECTED') {
      console.log(` -> Pulando WhatsApp para ${nome}: Cliente desconectado (${state})`)
      return
    }

    const numeroDestino = `55${numero}@c.us`
    let mensagem = ''
    const nomePlataforma =
      plataforma === 'VLM'
        ? 'VLM'
        : plataforma === 'Signet'
          ? 'Signet'
          : plataforma === 'GKWind'
            ? 'GK Wind'
            : plataforma === 'Arla'
              ? 'Arla'
              : 'Royal Aurum'

    if (qtdTarefas > 0) {
      mensagem = `Olá, ${nome}! ✅\nO robô concluiu ${qtdTarefas} tarefa(s) na plataforma *${nomePlataforma}* com sucesso hoje (${dataHoje}).\nSaldo atualizado: ${saldo}`
    } else {
      mensagem = `Olá, ${nome}! ℹ️\nO robô acessou sua conta na plataforma *${nomePlataforma}* hoje (${dataHoje}), mas as tarefas já estavam concluídas.\nSaldo atual: ${saldo}`
    }

    if (caminhoPrintSucesso && fs.existsSync(caminhoPrintSucesso)) {
      const media = MessageMedia.fromFilePath(caminhoPrintSucesso)
      await client.sendMessage(numeroDestino, media, { caption: mensagem })
    } else {
      await client.sendMessage(numeroDestino, mensagem)
    }
    console.log(
      `[SUCESSO] -> WhatsApp de status (Tarefas: ${qtdTarefas}) enviado para ${nome} com sucesso!`
    )
  } catch (erro) {
    console.error(
      ` -> Falha ao enviar WhatsApp de status para ${nome}:`,
      erro.message
    )
  }
}

async function enviarWhatsAppErro(numero, nome, dataHoje, caminhoPrint) {
  try {
    const state = await client.getState().catch(() => null)
    if (state !== 'CONNECTED') {
      console.log(` -> Pulando WhatsApp de erro para ${nome}: Cliente desconectado (${state})`)
      return
    }

    const numeroDestino = `55${numero}@c.us`
    const mensagem = `⚠️ *Aviso Urgente: Falha de Acesso* ⚠️\n\nOlá, ${nome}!\nO robô tentou acessar sua conta hoje (${dataHoje}) e encontrou um erro, não sendo possível concluir as tarefas.\n\nVeja o print da tela no momento do erro abaixo.`

    if (caminhoPrint && fs.existsSync(caminhoPrint)) {
      const media = MessageMedia.fromFilePath(caminhoPrint)
      await client.sendMessage(numeroDestino, media, { caption: mensagem })
    } else {
      await client.sendMessage(numeroDestino, mensagem)
    }

    console.log(
      `[SUCESSO] -> WhatsApp de ERRO (com imagem) enviado para ${nome} com sucesso!`
    )
  } catch (erro) {
    console.error(
      ` -> Falha ao enviar WhatsApp de erro para ${nome}:`,
      erro.message
    )
  }
}
