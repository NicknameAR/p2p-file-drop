@echo off
chcp 65001 >nul

start "" wscript "%~dp0start_backend.vbs"
timeout /t 3 /nobreak >nul

start "" wscript "%~dp0start_frontend.vbs"
timeout /t 4 /nobreak >nul

start http://localhost:5173
exit