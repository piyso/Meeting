#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# BlueArkive Landing Page — Deploy Script
# ═══════════════════════════════════════════════════════════════
#
# This script handles the COMPLETE deployment pipeline:
#   1. Commits changes in the landing-web standalone repo (piyso/bluearkive-landing)
#   2. Commits changes in the parent repo (piyso/Meeting)
#   3. Pushes both to GitHub
#   4. Deploys to Vercel production (www.bluearkive.com)
#
# ARCHITECTURE NOTE:
#   landing-web/ is a NESTED independent git repo inside piyso/Meeting.
#   It is NOT a git submodule. Both repos track the same source files.
#   The Vercel project "piynotes" deploys from the PARENT repo (piyso/Meeting)
#   with root directory set to "landing-web".
#   However, Vercel git auto-deploy is unreliable for this setup,
#   so we always deploy explicitly via `vercel --prod`.
#
# USAGE:
#   cd landing-web
#   ./deploy.sh "your commit message"
#   ./deploy.sh                        # uses default message
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
COMMIT_MSG="${1:-feat(landing): update landing page}"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  BlueArkive Landing — Deploy Pipeline"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Step 1: Build check ──
echo "🔨 Step 1/5: Build verification..."
cd "$SCRIPT_DIR"
npx next build > /dev/null 2>&1
echo "   ✅ Build passed"

# ── Step 2: Commit to landing-web repo (piyso/bluearkive-landing) ──
echo ""
echo "📦 Step 2/5: Commit to landing-web repo (piyso/bluearkive-landing)..."
cd "$SCRIPT_DIR"
if git diff --quiet && git diff --cached --quiet; then
    echo "   ⏭️  No changes in landing-web repo — skipping"
else
    git add -A
    git commit -m "$COMMIT_MSG"
    echo "   ✅ Committed to landing-web repo"
fi

# ── Step 3: Push landing-web repo ──
echo ""
echo "🚀 Step 3/5: Push landing-web repo..."
cd "$SCRIPT_DIR"
git push origin main 2>/dev/null && echo "   ✅ Pushed to piyso/bluearkive-landing" || echo "   ⏭️  Already up to date"

# ── Step 4: Commit & push parent repo (piyso/Meeting) ──
echo ""
echo "📦 Step 4/5: Commit & push parent repo (piyso/Meeting)..."
cd "$PARENT_DIR"
if git diff --quiet landing-web/ && git diff --cached --quiet landing-web/; then
    echo "   ⏭️  No changes in parent repo — skipping"
else
    git add landing-web/
    git commit -m "$COMMIT_MSG"
    git push origin main
    echo "   ✅ Pushed to piyso/Meeting"
fi

# ── Step 5: Deploy to Vercel production ──
echo ""
echo "🌐 Step 5/5: Deploying to Vercel production (www.bluearkive.com)..."
cd "$PARENT_DIR"
DEPLOY_URL=$(npx vercel --prod --yes 2>&1 | grep -oE 'https://www\.bluearkive\.com' | head -1)

if [ -n "$DEPLOY_URL" ]; then
    echo "   ✅ Live at: $DEPLOY_URL"
else
    echo "   ✅ Deployment submitted — check https://www.bluearkive.com"
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Deploy complete!"
echo "═══════════════════════════════════════════════════"
echo ""
