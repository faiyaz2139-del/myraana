@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Print2Go Connector - Setup
cd /d "%~dp0"

echo(
echo ==================================================
echo    Print2Go Connector - Setup
echo ==================================================
echo(
echo This links this shop computer to Print2Go.
echo No separate downloads are needed - everything is included.
echo(

REM --- 1) Prepare the Print2Go runtime (bundled Python, no install needed) ---
if not exist "runtime\python.exe" (
  echo [1 of 4] Preparing the Print2Go runtime...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force 'python-embed-amd64.zip' 'runtime'" 1>nul 2>nul
  if not exist "runtime\python.exe" (
    echo(
    echo ERROR: Could not prepare the runtime. Please right-click this file
    echo and choose "Run as administrator", then try again.
    echo(
    pause
    exit /b 1
  )
  REM Enable site so we can install the small components below.
  for %%F in (runtime\python*._pth) do (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-Content '%%F') -replace '#\s*import site','import site' | Set-Content '%%F'" 1>nul 2>nul
  )
)

REM --- 2) Install bundled components once (offline, from the wheels folder) ---
if not exist "runtime\Lib\site-packages\requests" (
  echo [2 of 4] Installing components ^(one time^)...
  "runtime\python.exe" get-pip.py --no-warn-script-location 1>nul 2>nul
  "runtime\python.exe" -m pip install --no-index --find-links wheels requests cryptography --no-warn-script-location 1>nul 2>nul
)

REM --- 3) Pairing code -> config.json (auto-fills cloud URL + printer defaults) ---
if exist "config.json" goto have_config
echo [3 of 4] Let's connect this shop to Print2Go.
echo(
echo Open the "Connect my shop" page in Print2Go and click "Get pairing code".
echo(
set "PAIR="
set /p "PAIR=Paste the pairing code here and press Enter: "
if "!PAIR!"=="" (
  echo(
  echo No code entered. You can run this installer again anytime to enter it.
  echo(
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-Content 'config.template.json' -Raw | ConvertFrom-Json; $c.enrollment_token = '!PAIR!'; ($c | ConvertTo-Json -Depth 8) | Set-Content 'config.json' -Encoding ASCII" 1>nul 2>nul
echo Saved.
:have_config

REM --- 4) Start automatically every time the computer turns on ---
echo [4 of 4] Setting Print2Go to start automatically on login...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w = New-Object -ComObject WScript.Shell; $lnk = $w.CreateShortcut(Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\Print2Go Connector.lnk'); $lnk.TargetPath = 'wscript.exe'; $lnk.Arguments = '\"%CD%\start-hidden.vbs\"'; $lnk.WorkingDirectory = '%CD%'; $lnk.Description = 'Print2Go Connector'; $lnk.Save()" 1>nul 2>nul

echo(
echo ==================================================
echo    All set!
echo ==================================================
echo Print2Go Connector is installed and will start
echo automatically each time this computer turns on.
echo(
echo Starting it now...
start "" wscript.exe "%CD%\start-hidden.vbs"
echo(
echo You can close this window. Go back to the "Connect my shop"
echo page - it will show "connected" within about a minute.
echo(
pause
endlocal
