# OpenCode Upstream Sync - Scheduled Task Script
# Run this as Administrator to set up automatic daily sync

$ErrorActionPreference = "Stop"

$RepoPath = "C:\Users\husai\Documents\GitHub\opencode-fork"
$ScriptPath = Join-Path $RepoPath "scripts\sync-upstream.ps1"
$TaskName = "OpenCode-Upstream-Sync"
$TaskDescription = "Syncs OpenCode fork with upstream changes daily at 2 AM"
$Hour = 2
$Minute = 0

# Verify script exists
if (-not (Test-Path $ScriptPath)) {
    Write-Error "Sync script not found: $ScriptPath"
    exit 1
}

# Create the task
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
$Trigger = New-ScheduledTaskTrigger -Daily -At "$Hour`:$Minute"
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -RequireLogon

Write-Host "Creating scheduled task: $TaskName" -ForegroundColor Cyan
Write-Host "  Schedule: Daily at $Hour`:$Minute" -ForegroundColor Gray
Write-Host "  Script: $ScriptPath" -ForegroundColor Gray

# Remove existing task if present
schtasks /End /TN $TaskName 2>$null | Out-Null
schtasks /Delete /TN $TaskName /F 2>$null | Out-Null

# Create the task (requires admin)
$Command = "schtasks /Create /TN `"$TaskName`" /TR `"powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `\"$ScriptPath\`"`" /SC DAILY /ST $("{0:D2}:{1:D2}" -f $Hour, $Minute) /RL HIGHEST /F"

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
