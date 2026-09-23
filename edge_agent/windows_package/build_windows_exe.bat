@echo off
REM Build self-contained Windows executables with PyInstaller.
REM Run this ON A WINDOWS MACHINE (PyInstaller cannot cross-compile from Linux/macOS).
REM Requires Python 3.10+ once, only on the build machine — the produced .exe is standalone.
SETLOCAL
cd /d %~dp0..
python -m venv build_venv
call build_venv\Scripts\activate
pip install -r requirements.txt pyinstaller
pyinstaller --onefile --name Print2GoEdgeAgent agent.py
pyinstaller --onefile --name Print2GoEdgeDiagnostic diagnose.py
echo.
echo Built:
echo   dist\Print2GoEdgeAgent.exe
echo   dist\Print2GoEdgeDiagnostic.exe
echo Copy both .exe files into windows_package\ next to install.bat.
ENDLOCAL
