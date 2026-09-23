@echo off
REM Print2Go Edge Agent — installer / first-run (Windows). No Python required if using the .exe.
SETLOCAL
SET HERE=%~dp0
IF NOT EXIST "%HERE%logs" mkdir "%HERE%logs"
IF NOT EXIST "%HERE%config.json" copy "%HERE%config.template.json" "%HERE%config.json" >nul
echo Print2Go Edge Agent installed to %HERE%
echo Starting first-run setup (you will be asked for SaaS URL + registration token)...
"%HERE%Print2GoEdgeAgent.exe"
ENDLOCAL
