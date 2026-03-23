
const { chromium } = require('playwright');
const nodemailer = require('nodemailer');
const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const qrcode = require('qrcode');
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
    try {
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
                <h2>WhatsApp Desconectado!</h2>
                <p>O robô perdeu a conexão com o WhatsApp. Por favor, leia o QR Code abaixo para reconectar:</p>
                <img src="${qrBase64}" alt="QR Code WhatsApp" />
            `
        });
        console.log('QR Code enviado por e-mail para reconexão.');
    } catch (err) {
        console.error('Falha ao gerar ou enviar o QR code por e-mail:', err);
    }
});

client.on('ready', () => {
    console.log('Cliente WhatsApp está pronto!');
    executarAutomacao();
});

client.initialize();

// ==========================================
// 1. CONFIGURAÇÕES testar: true
// ==========================================
const contas = [
    { nome: 'Jaqueline', telefone: '19971673522', senha: 'Pagy2015', recebeWhatsApp: false, testar: true },
    { nome: 'Karen', telefone: '19996722502', senha: 'Vixx140814', email: 'karensgodoy93@gmail.com', recebeWhatsApp: true},
    { nome: 'Gonzalo', telefone: '1931997599', senha: 'Pagy2015', recebeWhatsApp: true},
    { nome: 'Magaly', telefone: '19971691705', senha: 'Andrea1993_!', recebeWhatsApp: true},
    { nome: 'Daniel', telefone: '19998185339', senha: '@bt3RWqUTy.qi', recebeWhatsApp: true, telefoneWhatsApp: '19995487421'},
    { nome: 'Devania', telefone: '19992509897', senha: 'Vixx140814', email: 'devaniaekaren@gmail.com', recebeWhatsApp: true },
    { nome: 'Daniel Prieto', telefone: '993940008', senha: 'DSP199s.', recebeWhatsApp: true, telefoneWhatsApp: '19998185339' }
];

const configuracaoEmail = {
    usuario: 'patricksud96@gmail.com',
    senhaApp: 'wzbv amfm etxh zyyi'
};

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
            console.log("Acessando tela de login...");
            await page.goto('https://sp4567.com/#/log');
            await page.waitForTimeout(3000);

            console.log("Preenchendo credenciais...");
            await page.fill('input[type="text"].van-field__control', conta.telefone);
            await page.fill('input[type="password"].van-field__control', conta.senha);
            await page.waitForTimeout(1000);

            await page.keyboard.press('Tab');
            await page.keyboard.press('Tab');
            await page.keyboard.press('Enter');
            console.log("Comando de Entrar enviado.");

            await page.waitForSelector('.van-tabbar', { timeout: 15000 });

            // ==========================================
            // 3. VERIFICAR COMUNICADOS
            // ==========================================

            console.log("Verificando se há comunicados especiais (Ver detalhes)...");
            
            // NOVO BLOCO: Trata o pop-up especial com atraso
            try {
                const botaoDetalhes = page.getByRole('button', { name: 'Ver detalhes' });
                // Espera até 5 segundos para ver se esse aviso aparece
                await botaoDetalhes.waitFor({ state: 'visible', timeout: 5000 });
                
                console.log("Aviso especial detectado! Clicando em 'Ver detalhes'...");
                await botaoDetalhes.click();

                console.log("Aguardando liberação do botão 'Voltar' (aprox. 10s)...");
                const botaoVoltar = page.getByRole('button', { name: 'Voltar' });
                // Colocamos 15s de timeout por segurança, já que o botão demora 10s para aparecer
                await botaoVoltar.waitFor({ state: 'visible', timeout: 10000 });
                await botaoVoltar.click();
                
                console.log("Retornou do aviso especial com sucesso.");
                await page.waitForTimeout(2000); // Pausa para a tela estabilizar
            } catch (e) {
                console.log("Nenhum aviso especial encontrado. Seguindo...");
            }

            // BLOCO ORIGINAL: Fecha os comunicados em loop
            console.log("Verificando se há comunicados normais na tela...");
            let comunicadosFechados = 0;
            // Loop: continua fechando enquanto houver botões '.close' visíveis
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

            // Clica no menu inferior para ir para as tarefas
            await page.click('text="Tarefa"');
            await page.waitForTimeout(2000);

            let temTarefa = true;
            let contadorTarefas = 0;
            let falhasConsecutivas = 0;

            while (temTarefa) {
                try {
                    const botaoEnviar = page.locator('text="Enviar"').first();
                    await botaoEnviar.waitFor({ state: 'visible', timeout: 5000 });

                    console.log(`Processando tarefa #${contadorTarefas + 1}...`);
                    await botaoEnviar.click();
                    
                    await page.getByRole('radio').nth(4).waitFor({ state: 'visible', timeout: 10000 });
                    await page.getByRole('radio').nth(4).click({ force: true });
                    await page.waitForTimeout(1000);
                    
                    await page.locator('text="Confirmar"').first().click();
                    await page.waitForTimeout(3000);

                    contadorTarefas++;
                    falhasConsecutivas = 0; // Reseta o contador de erros se deu sucesso
                    console.log(`  -> Tarefa #${contadorTarefas} concluída com sucesso!`);
                } catch (e) {
                    falhasConsecutivas++;
                    console.log(`⚠️ Falha na tarefa (Possível vídeo travado). Tentativa ${falhasConsecutivas} de 2.`);

                    if (falhasConsecutivas >= 2) {
                        console.log(`Fim das tarefas ou limite de erros atingido. Total: ${contadorTarefas}`);
                        temTarefa = false;
                    } else {
                        console.log("Forçando retorno para a tela inicial para tentar novamente...");
                        // Volta para a raiz do site para destravar da tela do vídeo
                        await page.goto('https://sp4567.com/#/index'); 
                        await page.waitForTimeout(4000);
                        
                        // Fecha possíveis comunicados que abrem ao voltar pra Home
                        try { await page.locator('.close').first().click({ timeout: 2000, force: true }); } catch(err) {}
                        
                        // Clica na aba Tarefas de novo
                        await page.click('text="Tarefa"');
                        await page.waitForTimeout(3000);
                    }
                }
            }

            // ==========================================
            // 5. CAPTURAR O SALDO NA "MINHA ÁREA"
            // ==========================================
            console.log("Navegando de volta para a Home para capturar o saldo...");
            await page.goto('https://sp4567.com/#/index'); // Garante que sai da tela de vídeo
            await page.waitForTimeout(4000);

            // Tenta fechar algum comunicado se aparecer
            try { await page.locator('.close').first().click({ timeout: 2000, force: true }); } catch(err) {}

            console.log("Indo para 'Minha área'...");
            await page.click('text="Minha área"');

            await page.getByText('Carteira de Receita(BRL)').waitFor({ state: 'visible', timeout: 10000 });

            // Lê o valor do <dd> adjacente ao <dt> que contém o rótulo
            const carteiraReceita = await page.locator('dt:has-text("Carteira de Receita(BRL)") + dd').innerText();
            console.log(`Saldo capturado: ${carteiraReceita}`);

            relatorioFinal += `${conta.nome} - Tarefas: ${contadorTarefas} | Saldo: ${carteiraReceita}\n`;

            // Chama a função passando o contadorTarefas
            if (conta.email) {
                console.log(`Preparando envio de e-mail de status para ${conta.nome}...`);
                // Note que adicionamos a variável contadorTarefas aqui na chamada
                await enviarEmailIndividual(conta.email, conta.nome, carteiraReceita, contadorTarefas, dataHoje);
            }

            const numeroEnvio = conta.telefoneWhatsApp || conta.telefone;
            if (conta.recebeWhatsApp) {
                console.log(`Preparando envio de WhatsApp de status para ${conta.nome}...`);
                await enviarWhatsApp(numeroEnvio, conta.nome, carteiraReceita, contadorTarefas, dataHoje);
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
    } catch (erro) {
        console.error("Falha ao enviar e-mail final:", erro.message);
    }
}

