@echo off
echo Aguardando 30 segundos para a rede da AWS conectar...
timeout /t 30

cd /d "%~dp0"

echo %date% %time% - Tentando baixar atualizacoes do GitHub... > log_sistema.txt
echo =======================================================
echo Buscando atualizacoes de codigo no GitHub...
echo =======================================================

:: Limpa mudancas locais em arquivos de sistema para evitar conflitos no pull
git checkout package.json package-lock.json >> log_sistema.txt 2>&1
git pull origin master >> log_sistema.txt 2>&1
echo.

echo =======================================================
echo Iniciando o Robo de Tarefas em 3 minutos (180 segundos)
echo =======================================================
timeout /t 180

set AUTO_SHUTDOWN=true
npm start >> log_sistema.txt 2>&1