@echo off
echo %date% %time% - Script de boot iniciado. > log_sistema.txt
echo Aguardando 15 segundos para a rede da AWS conectar...
timeout /t 15 >> log_sistema.txt 2>&1

:: Força o terminal a abrir na pasta correta do seu projeto
cd /d C:\Users\Administrator\Desktop\RoboTarefas
if errorlevel 1 (
  echo %date% %time% - ERRO: Nao foi possivel acessar a pasta do projeto. >> log_sistema.txt
  exit /b 1
)

echo %date% %time% - Tentando baixar atualizacoes do GitHub... >> log_sistema.txt
echo =======================================================
echo Buscando atualizacoes de codigo no GitHub...
echo =======================================================

:: Limpa mudancas locais para evitar conflitos no pull em arquivos atualizados pelo GitHub
echo %date% %time% - Executando git reset... >> log_sistema.txt
git reset --hard HEAD >> log_sistema.txt 2>&1
echo %date% %time% - Executando git pull... >> log_sistema.txt
git pull origin master >> log_sistema.txt 2>&1
echo.

echo Instalando/Atualizando dependencias...
echo %date% %time% - Executando npm install... >> log_sistema.txt
call npm install >> log_sistema.txt 2>&1
echo.

echo =======================================================
echo Iniciando o Robo de Tarefas e a API...
echo =======================================================
echo %date% %time% - Aguardando antes de iniciar API... >> log_sistema.txt
timeout /t 60 >> log_sistema.txt 2>&1

:: O comando set abaixo substitui a necessidade de colocar no arquivo .env
set AUTO_SHUTDOWN=true
set ROBOT_API_HOST=0.0.0.0

:: Comando atualizado para iniciar a API que o Netlify vai escutar
echo %date% %time% - Iniciando npm run api... >> log_sistema.txt
npm run api >> log_sistema.txt 2>&1