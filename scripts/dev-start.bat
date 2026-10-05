@echo off
:: Kitsuden - Script de inicio para DESARROLLO
:: Ejecuta: dev-start.bat

cd /d "%~dp0\.."
powershell -ExecutionPolicy Bypass -File .\scripts\dev-start-simple.ps1
pause
