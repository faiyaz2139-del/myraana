@echo off
REM Run the READ-ONLY discovery diagnostic and write reports into .\logs\
SET HERE=%~dp0
"%HERE%Print2GoEdgeDiagnostic.exe"
echo Reports written to %HERE%logs\P2G_LONDON_DISCOVERY_REPORT.json and .md
pause
