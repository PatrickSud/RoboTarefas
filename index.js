
// ==========================================
// 1. CONFIGURAÇÕES
// ==========================================
const configuracaoEmail = {
    usuario: 'patricksud96@gmail.com',
    senhaApp: 'wzbv amfm etxh zyyi'
};

const contas = [
    { nome: 'Patrick', telefone: '19995487421', senha: 'Pagy2015', recebeWhatsApp: true, plataforma: 'RoyalAurum' },
    { nome: 'Patrick VLM', telefone: '19971691705', senha: 'Pagy2015', recebeWhatsApp: true, plataforma: 'VLM', telefoneWhatsApp: '19995487421' },
    { nome: 'Patrick Arla', telefone: '995487421', senha: 'Pagy2015', recebeWhatsApp: true, plataforma: 'Arla', telefoneWhatsApp: '19995487421', testar: true },
    { nome: 'Patrick Signet', telefone: '19995487421', senha: 'Pagy2015', recebeWhatsApp: true, plataforma: 'Signet' },
    { nome: 'Gonzalo Signet', telefone: '1931997599', senha: 'Pagy2015', recebeWhatsApp: true, plataforma: 'Signet' },
    { nome: 'Magaly Signet', telefone: '19971691705', senha: 'Pagy2015', recebeWhatsApp: true, plataforma: 'Signet', telefoneWhatsApp: '19995487421' },
    { nome: 'Patrick GK Wind', telefone: '19995487421', senha: 'Pagy2015', recebeWhatsApp: true, plataforma: 'GKWind', testar: true },
    { nome: 'Magaly GK Wind', telefone: '19971691705', senha: 'Andrea2202!', recebeWhatsApp: true, plataforma: 'GKWind', telefoneWhatsApp: '19995487421', testar: true },
    { nome: 'Devania Signet', telefone: '19992509897', senha: 'Vixx140814', recebeWhatsApp: true, plataforma: 'Signet' }
];

const { chromium } = require('playwright');
const nodemailer = require('nodemailer');
const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

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
});

client.on('qr', async (qr) => {
    qrcodeTerminal.generate(qr, { small: true });
    console.log('Novo QR Code recebido:', qr);
    console.log('Gerando imagem e enviando por e-mail...');

    try {
        // Salva o QR Code como arquivo local para consulta manual
        await qrcode.toFile('qrcode.png', qr);
        console.log('QR Code salvo localmente como qrcode.png');

        const qrBase64 = await qrcode.toDataURL(qr);
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: configuracaoEmail.usuario,
                pass: configuracaoEmail.senhaApp
            }
        });

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
                    content: qrBase64.split("base64,")[1],
                    encoding: 'base64',
                    cid: 'qrcode_whatsapp'
                }
            ]
        });
        console.log('QR Code enviado por e-mail com sucesso.');
    } catch (err) {
        console.error('Falha ao gerar ou enviar o QR code:', err);
    }
});

client.on('ready', () => {
    console.log('Cliente WhatsApp está pronto!');
    executarAutomacao();
});

client.initialize();

// Captura erros fatais que não caíram no bloco try/catch
process.on('uncaughtException', async (err) => {
    console.error('\n🚨 ERRO FATAL IRRECUPERÁVEL DETECTADO 🚨\n', err);
    try {
        const numeroAdmin = '5519995487421@c.us';
        await client.sendMessage(numeroAdmin, `🚨 *FALHA CRÍTICA NO SERVIDOR* 🚨\n\nO robô sofreu um erro fatal e foi encerrado abruptamente.\n\n*Detalhe técnico:*\n${err.message}`);
    } catch (e) {}
    
    // Força o encerramento seguro após avisar
    setTimeout(() => process.exit(1), 5000); 
});

