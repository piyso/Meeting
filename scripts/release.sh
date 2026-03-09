#!/bin/bash
# ─────────────────────────────────────────────────────
# BlueArkive Release Script
# One command. Complete release.
# Usage: ./scripts/release.sh [patch|minor|major]
# ─────────────────────────────────────────────────────

set -e

TYPE=${1:-patch}
HETZNER="root@89.167.57.32"
DEPLOY_DIR="/data/bluearkive-downloads"

echo ""
echo "══════════════════════════════════════"
echo "  BlueArkive Release ($TYPE)"
echo "══════════════════════════════════════"
echo ""

# ── 1. Bump version ──
echo "[1/5] Bumping version ($TYPE)..."
npm version "$TYPE" --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")
echo "  → v$VERSION"

# ── 2. Build ──
echo ""
echo "[2/5] Building macOS (arm64 + x64)..."
npm run build:mac
echo "  → Build complete"

# ── 3. Verify artifacts ──
echo ""
echo "[3/5] Verifying artifacts..."
EXPECTED_FILES=(
    "release/BlueArkive-${VERSION}-mac-arm64.dmg"
    "release/BlueArkive-${VERSION}-mac-x64.dmg"
    "release/BlueArkive-${VERSION}-mac-arm64.zip"
    "release/BlueArkive-${VERSION}-mac-x64.zip"
    "release/latest-mac.yml"
)
for f in "${EXPECTED_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        echo "  ✗ MISSING: $f"
        exit 1
    fi
    SIZE=$(du -h "$f" | cut -f1)
    echo "  ✓ $f ($SIZE)"
done

YML_VERSION=$(head -1 release/latest-mac.yml | sed 's/version: *//')
if [ "$YML_VERSION" != "$VERSION" ]; then
    echo "  ✗ latest-mac.yml says $YML_VERSION, expected $VERSION"
    exit 1
fi
echo "  ✓ latest-mac.yml version matches"

# ── 4. Deploy to Hetzner ──
echo ""
echo "[4/5] Deploying to Hetzner..."
scp release/BlueArkive-${VERSION}-mac-*.dmg \
    release/BlueArkive-${VERSION}-mac-*.zip \
    release/BlueArkive-${VERSION}-mac-*.blockmap \
    release/latest-mac.yml \
    landing-web/install.sh \
    ${HETZNER}:${DEPLOY_DIR}/
echo "  → Artifacts deployed"

# ── 5. Git commit, tag, push ──
echo ""
echo "[5/5] Committing and pushing..."
git add package.json package-lock.json
git commit -m "chore: release v${VERSION}"
git tag -a "v${VERSION}" -m "Release ${VERSION}"
git push origin main --tags
echo "  → Pushed to main + tag v${VERSION}"

echo ""
echo "══════════════════════════════════════"
echo "  ✅ v${VERSION} released!"
echo ""
echo "  Vercel:  auto-deploys landing page"
echo "  Hetzner: artifacts + install.sh live"
echo "  Users:   auto-updater will pick up"
echo "══════════════════════════════════════"
echo ""
