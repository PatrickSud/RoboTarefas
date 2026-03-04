require('dotenv').config();
const { chromium } = require('playwright');
const nodemailer = require('nodemailer');
const { exec }   = require('child_process');

// ==========================================
// 1. CONFIGURAÇÕES
// ==========================================
const contas = [
    { nome: process.env.CONTA_1_NOME, telefone: process.env.CONTA_1_TELEFONE, senha: process.env.CONTA_1_SENHA },
    { nome: process.env.CONTA_2_NOME, telefone: process.env.CONTA_2_TELEFONE, senha: process.env.CONTA_2_SENHA }
];

const configuracaoEmail = {
    usuario:   process.env.EMAIL_USUARIO,
    senhaApp:  process.env.EMAIL_SENHA_APP
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

        } catch (erro) {
            console.error(`Falha ao processar a conta de ${conta.nome} (${conta.telefone}):`, erro.message);
            relatorioFinal += `${conta.nome}: ERRO - ${erro.message}\n`;
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
    // 7. DESLIGAR A MÁQUINA AWS (apenas em produção)
    // ==========================================
    // Só executa se a variável AUTO_SHUTDOWN=true estiver definida.
    // Na EC2, defina isso no cron: AUTO_SHUTDOWN=true node index.js
    // Em desenvolvido local, não define a variável e a máquina não desliga.
    if (process.env.AUTO_SHUTDOWN === 'true') {
        console.log('\nRobo finalizado. Desligando a máquina AWS em 10 segundos...');
        setTimeout(() => {
            exec('sudo shutdown -h now', (err) => {
                if (err) console.error('Erro ao desligar a máquina:', err.message);
                else console.log('Comando de desligamento enviado.');
            });
        }, 10000); // 10s de margem para garantir que o e-mail foi enviado
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

executarAutomacao();