// ==========================================
// 2. FUNÇÃO PRINCIPAL DO ROBÔ
// ==========================================
async function executarAutomacao() {
    let relatorioFinal = "Relatório de Saldos das Contas:\n\n";
    const dataHoje = new Date().toLocaleDateString('pt-BR');

    // NOVO: LÓGICA DE TESTE
    // Verifica se existe alguma conta marcada com 'testar: true'
    const contasDeTeste = contas.filter(conta => conta.testar === true);
    
    // Se existir, usa apenas as de teste. Se não existir, usa a lista original completa.
    const contasParaProcessar = contasDeTeste.length > 0 ? contasDeTeste : contas;

    if (contasDeTeste.length > 0) {
        console.log(`\n⚠️ MODO DE TESTE ATIVADO: Executando apenas ${contasDeTeste.length} conta(s).\n`);
    }

    const browser = await chromium.launch({ 
        headless: false,
        args: [
            '--autoplay-policy=no-user-gesture-required', // Força o vídeo a rodar sozinho
            '--disable-gpu', // Desativa a dependência de placa de vídeo do Windows
            '--mute-audio', // Muta o áudio para evitar bugs de drivers de som
            '--window-size=1280,720'
        ]
    });

    for (const conta of contasParaProcessar) {
        console.log(`\n--- Iniciando conta: ${conta.nome} (${conta.telefone}) ---`);

        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            let contadorTarefas = 0;
            let carteiraReceita = '0.00';
            let caminhoPrintSucesso = '';

            if (conta.plataforma === 'VLM') {
                console.log("Acessando tela de login VLM...");
                await page.goto('https://vlm7.com/#/login');
                await page.waitForTimeout(3000);

                console.log("Preenchendo credenciais VLM...");
                await page.fill("input[placeholder='Por favor, digite seu número de telefone']", conta.telefone);
                await page.fill("input[placeholder='Por favor, digite a senha de login']", conta.senha);
                await page.waitForTimeout(1000);

                await page.locator('button:has-text("Fazer login agora")').click();
                console.log("Comando de Entrar enviado.");
                await page.waitForTimeout(5000);

                console.log("Lidando com comunicados...");
                try { 
                    // Tenta seletores comuns de botão fechar (x) em plataformas Vue/Vant
                    await page.locator('.close, .van-icon-cross').first().click({ timeout: 3000 }); 
                    await page.waitForTimeout(1000);
                } catch (e) {}

                // Caso o robô tenha clicado no fundo (na imagem da campanha) por acidente e abrido o artigo:
                if (page.url().includes('/notice') || page.url().includes('/article')) {
                    console.log("Navegou para o artigo acidentalmente. Voltando para Home...");
                    await page.goto('https://vlm7.com/#/home');
                    await page.waitForTimeout(3000);
                }

                console.log("Iniciando rotina de tarefas VLM...");
                // Rola um pouco a página para encontrar o botão
                try {
                    await page.evaluate(() => window.scrollBy(0, 500));
                    await page.waitForTimeout(1000);
                } catch(e) {}

                await page.getByText('Imagens Mais Recentes').first().click();
                await page.waitForTimeout(3000);

                let temTarefa = true;
                let falhasConsecutivas = 0;

                while (temTarefa) {
                    let botaoEnviar;
                    try {
                        botaoEnviar = page.locator('button:has-text("Ver classificação")').first();
                        await botaoEnviar.waitFor({ state: 'visible', timeout: 5000 });
                    } catch (e) {
                        console.log(`Fim natural das tarefas VLM. Total concluído: ${contadorTarefas}`);
                        temTarefa = false;
                        falhasConsecutivas = 0;
                        break;
                    }

                    try {
                        console.log(`Processando tarefa #${contadorTarefas + 1}...`);
                        await botaoEnviar.click();

                        console.log("Aguardando contagem regressiva de 8s + renderização...");
                        await page.waitForTimeout(15000); // 8s da VLM + margem
                        
                        const btnConfirmar = page.locator('button:has-text("Confirmar"):visible').last();
                        await btnConfirmar.waitFor({ state: 'visible', timeout: 2000 });
                        await btnConfirmar.click({ force: true });
                        await page.waitForTimeout(1500);
                        
                        // Verifica qual mensagem apareceu após confirmar as estrelas
                        try {
                            const msgLimite = page.locator('text="O número de vezes de hoje já foi usado"').first();
                            if (await msgLimite.isVisible()) {
                                console.log(`Fim das tarefas VLM atingido (Limite diário). Total concluído: ${contadorTarefas}`);
                                temTarefa = false;
                                falhasConsecutivas = 0;
                                // Fecha o popup do limite e volta para a lista antes de tirar o print
                                try { await page.locator('button:has-text("Confirmar"):visible').last().click({ timeout: 2000 }); } catch(e) {}
                                try { await page.locator('.van-nav-bar__left, i.van-icon-arrow-left').first().click({ timeout: 3000 }); } catch (e) { await page.goBack(); }
                                await page.waitForTimeout(2000);
                                break; 
                            }
                        } catch (e) {}

                        // Se não foi limite, segue o jogo para a segunda confirmação de sucesso
                        try {
                            // Aguarda a confirmação de que o valor foi recebido
                            const lblSucesso = page.getByText('Valor recebido com sucesso');
                            await lblSucesso.waitFor({ state: 'visible', timeout: 5000 });

                            // Clica no botão Confirmar correspondente
                            const btnSucesso = page.getByRole('button', { name: 'Confirmar' });
                            await btnSucesso.click({ force: true });
                            await page.waitForTimeout(1000);
                        } catch (e) {
                            // Ignora se a segunda tela de confirmação não aparecer
                        }
                        
                        try {
                            // Verifica se "Ver classificação" já está na tela. Se estiver, significa que o Confirmar já nos trouxe de volta!
                            const btnLista = page.locator('button:has-text("Ver classificação")').first();
                            if (!(await btnLista.isVisible())) {
                                await page.locator('i').first().click({ timeout: 3000 });
                            }
                        } catch (e) {
                            // Falha silenciosa
                        }
                        await page.waitForTimeout(3000);
                        
                        // Sistema de recuperação: se voltou demais e caiu na Home, clica de volta para a lista
                        try {
                            const btnListaFinal = page.locator('button:has-text("Ver classificação")').first();
                            if (!(await btnListaFinal.isVisible())) {
                                const btnRecentes = page.getByText('Imagens Mais Recentes').first();
                                if (await btnRecentes.isVisible()) {
                                    console.log("Garantindo abertura da lista de tarefas...");
                                    await btnRecentes.click();
                                    await page.waitForTimeout(2000);
                                }
                            }
                        } catch(e) {}

                        contadorTarefas++;
                        falhasConsecutivas = 0;
                        console.log(`  -> Tarefa #${contadorTarefas} concluída com sucesso!`);
                    } catch (e) {
                        falhasConsecutivas++;
                        console.log(`⚠️ Falha na execução da tarefa. Tentativa ${falhasConsecutivas} de 2.`);

                        if (falhasConsecutivas >= 2) {
                            throw new Error('Falha ao concluir a tarefa VLM após 2 tentativas. Travamento detectado.');
                        } else {
                            console.log("Forçando retorno para tentar novamente...");
                            await page.goto('https://vlm7.com/'); 
                            await page.waitForTimeout(4000);
                            try { await page.locator('.close, .van-icon-cross').first().click({ timeout: 2000 }); } catch(err) {}
                            
                            if (page.url().includes('/notice') || page.url().includes('/article')) {
                                await page.goto('https://vlm7.com/#/home');
                                await page.waitForTimeout(3000);
                            }
                            
                            try { await page.evaluate(() => window.scrollBy(0, 500)); await page.waitForTimeout(1000); } catch(e) {}
                            await page.click('div:has-text("Imagens Mais Recentes")');
                            await page.waitForTimeout(3000);
                        }
                    }
                }

                try {
                    caminhoPrintSucesso = `sucesso_${conta.nome}.png`;
                    await page.screenshot({ path: caminhoPrintSucesso, fullPage: true });
                    console.log(`Print de sucesso salvo como ${caminhoPrintSucesso}`);
                } catch (e) {
                    caminhoPrintSucesso = ''; 
                }

                console.log("Indo para 'Meu' para capturar o saldo...");
                await page.goto('https://vlm7.com/');
                await page.waitForTimeout(3000);
                try { await page.locator('.close, .van-icon-cross').first().click({ timeout: 2000 }); } catch(err) {}
                if (page.url().includes('/notice') || page.url().includes('/article')) {
                    await page.goto('https://vlm7.com/#/home');
                    await page.waitForTimeout(2000);
                }

                await page.locator('div:has-text("Meu")').last().click();
                await page.waitForTimeout(3000);

                const locSaldo = page.locator('div:has(p:text-is("Receita total(R$)")) > p:first-child');
                await locSaldo.waitFor({ state: 'visible', timeout: 10000 });

                const carteiraTexto = await locSaldo.innerText();
                carteiraReceita = carteiraTexto.replace(/[^0-9.,]/g, '').trim();
                console.log(`Saldo capturado VLM: ${carteiraReceita}`);

            } else if (conta.plataforma === 'Signet') {
                // FLUXO SIGNET (NOVA PLATAFORMA)
                console.log("Acessando tela de login Signet...");
                await page.goto('https://m.signet-jewelers-br.top/#/login');
                await page.waitForTimeout(3000);

                console.log("Tentando preencher credenciais Signet...");
                try {
                    // Tenta preencher os dois primeiros inputs da tela (geralmente telefone e senha nessas plataformas)
                    const inputs = page.locator('input');
                    if (await inputs.count() >= 2) {
                        await inputs.nth(0).fill(conta.telefone);
                        await inputs.nth(1).fill(conta.senha);
                    }
                    await page.waitForTimeout(1000);
                    
                    // Tenta clicar no botão de login
                    const botoes = page.locator('button');
                    if (await botoes.count() > 0) {
                        await botoes.first().click();
                    }
                    await page.waitForTimeout(3000);
                } catch (e) {
                    console.log("Aviso: Não foi possível preencher o login automaticamente. Faça manualmente.");
                }

                // Fechar comunicados
                console.log("Verificando comunicados...");
                try {
                    const btnConfirmar = page.getByRole('button', { name: 'Confirmar' });
                    await btnConfirmar.waitFor({ state: 'visible', timeout: 5000 });
                    await btnConfirmar.click();
                    await page.waitForTimeout(1000);
                } catch(e) {
                    console.log("Nenhum comunicado encontrado.");
                }

                // Check-in Diário (Signet)
                console.log("Acessando tela de Check-in diário Signet...");
                try {
                    await page.goto('https://m.signet-jewelers-br.top/#/SignIn');
                    await page.waitForTimeout(3000);

                    // O botão "Entrar" é uma <div> estilizada com fundo preto.
                    // Identificamos que existem dois "Entrar" na tela: o título no topo e o botão real no meio.
                    // O botão real possui a classe de fundo preto (bg-[#1A1A1A]) quando está ativo.
                    console.log("Procurando botão de Check-in 'Entrar' com estilo específico...");
                    
                    const btnReal = page.locator('div.bg-\\[\\#1A1A1A\\]:has-text("Entrar")').first();

                    if (await btnReal.isVisible({ timeout: 5000 })) {
                        console.log("Botão 'Entrar' encontrado. Clicando...");
                        await btnReal.click();
                        await page.waitForTimeout(3000);
                        
                        // Verifica se o botão mudou para cinza (bg-[#c2c2c2]), confirmando o sucesso
                        const btnConfirmado = page.locator('div.bg-\\[\\#c2c2c2\\]:has-text("Entrar")').first();
                        if (await btnConfirmado.isVisible({ timeout: 5000 })) {
                            contadorTarefas++;
                            console.log("  -> Check-in Signet realizado e confirmado com sucesso!");
                        } else {
                            console.log("  -> Botão clicado, mas confirmação visual (mudança para cinza) não detectada.");
                            // Incrementamos mesmo assim pois o clique foi dado no botão correto
                            contadorTarefas++;
                        }
                    } else {
                        // Verifica se o botão já está cinza (check-in já feito hoje)
                        const btnJaFeito = page.locator('div.bg-\\[\\#c2c2c2\\]:has-text("Entrar")').first();
                        if (await btnJaFeito.isVisible({ timeout: 2000 })) {
                            console.log("  -> Check-in Signet já havia sido realizado hoje (botão cinza).");
                        } else {
                            console.log("  -> Botão 'Entrar' ativo não encontrado. Verificando se há diálogos de sucesso...");
                            try {
                                const btnOk = page.getByRole('button', { name: /Ok|Confirmar|Sucesso/i }).first();
                                if (await btnOk.isVisible({ timeout: 2000 })) {
                                    await btnOk.click();
                                    contadorTarefas++;
                                    console.log("  -> Check-in concluído via diálogo de confirmação.");
                                } else {
                                    console.log("  -> Nenhum botão de check-in detectado.");
                                }
                            } catch(err) {
                                console.log("  -> Falha ao procurar elementos alternativos de check-in.");
                            }
                        }
                    }

                    console.log("Voltando para a tela principal...");
                    try { await page.locator('i.van-icon-arrow-left, .van-nav-bar__left').first().click({ timeout: 3000 }); } catch(e) { await page.goBack(); }
                    await page.waitForTimeout(2000);
                } catch(e) {
                    console.log("Aviso: Falha no check-in diário Signet:", e.message);
                }

                // Receber Renda (Tarefas)
                console.log("Indo para o menu de perfil...");
                try {
                    await page.locator('div:nth-child(5) > .van-badge__wrapper > .w-24').first().click({ timeout: 5000 });
                    await page.waitForTimeout(3000);

                    console.log("Acessando 'Receber Renda'...");
                    await page.getByText('Receber Renda').first().click({ timeout: 5000 });
                    await page.waitForTimeout(3000);

                    let recebendo = true;
                    while (recebendo) {
                        try {
                            const btnReceived = page.getByRole('button', { name: 'Received' }).first();
                            await btnReceived.waitFor({ state: 'visible', timeout: 3000 });
                            await btnReceived.click();
                            contadorTarefas++;
                            console.log(`  -> Renda #${contadorTarefas} recebida com sucesso!`);
                            await page.waitForTimeout(2000);
                        } catch(e) {
                            console.log("Fim das rendas disponíveis.");
                            recebendo = false;
                        }
                    }

                    console.log("Voltando para o perfil...");
                    await page.locator('i').first().click({ timeout: 3000 });
                    await page.waitForTimeout(3000);

                    console.log("Capturando saldo...");
                    try {
                        const bodyText = await page.innerText('body');
                        const match = bodyText.match(/([\d.,]+)\s*Carteira da Equipe/i);
                        if (match && match[1]) {
                            carteiraReceita = match[1];
                        } else {
                            const locSaldo = page.locator(':has-text("Carteira da Equipe")').last();
                            const texto = await locSaldo.innerText();
                            carteiraReceita = texto.replace(/[^0-9.,]/g, '').trim();
                        }
                        console.log(`Saldo capturado Signet: ${carteiraReceita}`);
                    } catch(e) {
                        console.log("Não foi possível capturar o saldo:", e.message);
                    }

                } catch(e) {
                    console.log("Falha na rotina de perfil (Receber Renda).", e.message);
                }

                try {
                    caminhoPrintSucesso = `sucesso_${conta.nome}.png`;
                    await page.screenshot({ path: caminhoPrintSucesso, fullPage: true });
                    console.log(`Print de sucesso salvo como ${caminhoPrintSucesso}`);
                } catch (e) {
                    caminhoPrintSucesso = ''; 
                }

            } else if (conta.plataforma === 'GKWind') {
                // FLUXO GK WIND
                console.log("Acessando tela de login GK Wind...");
                await page.goto('https://gkwindbr.com/login/');
                await page.waitForTimeout(3000);

                console.log("Preenchendo credenciais GK Wind...");
                try {
                    const inputs = page.locator('input');
                    if (await inputs.count() >= 2) {
                        // Limpa os campos antes de preencher para evitar duplicação por autofill
                        await inputs.nth(0).click();
                        await page.keyboard.press('Control+A');
                        await page.keyboard.press('Backspace');
                        await inputs.nth(0).fill(conta.telefone);

                        await inputs.nth(1).click();
                        await page.keyboard.press('Control+A');
                        await page.keyboard.press('Backspace');
                        await inputs.nth(1).fill(conta.senha);
                    }
                    await page.waitForTimeout(1000);
                    
                    await page.getByRole('button', { name: 'Entrar' }).first().click({ timeout: 5000 });
                    await page.waitForTimeout(4000);

                    // Verifica se houve erro de login
                    const erroLogin = page.getByText(/E-mail ou senha inválidos/i);
                    if (await erroLogin.isVisible({ timeout: 2000 })) {
                        console.log(`🚨 Erro de login na GK Wind (${conta.nome}): E-mail ou senha inválidos.`);
                        // Tenta fechar o modal de erro para não travar
                        try { await page.getByRole('button', { name: /Ok|Confirmar/i }).click(); } catch(e) {}
                        continue; // Pula para a próxima conta
                    }

                } catch (e) {
                    console.log("Aviso: Falha no login automático GK Wind:", e.message);
                }

                console.log("Aguardando comunicado de login...");
                try {
                    // Clicando no botão de fechar do comunicado (X ou Fechar)
                    // O botão geralmente é uma div ou botão com texto "Fechar" ou um ícone de fechar
                    const btnFechar = page.locator('button:has-text("Fechar"), .close-btn, [aria-label="Close"]').first();
                    await btnFechar.waitFor({ state: 'visible', timeout: 8000 });
                    await btnFechar.click(); 
                    console.log("Comunicado fechado.");
                    await page.waitForTimeout(1500);
                } catch(e) {
                    console.log("Nenhum comunicado encontrado ou já fechado.");
                }

                // DEFESA: Se ele foi para uma página em branco ou artigo por clique acidental, nós forçamos a volta
                try {
                    await page.getByText(/Check-in Diário/i).first().waitFor({ state: 'visible', timeout: 3000 });
                } catch (e) {
                    console.log("Redirecionamento acidental detectado! Forçando retorno para a página inicial...");
                    await page.goto('https://gkwindbr.com/');
                    await page.waitForTimeout(4000);
                    try { await page.getByRole('button', { name: 'Fechar' }).click({ timeout: 2000 }); } catch(err) {}
                }

                console.log("Acessando Check-in Diário GK Wind...");
                try {
                    await page.goto('https://gkwindbr.com/checkin/');
                    await page.waitForTimeout(3000);

                    console.log("Tentando clicar no botão 'Fazer Check-in Agora'...");
                    const btnCheckin = page.getByRole('button', { name: 'Fazer Check-in Agora' }).first();
                    if (await btnCheckin.isVisible({ timeout: 5000 })) {
                        await btnCheckin.click();
                        await page.waitForTimeout(2000);
                        try {
                            await page.getByRole('button', { name: /Confirmar/i }).first().click({ timeout: 3000 });
                            await page.waitForTimeout(1000);
                        } catch(e) {}
                        contadorTarefas++;
                        console.log("  -> Check-in GK Wind realizado com sucesso!");
                    } else {
                        console.log("  -> Botão de check-in não visível. Provavelmente já feito hoje.");
                    }
                } catch(e) {
                    console.log("Aviso: Falha na etapa de Check-in GK Wind:", e.message);
                }

                console.log("Acessando Perfil...");
                try {
                    try {
                        // Tentando como 'link' que é muito mais preciso para abas inferiores
                        await page.getByRole('link', { name: 'Perfil' }).first().click({ timeout: 4000 });
                    } catch (e) {
                        console.log("Tentando voltar para acessar o Perfil...");
                        try { await page.locator('i').first().click({ timeout: 2000 }); } catch(err) { await page.goBack(); }
                        await page.waitForTimeout(2000);
                        await page.getByRole('link', { name: 'Perfil' }).first().click({ timeout: 5000 });
                    }
                    await page.waitForTimeout(3000);

                    console.log("Capturando Saldo Total...");
                    const bodyText = await page.innerText('body');
                    const match = bodyText.match(/([\d.,]+)\s*Saldo Total|Saldo Total[\s:R$]*([\d.,]+)/i);
                    if (match) {
                        carteiraReceita = match[1] || match[2];
                    } else {
                        // Fallback que busca o elemento irmão
                        const saldoTxt = await page.locator('div').filter({ hasText: /^Saldo Total$/ }).locator('xpath=preceding-sibling::div').innerText();
                        carteiraReceita = saldoTxt.replace(/[^0-9.,]/g, '').trim();
                    }
                    console.log(`Saldo capturado GK Wind: ${carteiraReceita}`);
                } catch(e) {
                    console.log("Falha ao acessar Perfil ou capturar Saldo.", e.message);
                }

                try {
                    caminhoPrintSucesso = `sucesso_${conta.nome}.png`;
                    await page.screenshot({ path: caminhoPrintSucesso, fullPage: true });
                    console.log(`Print de sucesso salvo como ${caminhoPrintSucesso}`);
                } catch (e) {
                    caminhoPrintSucesso = ''; 
                }

            } else if (conta.plataforma === 'Arla') {
                // FLUXO ARLA
                console.log("Acessando tela de login Arla...");
                await page.goto('https://arlavt.com/m/login');
                await page.waitForTimeout(3000);

                console.log("Preenchendo credenciais Arla...");
                try {
                    const inputs = page.locator('input');
                    if (await inputs.count() >= 2) {
                        // Limpa campos
                        await inputs.nth(0).fill('');
                        await inputs.nth(0).fill(conta.telefone);
                        await inputs.nth(1).fill('');
                        await inputs.nth(1).fill(conta.senha);
                    }
                    await page.waitForTimeout(1000);
                    
                    const btnLogin = page.locator('button:has-text("Entrar"), button:has-text("Login"), .van-button').first();
                    await btnLogin.click();
                    await page.waitForTimeout(5000);
                } catch (e) {
                    console.log("Aviso: Falha no preenchimento de login Arla.");
                }

                // 1. Fechar comunicados (Notificação do sistema)
                console.log("Fechando comunicados Arla...");
                try {
                    // O seletor .van-dialog__confirm é o padrão para botões "confirme" em diálogos Vant
                    const btnConfirme = page.locator('.van-dialog__confirm, button:has-text("confirme")').first();
                    if (await btnConfirme.isVisible({ timeout: 10000 })) {
                        await btnConfirme.click();
                        console.log("Comunicado Arla fechado.");
                        await page.waitForTimeout(2000);
                    }
                    
                    // Espera o overlay desaparecer para evitar bloqueio de clique
                    try {
                        await page.waitForSelector('.van-overlay', { state: 'hidden', timeout: 5000 });
                    } catch(e) {
                        console.log("Aviso: Overlay ainda presente ou não encontrado.");
                    }
                } catch (e) {
                    console.log("Erro ao fechar comunicados Arla:", e.message);
                }

                // 2. Menu Fazenda e Alimentação
                try {
                    console.log("Indo para Fazenda...");
                    await page.getByText('fazenda').click();
                    await page.waitForTimeout(3000);

                    console.log("Clicando em Alimentação (1)...");
                    await page.getByRole('button', { name: 'Alimentação' }).first().click();
                    await page.waitForTimeout(3000);

                    console.log("Clicando em Alimentação (2)...");
                    await page.getByRole('button', { name: 'Alimentação' }).first().click();
                    await page.waitForTimeout(3000);
                    
                    console.log("Confirmando ação de alimentação...");
                    await page.getByRole('button', { name: 'confirme' }).click();
                    await page.waitForTimeout(2000);

                    contadorTarefas++;
                    console.log("  -> Tarefa de Alimentação concluída!");
                } catch (e) {
                    console.log("Aviso: Falha na tarefa de Alimentação Arla:", e.message);
                }

                // 3. Check-in Diário
                try {
                    console.log("Indo para o perfil via URL...");
                    await page.goto('https://arlavt.com/m/user/index');
                    await page.waitForTimeout(3000);

                    console.log("Acessando área de Check-in...");
                    await page.getByRole('button', { name: 'Faça login' }).click();
                    await page.waitForTimeout(3000);

                    console.log("Realizando Check-in...");
                    await page.getByRole('button', { name: 'Clique para fazer login' }).click();
                    await page.waitForTimeout(3000);
                    contadorTarefas++;
                    console.log("  -> Check-in realizado!");
                } catch (e) {
                    console.log("Aviso: Falha no Check-in Arla:", e.message);
                }

                // 4. Captura de Saldo e Print
                try {
                    console.log("Acessando o perfil via URL para capturar saldo...");
                    await page.goto('https://arlavt.com/m/user/index');
                    await page.waitForTimeout(4000);

                    caminhoPrintSucesso = `sucesso_${conta.nome}.png`;
                    await page.screenshot({ path: caminhoPrintSucesso, fullPage: true });

                    const bodyText = await page.innerText('body');
                    const match = bodyText.match(/GTQ\s*([\d.,]+)/i);
                    if (match) {
                        carteiraReceita = match[1];
                    } else {
                        const locSaldo = page.getByText(/GTQ\s*[\d.,]+/).first();
                        const texto = await locSaldo.innerText();
                        carteiraReceita = texto.replace(/GTQ/i, '').trim();
                    }
                    console.log(`Saldo capturado Arla: ${carteiraReceita}`);
                } catch (e) {
                    console.log("Aviso: Falha ao capturar saldo ou print Arla:", e.message);
                }

            } else {
                // FLUXO ROYAL AURUM
                console.log("Acessando tela de login Royal Aurum...");
                await page.goto('https://royalaurum0931.com/login');
                await page.waitForTimeout(3000);

                console.log("Preenchendo credenciais...");
                await page.fill('input[placeholder="(11) 99999-9999"]', conta.telefone);
                await page.fill('input[placeholder="Senha"]', conta.senha);
                await page.waitForTimeout(1000);

                await page.locator('button:has-text("Entrar")').click();
                console.log("Comando de Entrar enviado.");

                await page.waitForTimeout(5000);

            // ==========================================
            // 3. VERIFICAR COMUNICADOS
            // ==========================================

                console.log("Verificando se há comunicados especiais (Ver detalhes)...");
                try {
                    const botaoDetalhes = page.getByRole('button', { name: 'Ver detalhes' });
                    await botaoDetalhes.waitFor({ state: 'visible', timeout: 2000 });
                    
                    console.log("Aviso especial detectado! Clicando em 'Ver detalhes'...");
                    await botaoDetalhes.click();

                    console.log("Aguardando liberação do botão 'Voltar' (aprox. 10s)...");
                    const botaoVoltar = page.getByRole('button', { name: 'Voltar' });
                    await botaoVoltar.waitFor({ state: 'visible', timeout: 10000 });
                    await botaoVoltar.click();
                    
                    console.log("Retornou do aviso especial com sucesso.");
                    await page.waitForTimeout(2000);
                } catch (e) {
                    console.log("Nenhum aviso especial encontrado. Seguindo...");
                }

                console.log("Verificando se há comunicados normais na tela...");
                let comunicadosFechados = 0;
                while (true) {
                    try {
                        const botaoFechar = page.locator('.close').first();
                        await botaoFechar.waitFor({ state: 'visible', timeout: 4000 });
                        await botaoFechar.click({ force: true });
                        comunicadosFechados++;
                        console.log(`Comunicado #${comunicadosFechados} fechado.`);
                        await page.waitForTimeout(1500);
                    } catch (e) {
                        if (comunicadosFechados > 0) {
                            console.log(`Total de comunicados fechados: ${comunicadosFechados}. Seguindo...`);
                        } else {
                            console.log("Nenhum comunicado normal encontrado. Seguindo...");
                        }
                        break;
                    }
                }

            
            // ==========================================
            // 4. ROTINA DE TAREFAS (SEU LOOP)
            // ==========================================


                console.log("Iniciando rotina de tarefas...");
                await page.click('a:has-text("Tarefa")');
                await page.waitForTimeout(2000);

                let temTarefa = true;
                let falhasConsecutivas = 0;

                while (temTarefa) {
                    let botaoEnviar;
                    try {
                        botaoEnviar = page.locator('button:has-text("Iniciar Tarefa")').first();
                        await botaoEnviar.waitFor({ state: 'visible', timeout: 5000 });
                    } catch (e) {
                        console.log(`Fim natural das tarefas. Total concluído: ${contadorTarefas}`);
                        temTarefa = false;
                        falhasConsecutivas = 0;
                        break;
                    }

                    try {
                        console.log(`Processando tarefa #${contadorTarefas + 1}...`);
                        await botaoEnviar.click();
                        
                        await page.locator('button[aria-label="5 estrelas"]').waitFor({ state: 'visible', timeout: 15000 });
                        await page.locator('button[aria-label="5 estrelas"]').click({ force: true });
                        await page.waitForTimeout(1000);
                        
                        await page.locator('button:has-text("Receber Recompensa")').first().click();
                        await page.waitForTimeout(3000);
                        
                        try {
                            await page.locator('button:has-text("Confirmar")').first().click({ timeout: 2000 });
                            await page.waitForTimeout(1000);
                        } catch(e) {}

                        contadorTarefas++;
                        falhasConsecutivas = 0;
                        console.log(`  -> Tarefa #${contadorTarefas} concluída com sucesso!`);
                    } catch (e) {
                        falhasConsecutivas++;
                        console.log(`⚠️ Falha na execução da tarefa (Possível vídeo travado). Tentativa ${falhasConsecutivas} de 2.`);

                        if (falhasConsecutivas >= 2) {
                            throw new Error('Falha ao concluir a tarefa após 2 tentativas. Travamento detectado.');
                        } else {
                            console.log("Forçando retorno para a tela inicial para tentar novamente...");
                            await page.goto('https://royalaurum0931.com/'); 
                            await page.waitForTimeout(4000);
                            
                            try { await page.locator('.close').first().click({ timeout: 2000, force: true }); } catch(err) {}
                            
                            await page.click('a:has-text("Tarefa")');
                            await page.waitForTimeout(3000);
                        }
                    }
                }

                try {
                    caminhoPrintSucesso = `sucesso_${conta.nome}.png`;
                    await page.screenshot({ path: caminhoPrintSucesso, fullPage: true });
                    console.log(`Print de sucesso salvo como ${caminhoPrintSucesso}`);
                } catch (e) {
                    console.log('Não foi possível tirar o print da tela de sucesso.');
                    caminhoPrintSucesso = '';
                }

            // ==========================================
            // 5. CAPTURAR O SALDO NA "MINHA ÁREA"
            // ==========================================
                console.log("Navegando de volta para a Home para capturar o saldo...");
                await page.goto('https://royalaurum0931.com/');
                await page.waitForTimeout(4000);

                try { await page.locator('.close').first().click({ timeout: 2000, force: true }); } catch(err) {}

                console.log("Indo para 'Minha área'...");
                try { await page.click('text="Minha área"'); } catch(e) {}
                await page.waitForTimeout(3000);

                const locSaldo = page.locator('div:has(span:has-text("Carteira de Receita")) > p').first();
                await locSaldo.waitFor({ state: 'visible', timeout: 10000 });

                const carteiraTexto = await locSaldo.innerText();
                carteiraReceita = carteiraTexto.replace(/[^0-9.,]/g, '').trim();
                console.log(`Saldo capturado: ${carteiraReceita}`);
            }

            relatorioFinal += `${conta.nome} - Tarefas: ${contadorTarefas} | Saldo: ${carteiraReceita}\n`;

            // Chama a função passando o contadorTarefas
            if (conta.email) {
                console.log(`Preparando envio de e-mail de status para ${conta.nome}...`);
                // Note que adicionamos a variável contadorTarefas e plataforma aqui na chamada
                await enviarEmailIndividual(conta.email, conta.nome, carteiraReceita, contadorTarefas, dataHoje, conta.plataforma);
            }

            const numeroEnvio = conta.telefoneWhatsApp || conta.telefone;
            if (conta.recebeWhatsApp) {
                console.log(`Preparando envio de WhatsApp de status para ${conta.nome}...`);
                await enviarWhatsApp(numeroEnvio, conta.nome, carteiraReceita, contadorTarefas, dataHoje, caminhoPrintSucesso, conta.plataforma);
            }

            // 3. LIMPEZA DO PRINT DE SUCESSO
            if (caminhoPrintSucesso && fs.existsSync(caminhoPrintSucesso)) {
                try {
                    fs.unlinkSync(caminhoPrintSucesso);
                } catch(e) {}
            }

        } catch (erro) {
            console.error(`Falha ao processar a conta de ${conta.nome} (${conta.telefone}):`, erro.message);
            relatorioFinal += `${conta.nome}: ERRO - ${erro.message}\n`;

            const caminhoPrint = `erro_${conta.nome}.png`;
            try {
                await page.screenshot({ path: caminhoPrint, fullPage: true });
                console.log(`Print de erro salvo como ${caminhoPrint}`);
            } catch (e) {
                console.log('Não foi possível tirar o print da tela.');
            }

            // 1. Envia o E-mail com o print
            if (conta.email) {
                console.log(`Preparando envio de e-mail de erro para ${conta.nome}...`);
                await enviarEmailErro(conta.email, conta.nome, dataHoje, caminhoPrint);
            }

            // 2. Envia o WhatsApp com o print
            const numeroEnvio = conta.telefoneWhatsApp || conta.telefone;
            if (conta.recebeWhatsApp) {
                console.log(`Preparando envio de WhatsApp de erro para ${conta.nome}...`);
                await enviarWhatsAppErro(numeroEnvio, conta.nome, dataHoje, caminhoPrint);
            }

            // 3. LIMPEZA: Agora apagamos a imagem apenas depois de mandar nos dois
            if (caminhoPrint && fs.existsSync(caminhoPrint)) {
                try {
                    fs.unlinkSync(caminhoPrint);
                } catch(e) {}
            }
            
        } finally {
            await context.close();
            console.log(`Conta de ${conta.nome} finalizada.\n`);
        }
    }

    await browser.close();

    // ==========================================
    // 6. ENVIAR E-MAIL FINAL E WHATSAPP FINAL
    // ==========================================
    console.log("Enviando e-mail com o relatório...");
    await enviarEmail(relatorioFinal, dataHoje);

    console.log("Enviando relatório final via WhatsApp para o Administrador...");
    try {
        const state = await client.getState();
        if (state === 'CONNECTED') {
            const numeroAdmin = '5519995487421@c.us'; // O seu número configurado
            await client.sendMessage(numeroAdmin, `*Relatório Diário (${dataHoje})*\n\n${relatorioFinal}`);
            console.log("Relatório final enviado pelo WhatsApp com sucesso!");
        } else {
            console.error(`Atenção: A conexão do WhatsApp não está pronta. Status atual: ${state}`);
        }
    } catch (e) {
        console.error("Falha ao enviar relatório final pelo WhatsApp:");
        console.error(e);
    }

    // ==========================================
    // 6.5. SINAL DE VIDA (HEALTHCHECKS)
    // ==========================================
    console.log("Enviando sinal de vida para o monitor de infraestrutura...");
    try {
        // Substitua pela SUA URL do Healthchecks
        https.get('https://hc-ping.com/8f2163b8-0ff5-4acb-83ec-60960288a0d4', (res) => {
            console.log(`Sinal de vida recebido pelo servidor. Status: ${res.statusCode}`);
        }).on('error', (e) => {
            console.error('Erro de rede ao pingar o Healthchecks:', e.message);
        });
    } catch (e) {
        console.error("Falha ao executar o ping:", e.message);
    }

    // ==========================================
    // 7. FINALIZAÇÃO
    // ==========================================
    console.log('Aguardando 5 segundos para a rede processar as mensagens do WhatsApp...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('\nFechando sessão do WhatsApp...');
    await client.destroy();

    // ==========================================
    // 8. DESLIGAR A MÁQUINA AWS (WINDOWS)
    // ==========================================
    if (process.env.AUTO_SHUTDOWN === 'true') {
        console.log('Robo finalizado. Desligando a máquina AWS em 10 segundos...');
        setTimeout(() => {
            // Comando para Windows: /s (shutdown), /f (force), /t 10 (timeout de 10 segundos)
            exec('shutdown /s /f /t 10', (err) => {
                if (err) console.error('Erro ao desligar a máquina:', err.message);
                else console.log('Comando de desligamento enviado.');
            });
        }, 10000);
    } else {
        process.exit(0);
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
        });

        let opcoesEmail = {
            from: `"Robô de Ganhos" <${configuracaoEmail.usuario}>`,
            to: configuracaoEmail.usuario,
            subject: `Automação Concluída - Relatório de Contas (${dataHoje})`,
            text: conteudo
        };

        if (fs.existsSync('log_sistema.txt')) {
            opcoesEmail.attachments = [
                {
                    filename: 'log_sistema.txt',
                    path: './log_sistema.txt'
                }
            ];
        }

        let info = await transporter.sendMail(opcoesEmail);
        console.log("E-mail final enviado com sucesso! ID:", info.messageId);

        // Deleta o log após o envio bem-sucedido (atendendo ao pedido do usuário)
        if (fs.existsSync('log_sistema.txt')) {
            try {
                fs.unlinkSync('log_sistema.txt');
                console.log("Arquivo log_sistema.txt excluído após envio do e-mail.");
            } catch (e) {
                console.error("Erro ao excluir log_sistema.txt:", e.message);
            }
        }
    } catch (erro) {
        console.error("Falha ao enviar e-mail final:", erro.message);
    }
}

