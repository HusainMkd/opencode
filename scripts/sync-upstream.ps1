# Sync upstream changes into the local target branch.
# Usage: .\scripts\sync-upstream.ps1 [-Force] [-PrintBranch] [-TargetBranch dev]

param(
    [switch]$Force,
    [switch]$PrintBranch,
    [string]$TargetBranch = $(if ($env:TARGET_BRANCH) { $env:TARGET_BRANCH } else { "dev" }),
    [string]$UpstreamBranch = $(if ($env:UPSTREAM_BRANCH) { $env:UPSTREAM_BRANCH } else { "dev" }),
    [string]$UpstreamRepo = $(if ($env:UPSTREAM_REPO) { $env:UPSTREAM_REPO } else { "anomalyco/opencode" }),
    [string]$UpstreamRemote = $(if ($env:UPSTREAM_REMOTE) { $env:UPSTREAM_REMOTE } else { "upstream" }),
    [string]$SyncBranch = $(if ($env:SYNC_BRANCH) { $env:SYNC_BRANCH } else { "sync/upstream-$(Get-Date -Format 'yyyyMMdd-HHmmss')" })
)

$ErrorActionPreference = "Stop"

git diff --quiet
git diff --cached --quiet

Write-Host "🔄 Syncing $UpstreamRepo@$UpstreamBranch into $TargetBranch" -ForegroundColor Cyan

if (git remote get-url $UpstreamRemote 2>$null) {
    git remote set-url $UpstreamRemote "https://github.com/$UpstreamRepo.git"
} else {
    git remote add $UpstreamRemote "https://github.com/$UpstreamRepo.git"
}

git fetch origin $TargetBranch
git fetch $UpstreamRemote $UpstreamBranch
git checkout -B $SyncBranch "origin/$TargetBranch"

try {
    git merge --no-ff --no-edit "$UpstreamRemote/$UpstreamBranch"
    Write-Host "✅ Merge completed cleanly" -ForegroundColor Green
} catch {
    if (-not $Force) {
        Write-Host "❌ Merge conflicts detected on $SyncBranch. Resolve them manually, then commit the merge." -ForegroundColor Red
        exit 1
    }

    Write-Host "⚠️  Retrying with upstream-preferred conflict resolution" -ForegroundColor Yellow
    git merge --abort 2>$null
    git merge --no-ff --no-edit -X theirs "$UpstreamRemote/$UpstreamBranch"
}

Write-Host "📌 Sync branch: $SyncBranch" -ForegroundColor Gray
Write-Host "📍 Base branch: $TargetBranch" -ForegroundColor Gray

if ($PrintBranch) {
    Write-Output $SyncBranch
}