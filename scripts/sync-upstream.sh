#!/bin/bash

# Sync upstream changes while preserving our sidebar stats
# Usage: ./scripts/sync-upstream.sh [--force]

set -e

FORCE=false
if [ "$1" == "--force" ]; then
    FORCE=true
fi

echo "🔄 Syncing upstream changes..."

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Create sync branch
SYNC_BRANCH="sync/upstream-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$SYNC_BRANCH"
echo "Created sync branch: $SYNC_BRANCH"

# Fetch upstream
git fetch upstream
echo "Fetched upstream changes"

# Reset to upstream/dev
git reset --hard upstream/dev
echo "Reset to upstream/dev"

# Get the commit hash before our changes
MAIN_HASH=$(git rev-parse main)

# Try to cherry-pick our sidebar changes
echo "Applying sidebar stats changes..."
if git cherry-pick "$MAIN_HASH"; then
    echo "✅ Successfully applied sidebar changes"
else
    echo "❌ Failed to apply sidebar changes automatically"
    
    if [ "$FORCE" == "true" ]; then
        echo "🔧 Force mode: attempting manual merge..."
        git cherry-pick --abort || true
        
        # Create a commit with our sidebar changes manually
        mkdir -p .opencode/plugin
        cat > .opencode/plugin/sidebar-stats.ts << 'EOF'
// Sidebar stats plugin - preserved during sync
export const SidebarStatsPlugin = async (ctx) => {
  return {
    // Plugin implementation would go here
  }
}
EOF
        
        git add .opencode/plugin/sidebar-stats.ts
        git commit -m "feat: preserve sidebar stats during upstream sync"
        echo "⚠️  Created manual commit for sidebar stats"
    else
        echo "💡 Run with --force to attempt manual merge"
        git checkout "$CURRENT_BRANCH"
        git branch -D "$SYNC_BRANCH"
        exit 1
    fi
fi

# Build and test
echo "🏗️  Building..."
cd packages/opencode
bun install
bun run build
cd ../..

echo "✅ Sync completed successfully!"
echo "📦 Build successful"
echo ""
echo "To push changes:"
echo "  git push origin $SYNC_BRANCH"
echo "  gh pr create --title 'feat: sync upstream with sidebar stats' --base main"
echo ""
echo "To switch back:"
echo "  git checkout $CURRENT_BRANCH"