async function enviarEmailIndividual(emailDestino, nome, saldo, qtdTarefas, dataHoje, plataforma) {
    try {
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: configuracaoEmail.usuario,
                pass: configuracaoEmail.senhaApp
            }
        });

        let assunto = '';
        let conteudo = '';
        const nomePlataforma = plataforma === 'VLM' ? 'VLM' : (plataforma === 'Signet' ? 'Signet' : (plataforma === 'GKWind' ? 'GK Wind' : (plataforma === 'Arla' ? 'Arla' : 'Royal Aurum')));

        // Verifica se fez tarefas ou se já estavam concluídas
        if (qtdTarefas > 0) {
            assunto = `Sucesso: Tarefas Concluídas (${nomePlataforma}) - ${dataHoje}`;
            conteudo = `Olá, ${nome}!\n\nO robô concluiu ${qtdTarefas} tarefa(s) na plataforma ${nomePlataforma} hoje (${dataHoje}).\n\nSeu saldo atualizado é: ${saldo}\n\nAtenciosamente,\nRobô de Tarefas SP`;
        } else {
            assunto = `Aviso: Sem Tarefas Pendentes (${nomePlataforma}) - ${dataHoje}`;
            conteudo = `Olá, ${nome}!\n\nO robô acessou sua conta na plataforma ${nomePlataforma} hoje (${dataHoje}), mas as tarefas já estavam concluídas.\n\nMesmo assim, capturamos seu saldo atual: ${saldo}\n\nAtenciosamente,\nRobô de Tarefas SP`;
        }

        await transporter.sendMail({
            from: `"Robô de Tarefas" <${configuracaoEmail.usuario}>`,
            to: emailDestino,
            subject: assunto,
            text: conteudo
        });

        console.log(` -> E-mail de status (Tarefas: ${qtdTarefas}) enviado para ${nome} com sucesso!`);
    } catch (erro) {
        console.error(` -> Falha ao enviar e-mail de status para ${nome}:`, erro.message);
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
        });

        let assunto = `Aviso Urgente: Falha de Acesso - ${dataHoje}`;
        let conteudo = `Olá, ${nome}!\n\nO robô tentou acessar sua conta hoje (${dataHoje}), mas encontrou um erro e não conseguiu finalizar o processo.\n\nVeja a imagem em anexo para entender em qual tela o robô travou. Isso pode ajudar a identificar se foi uma instabilidade no site ou um pop-up inesperado.\n\nVerifique a conta quando puder.\n\nAtenciosamente,\nRobô de Tarefas SP`;

        let opcoesEmail = {
            from: `"Robô de Tarefas" <${configuracaoEmail.usuario}>`,
            to: emailDestino,
            subject: assunto,
            text: conteudo
        };

        // Se o print foi gerado com sucesso, anexa ao e-mail
        if (caminhoPrint && fs.existsSync(caminhoPrint)) {
            opcoesEmail.attachments = [
                {
                    filename: `Erro_${nome}.png`,
                    path: `./${caminhoPrint}`
                }
            ];
        }

        await transporter.sendMail(opcoesEmail);
        console.log(` -> E-mail de ERRO com print enviado para ${nome} com sucesso!`);

    } catch (erro) {
        console.error(` -> Falha ao enviar e-mail de erro para ${nome}:`, erro.message);
    }
}

