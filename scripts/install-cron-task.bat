@echo off
REM OpenCode Upstream Sync - Scheduled Task Setup
REM Run this as Administrator to enable automatic daily sync

set REPO_PATH=C:\Users\husai\Documents\GitHub\opencode-fork
set SCRIPT_PATH=%REPO_PATH%\scripts\sync-upstream.ps1
set TASK_NAME=OpenCode-Upstream-Sync

echo Creating scheduled task: %TASK_NAME%
echo Schedule: Daily at 2:00 AM
echo Script: %SCRIPT_PATH%
echo.

REM Remove existing task
schtasks /End /TN "%TASK_NAME%" 2>nul
schtasks /Delete /TN "%TASK_NAME%" /F 2>nul

REM Create new task
schtasks /Create /TN "%TASK_NAME%" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%SCRIPT_PATH%\"" /SC DAILY /ST 02:00 /RL HIGHEST /F

if %ERRORLEVEL% equ 0 (
    echo.
    echo SUCCESS: Task created!
    echo.
    echo Commands:
    echo   Query:  schtasks /Query /TN "%TASK_NAME%"
    echo   Run:    schtasks /Run /TN "%TASK_NAME%"
    echo   Delete: schtasks /Delete /TN "%TASK_NAME%" /F
) else (
    echo FAILED to create task. Run as Administrator?
)
