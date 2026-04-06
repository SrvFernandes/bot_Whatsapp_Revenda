@echo off
cd /d C:\Projetos\Bot_whatsapp
start cmd /k "node src/server.js"
timeout /t 3 /nobreak >nul
start http://localhost:3000
