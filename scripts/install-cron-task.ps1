# OpenCode Upstream Sync - Scheduled Task Script
# Run this as Administrator to set up automatic daily sync

param(
    [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$TaskName = "OpenCode-Upstream-Sync",
    [string]$TargetBranch = $(if ($env:TARGET_BRANCH) { $env:TARGET_BRANCH } else { "dev" }),
    [int]$Hour = 2,
    [int]$Minute = 0
)

$ErrorActionPreference = "Stop"

$ScriptPath = Join-Path $RepoPath "scripts\sync-upstream.ps1"
$TaskDescription = "Syncs OpenCode fork with upstream changes daily at 2 AM"

# Verify script exists
if (-not (Test-Path $ScriptPath)) {
    Write-Error "Sync script not found: $ScriptPath"
    exit 1
}

# Create the task
$TaskRun = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`" -TargetBranch `"$TargetBranch`""
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" -TargetBranch `"$TargetBranch`""
$Trigger = New-ScheduledTaskTrigger -Daily -At "$Hour`:$Minute"
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -RequireLogon

Write-Host "Creating scheduled task: $TaskName" -ForegroundColor Cyan
Write-Host "  Schedule: Daily at $Hour`:$Minute" -ForegroundColor Gray
Write-Host "  Script: $ScriptPath" -ForegroundColor Gray
Write-Host "  Target branch: $TargetBranch" -ForegroundColor Gray

# Remove existing task if present
schtasks /End /TN $TaskName 2>$null | Out-Null
schtasks /Delete /TN $TaskName /F 2>$null | Out-Null

# Create the task (requires admin)
$Command = "schtasks /Create /TN `"$TaskName`" /TR `"$TaskRun`" /SC DAILY /ST $("{0:D2}:{1:D2}" -f $Hour, $Minute) /RL HIGHEST /F"

Write-Host "`nRunning: $Command" -ForegroundColor Gray
$result = cmd /c $Command 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Task created successfully!" -ForegroundColor Green
    Write-Host "`nTo verify the task:" -ForegroundColor Cyan
    Write-Host "  schtasks /Query /TN `"$TaskName`"" -ForegroundColor Gray
    Write-Host "`nTo run manually now:" -ForegroundColor Cyan
    Write-Host "  schtasks /Run /TN `"$TaskName`"" -ForegroundColor Gray
    Write-Host "`nTo delete:" -ForegroundColor Cyan
    Write-Host "  schtasks /Delete /TN `"$TaskName`" /F" -ForegroundColor Gray
} else {
    Write-Error "Failed to create task: $result"
    exit 1
}