async function enviarWhatsApp(numero, nome, saldo, qtdTarefas, dataHoje, caminhoPrintSucesso, plataforma) {
    try {
        const numeroDestino = `55${numero}@c.us`;
        let mensagem = '';
        const nomePlataforma = plataforma === 'VLM' ? 'VLM' : (plataforma === 'Signet' ? 'Signet' : (plataforma === 'GKWind' ? 'GK Wind' : (plataforma === 'Arla' ? 'Arla' : 'Royal Aurum')));

        if (qtdTarefas > 0) {
            mensagem = `Olá, ${nome}! ✅\nO robô concluiu ${qtdTarefas} tarefa(s) na plataforma *${nomePlataforma}* com sucesso hoje (${dataHoje}).\nSaldo atualizado: ${saldo}`;
        } else {
            mensagem = `Olá, ${nome}! ℹ️\nO robô acessou sua conta na plataforma *${nomePlataforma}* hoje (${dataHoje}), mas as tarefas já estavam concluídas.\nSaldo atual: ${saldo}`;
        }

        if (caminhoPrintSucesso && fs.existsSync(caminhoPrintSucesso)) {
            const media = MessageMedia.fromFilePath(caminhoPrintSucesso);
            await client.sendMessage(numeroDestino, media, { caption: mensagem });
        } else {
            await client.sendMessage(numeroDestino, mensagem);
        }
        console.log(` -> WhatsApp de status (Tarefas: ${qtdTarefas}) enviado para ${nome} com sucesso!`);
    } catch (erro) {
        console.error(` -> Falha ao enviar WhatsApp de status para ${nome}:`, erro.message);
    }
}

async function enviarWhatsAppErro(numero, nome, dataHoje, caminhoPrint) {
    try {
        const numeroDestino = `55${numero}@c.us`;
        const mensagem = `⚠️ *Aviso Urgente: Falha de Acesso* ⚠️\n\nOlá, ${nome}!\nO robô tentou acessar sua conta hoje (${dataHoje}) e encontrou um erro, não sendo possível concluir as tarefas.\n\nVeja o print da tela no momento do erro abaixo.`;
        
        // Verifica se a foto existe. Se existir, envia a foto com o texto embaixo (caption).
        if (caminhoPrint && fs.existsSync(caminhoPrint)) {
            const media = MessageMedia.fromFilePath(caminhoPrint);
            await client.sendMessage(numeroDestino, media, { caption: mensagem });
        } else {
            // Se por algum motivo a foto não existir, envia apenas o texto.
            await client.sendMessage(numeroDestino, mensagem);
        }
        
        console.log(` -> WhatsApp de ERRO (com imagem) enviado para ${nome} com sucesso!`);
    } catch (erro) {
        console.error(` -> Falha ao enviar WhatsApp de erro para ${nome}:`, erro.message);
    }
}
