#!/bin/bash
# ─────────────────────────────────────────────────────
# BlueArkive Safe Build Script
#
# Automatically moves large AI model files out of the
# project root before building, then restores them.
# This prevents electron-builder from bundling 3.5GB
# of model files into the ASAR archive.
#
# Usage:
#   ./build/build-safe.sh mac         # both arm64 + x64
#   ./build/build-safe.sh mac:arm64   # arm64 only
#   ./build/build-safe.sh mac:x64     # x64 only
#   ./build/build-safe.sh win         # Windows
#   ./build/build-safe.sh linux       # Linux
# ─────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MODELS_DIR="$PROJECT_DIR/resources/models"
BACKUP_DIR="/tmp/bluearkive-models-backup-$$"

TARGET="${1:-mac}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     BlueArkive Safe Build            ║${NC}"
echo -e "${GREEN}║     Target: ${TARGET}                     ${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"

# Step 1: Move large model files out
MOVED_FILES=()
mkdir -p "$BACKUP_DIR"

for ext in gguf bin; do
  for f in "$MODELS_DIR"/*."$ext" 2>/dev/null; do
    [ -f "$f" ] || continue
    fname=$(basename "$f")
    size=$(du -h "$f" | cut -f1)
    echo -e "${YELLOW}→ Moving $fname ($size) to temp backup${NC}"
    mv "$f" "$BACKUP_DIR/"
    MOVED_FILES+=("$fname")
  done
done

if [ ${#MOVED_FILES[@]} -eq 0 ]; then
  echo -e "${GREEN}✓ No large model files found — safe to build${NC}"
else
  echo -e "${GREEN}✓ Moved ${#MOVED_FILES[@]} large files out of project${NC}"
fi

# Step 2: Restore on exit (even if build fails)
cleanup() {
  echo ""
  echo -e "${YELLOW}Restoring model files...${NC}"
  for fname in "${MOVED_FILES[@]}"; do
    if [ -f "$BACKUP_DIR/$fname" ]; then
      mv "$BACKUP_DIR/$fname" "$MODELS_DIR/"
      echo -e "${GREEN}  ✓ Restored $fname${NC}"
    fi
  done
  rmdir "$BACKUP_DIR" 2>/dev/null || true
}
trap cleanup EXIT

# Step 3: Run the build
echo ""
echo -e "${GREEN}Building for target: build:${TARGET}${NC}"
cd "$PROJECT_DIR"
npm run "build:${TARGET}"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Build Complete! ✅                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"

# Step 4: Show output
echo ""
echo "Built artifacts:"
ls -lh release/BlueArkive-*.{dmg,exe,AppImage,deb,rpm,zip} 2>/dev/null || true
