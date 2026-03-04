
const { chromium } = require('playwright');
const nodemailer = require('nodemailer');
const { exec }   = require('child_process');
const fs         = require('fs'); 

// ==========================================
// 1. CONFIGURAÇÕES
// ==========================================
const contas = [
    { nome: 'Jaqueline', telefone: '19971673522', senha: 'Pagy2015' },
    { nome: 'Karen', telefone: '19996722502', senha: 'Vixx140814', email: 'karensgodoy93@gmail.com' },
    { nome: 'Gonzalo', telefone: '1931997599', senha: 'Pagy2015' },
    { nome: 'Magaly', telefone: '19971691705', senha: 'Andrea1993_!', email: 'andrea.prieto220293@gmail.com' },
    { nome: 'Daniel',    telefone: '19998185339', senha: '@bt3RWqUTy.qi'},
    { nome: 'Devania',    telefone: '19992509897', senha: 'Vixx140814', email: 'devaniaekaren@gmail.com' },
    { nome: 'Daniel Prieto',    telefone: '993940008', senha: 'DSP199s.', email: 'daniel.prieto220293@gmail.com' }

];

const configuracaoEmail = {
    usuario:  'patricksud96@gmail.com',
    senhaApp: 'wzbv amfm etxh zyyi'
};

// ==========================================
// 2. FUNÇÃO PRINCIPAL DO ROBÔ
// ==========================================
async function executarAutomacao() {
    let relatorioFinal = "Relatório de Saldos das Contas:\n\n";
    const dataHoje = new Date().toLocaleDateString('pt-BR');

    const browser = await chromium.launch({ headless: false });

    for (const conta of contas) {
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

            console.log("Verificando se há comunicados na tela...");
            let comunicadosFechados = 0;
            // Loop: continua fechando enquanto houver botões '.close' visíveis
            while (true) {
                try {
                    const botaoFechar = page.locator('.close').first();
                    await botaoFechar.waitFor({ state: 'visible', timeout: 4000 });
                    // { force: true } necessário pois o botão é uma tag <i> (ícone),
                    // que pode ter pointer-events: none e falhar nas checagens de acionabilidade.
                    await botaoFechar.click({ force: true });
                    comunicadosFechados++;
                    console.log(`Comunicado #${comunicadosFechados} fechado.`);
                    // Pequena pausa para a animação de fechar terminar antes de checar o próximo
                    await page.waitForTimeout(1500);
                } catch (e) {
                    // Nenhum botão '.close' visível — todos os comunicados foram fechados
                    if (comunicadosFechados > 0) {
                        console.log(`Total de comunicados fechados: ${comunicadosFechados}. Seguindo...`);
                    } else {
                        console.log("Nenhum comunicado encontrado. Seguindo...");
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

            // O equivalente ao "Rótulo VerificarTarefas" e "Acessar VerificarTarefas"
            while (temTarefa) {
                try {
                    // Verifica se ainda existem tarefas (aguarda o botão 'Enviar' por 5s)
                    const botaoEnviar = page.locator('text="Enviar"').first();
                    await botaoEnviar.waitFor({ state: 'visible', timeout: 5000 });

                    console.log(`Processando tarefa #${contadorTarefas + 1}...`);

                    // 1. Clicar em 'Enviar'
                    await botaoEnviar.click();
                    console.log("  -> Clicou em 'Enviar'");

                    // 2. Aguardar o modal de avaliação aparecer (radio de estrelas)
                    await page.getByRole('radio').nth(4).waitFor({ state: 'visible', timeout: 10000 });

                    // 3. Selecionar 5 estrelas (radio index 4 = quinta opção = 5 estrelas)
                    await page.getByRole('radio').nth(4).click({ force: true });
                    console.log("  -> Selecionou 5 estrelas");

                    // 4. Aguardar 1 segundo para a seleção registrar
                    await page.waitForTimeout(1000);

                    // 5. Clicar em 'Confirmar'
                    await page.locator('text="Confirmar"').first().click();
                    console.log("  -> Clicou em 'Confirmar'");

                    // 6. Aguardar 3 segundos antes de recomeçar o ciclo
                    await page.waitForTimeout(3000);

                    contadorTarefas++;
                    console.log(`  -> Tarefa #${contadorTarefas} concluída com sucesso!`);
                } catch (e) {
                    // Se passar 3 segundos e ele não achar o botão "Enviar", cai aqui e sai do Loop
                    console.log(`Fim das tarefas. Total realizado: ${contadorTarefas}`);
                    temTarefa = false; 
                }
            }

            // ==========================================
            // 5. CAPTURAR O SALDO NA "MINHA ÁREA"
            // ==========================================

            // Recarrega a página para garantir que o saldo está atualizado após as tarefas
            console.log("Recarregando a página para atualizar o saldo...");
            await page.reload({ waitUntil: 'networkidle' });
            await page.waitForTimeout(5000);

            console.log("Indo para 'Minha área' para capturar saldo...");
            await page.click('text="Minha área"');

            // Aguarda o rótulo "Carteira de Receita(BRL)" aparecer na tela
            // O valor está numa tag <dd> (role=definition) logo após o <dt> com o rótulo
            await page.getByText('Carteira de Receita(BRL)').waitFor({ state: 'visible', timeout: 10000 });

            // Lê o valor do <dd> adjacente ao <dt> que contém o rótulo
            const carteiraReceita = await page.locator('dt:has-text("Carteira de Receita(BRL)") + dd').innerText();
            console.log(`Saldo capturado: ${carteiraReceita}`);

            relatorioFinal += `${conta.nome}: ${carteiraReceita}\n`;

            // Chama a função passando o contadorTarefas
            if (conta.email) {
                console.log(`Preparando envio de e-mail de status para ${conta.nome}...`);
                // Note que adicionamos a variável contadorTarefas aqui na chamada
                await enviarEmailIndividual(conta.email, conta.nome, carteiraReceita, contadorTarefas, dataHoje);
            }

        } catch (erro) {
            console.error(`Falha ao processar a conta de ${conta.nome} (${conta.telefone}):`, erro.message);
            relatorioFinal += `${conta.nome}: ERRO - ${erro.message}\n`;

            // NOVO: Tirar print da tela no exato momento do erro
            const caminhoPrint = `erro_${conta.nome}.png`;
            try {
                await page.screenshot({ path: caminhoPrint, fullPage: true });
                console.log(`Print de erro saved como ${caminhoPrint}`);
            } catch (e) {
                console.log('Não foi possível tirar o print da tela.');
            }

            // Disparo do e-mail de erro em caso de falha (agora enviando o print junto)
            if (conta.email) {
                console.log(`Preparando envio de e-mail de erro para ${conta.nome}...`);
                await enviarEmailErro(conta.email, conta.nome, dataHoje, caminhoPrint);
            }
            
        } finally {
            await context.close(); 
            console.log(`Conta de ${conta.nome} finalizada.\n`);
        }
    }

    await browser.close();

    // ==========================================
    // 6. ENVIAR E-MAIL FINAL
    // ==========================================
    console.log("Enviando e-mail com o relatório...");
    await enviarEmail(relatorioFinal, dataHoje);

    // ==========================================
    // 7. DESLIGAR A MÁQUINA AWS (WINDOWS)
    // ==========================================
    if (process.env.AUTO_SHUTDOWN === 'true') {
        console.log('\nRobo finalizado. Desligando a máquina AWS em 10 segundos...');
        setTimeout(() => {
            // Comando para Windows: /s (shutdown), /f (force), /t 10 (timeout de 10 segundos)
            exec('shutdown /s /f /t 10', (err) => {
                if (err) console.error('Erro ao desligar a máquina:', err.message);
                else console.log('Comando de desligamento enviado.');
            });
        }, 10000); 
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

        let info = await transporter.sendMail({
            from: `"Robô de Ganhos" <${configuracaoEmail.usuario}>`,
            to: configuracaoEmail.usuario,
            subject: `Automação Concluída - Relatório de Contas (${dataHoje})`,
            text: conteudo
        });

        console.log("E-mail enviado com sucesso! ID:", info.messageId);
    } catch (erro) {
        console.error("Falha ao enviar e-mail:", erro.message);
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
        let conteudo = `Olá, ${nome}!\n\nO robô tentou acessar sua conta hoje (${dataHoje}), mas encontrou um erro e não conseguiu finalizar o processo.\n\nVeja a imagem em anexo para entender em qual tela o robô travou. Isso pode ajudar a identificar se foi uma instabilidade no site ou um pop-up inesperado.\n\nAtenciosamente,\nRobô de Tarefas SP`;

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
        if (caminhoPrint && fs.existsSync(caminhoPrint)) {
            fs.unlinkSync(caminhoPrint);
        }

    } catch (erro) {
        console.error(` -> Falha ao enviar e-mail de erro para ${nome}:`, erro.message);
    }
}

executarAutomacao();