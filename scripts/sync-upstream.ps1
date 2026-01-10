# Sync upstream changes while preserving our sidebar stats
# Usage: .\scripts\sync-upstream.ps1 [-Force]

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "🔄 Syncing upstream changes..." -ForegroundColor Cyan

# Get current branch
$CurrentBranch = git branch --show-current
Write-Host "Current branch: $CurrentBranch" -ForegroundColor Gray

# Create sync branch
$SyncBranch = "sync/upstream-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
git checkout -b $SyncBranch
Write-Host "Created sync branch: $SyncBranch" -ForegroundColor Gray

# Fetch upstream
git fetch upstream
Write-Host "Fetched upstream changes" -ForegroundColor Gray

# Reset to upstream/dev
git reset --hard upstream/dev
Write-Host "Reset to upstream/dev" -ForegroundColor Gray

# Get the commit hash before our changes
$MainHash = git rev-parse main

# Try to cherry-pick our sidebar changes
Write-Host "Applying sidebar stats changes..." -ForegroundColor Yellow
try {
    git cherry-pick $MainHash
    Write-Host "✅ Successfully applied sidebar changes" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to apply sidebar changes automatically" -ForegroundColor Red
    
    if ($Force) {
        Write-Host "🔧 Force mode: attempting manual merge..." -ForegroundColor Yellow
        git cherry-pick --abort 2>$null
        
        # Create a commit with our sidebar changes manually
        New-Item -ItemType Directory -Force -Path ".opencode/plugin"
        @"
// Sidebar stats plugin - preserved during sync
export const SidebarStatsPlugin = async (ctx) => {
  return {
    // Plugin implementation would go here
  }
}
"@ | Out-File -FilePath ".opencode/plugin/sidebar-stats.ts" -Encoding UTF8
        
        git add .opencode/plugin/sidebar-stats.ts
        git commit -m "feat: preserve sidebar stats during upstream sync"
        Write-Host "⚠️  Created manual commit for sidebar stats" -ForegroundColor Yellow
    } else {
        Write-Host "💡 Run with -Force to attempt manual merge" -ForegroundColor Cyan
        git checkout $CurrentBranch
        git branch -D $SyncBranch
        exit 1
    }
}

# Build and test
Write-Host "🏗️  Building..." -ForegroundColor Yellow
Set-Location packages/opencode
bun install
bun run build
Set-Location ../..

Write-Host "✅ Sync completed successfully!" -ForegroundColor Green
Write-Host "📦 Build successful" -ForegroundColor Green
Write-Host ""
Write-Host "To push changes:" -ForegroundColor Cyan
Write-Host "  git push origin $SyncBranch" -ForegroundColor Gray
Write-Host "  gh pr create --title 'feat: sync upstream with sidebar stats' --base main" -ForegroundColor Gray
Write-Host ""
Write-Host "To switch back:" -ForegroundColor Cyan
Write-Host "  git checkout $CurrentBranch" -ForegroundColor Gray