@echo off
cd C:\Users\Administrator\Desktop\RoboTarefas

echo =======================================================
echo Buscando atualizacoes de codigo no GitHub...
echo =======================================================
git pull origin main
echo.

echo =======================================================
echo Iniciando o Robo de Tarefas em 3 minutos (180 segundos)
echo =======================================================
timeout /t 180

set AUTO_SHUTDOWN=true
npm start