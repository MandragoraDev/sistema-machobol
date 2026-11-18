@echo off
rem Levanta MACHOBOL (API, Rasa, acciones y panel). Doble clic, o desde una terminal: iniciar.cmd [-Recarga]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar.ps1" %*