async function enviarEmailIndividual(emailDestino, nome, saldo, qtdTarefas, dataHoje) {
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

        // Verifica se fez tarefas ou se já estavam concluídas
        if (qtdTarefas > 0) {
            assunto = `Sucesso: Tarefas Concluídas - ${dataHoje}`;
            conteudo = `Olá, ${nome}!\n\nO robô concluiu ${qtdTarefas} tarefa(s) em sua conta hoje (${dataHoje}).\n\nSeu saldo atualizado é: ${saldo}\n\nAtenciosamente,\nRobô de Tarefas SP`;
        } else {
            assunto = `Aviso: Sem Tarefas Pendentes - ${dataHoje}`;
            conteudo = `Olá, ${nome}!\n\nO robô acessou sua conta hoje (${dataHoje}), mas as tarefas já estavam concluídas.\n\nMesmo assim, capturamos seu saldo atual: ${saldo}\n\nAtenciosamente,\nRobô de Tarefas SP`;
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

        // Limpeza: Apaga a imagem do servidor após o envio para não ocupar espaço
        // if (caminhoPrint && fs.existsSync(caminhoPrint)) {
        //     fs.unlinkSync(caminhoPrint);
        // }

    } catch (erro) {
        console.error(` -> Falha ao enviar e-mail de erro para ${nome}:`, erro.message);
    }
}

async function enviarWhatsApp(numero, nome, saldo, qtdTarefas, dataHoje) {
    try {
        const numeroDestino = `55${numero}@c.us`;
        let mensagem = '';

        if (qtdTarefas > 0) {
            mensagem = `Olá, ${nome}! ✅\nO robô concluiu ${qtdTarefas} tarefa(s) com sucesso hoje (${dataHoje}).\nSaldo atualizado: ${saldo}`;
        } else {
            mensagem = `Olá, ${nome}! ℹ️\nO robô acessou sua conta hoje (${dataHoje}), mas as tarefas já estavam concluídas.\nSaldo atual: ${saldo}`;
        }

        await client.sendMessage(numeroDestino, mensagem);
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
