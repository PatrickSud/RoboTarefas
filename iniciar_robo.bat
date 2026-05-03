@echo off
echo Aguardando 15 segundos para a rede da AWS conectar...
timeout /t 15

:: Força o terminal a abrir na pasta correta do seu projeto
cd /d C:\Users\Administrator\Desktop\RoboTarefas

echo %date% %time% - Tentando baixar atualizacoes do GitHub... > log_sistema.txt
echo =======================================================
echo Buscando atualizacoes de codigo no GitHub...
echo =======================================================

:: Limpa mudancas locais para evitar conflitos no pull em arquivos atualizados pelo GitHub
git reset --hard HEAD >> log_sistema.txt 2>&1
git pull origin master >> log_sistema.txt 2>&1
echo.

echo Instalando/Atualizando dependencias...
call npm install >> log_sistema.txt 2>&1
echo.

echo =======================================================
echo Iniciando o Robo de Tarefas e a API...
echo =======================================================
timeout /t 60

:: O comando set abaixo substitui a necessidade de colocar no arquivo .env
set AUTO_SHUTDOWN=true

:: Comando atualizado para iniciar a API que o Netlify vai escutar
npm run api >> log_sistema.txt 2>&1