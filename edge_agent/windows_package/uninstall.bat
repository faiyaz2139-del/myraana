@echo off
REM Uninstall: remove the Windows service (if installed) and local state.
SET HERE=%~dp0
where nssm >nul 2>nul && nssm remove P2GEdgeAgent confirm
echo Removing local secrets and state...
del /q "%HERE%agent.key" 2>nul
del /q "%HERE%secrets.enc" 2>nul
del /q "%HERE%executed_actions.json" 2>nul
echo Done. (config.json and logs kept — delete manually if desired.)
