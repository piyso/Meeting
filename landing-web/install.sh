#!/bin/bash
# ─────────────────────────────────────────────────────
# BlueArkive Installer
# One command. Zero friction.
# ─────────────────────────────────────────────────────

set -e

APP_NAME="BlueArkive"
BASE_URL="https://dl.bluearkive.com"
INSTALL_DIR="/Applications"

# Auto-detect latest version from server
VERSION=$(curl -sf "${BASE_URL}/latest-mac.yml" 2>/dev/null | head -1 | sed 's/version: *//')
if [ -z "$VERSION" ]; then
    VERSION="0.3.0"  # fallback
fi

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo ""
echo -e "${BLUE}${BOLD}  ╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}${BOLD}  ║     BlueArkive Installer v${VERSION}     ║${NC}"
echo -e "${BLUE}${BOLD}  ║  Private. Offline. Yours forever.    ║${NC}"
echo -e "${BLUE}${BOLD}  ╚══════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Detect architecture ──
echo -e "${BOLD}[1/5]${NC} Detecting your Mac..."
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    DMG_FILE="${APP_NAME}-${VERSION}-mac-arm64.dmg"
    echo -e "  ${GREEN}✓${NC} Apple Silicon (M1/M2/M3/M4) detected"
else
    DMG_FILE="${APP_NAME}-${VERSION}-mac-x64.dmg"
    echo -e "  ${GREEN}✓${NC} Intel Mac detected"
fi

DMG_URL="${BASE_URL}/${DMG_FILE}"
TMP_DMG="/tmp/${DMG_FILE}"

# ── Step 2: Download ──
echo ""
echo -e "${BOLD}[2/5]${NC} Downloading ${APP_NAME}..."
if command -v curl &> /dev/null; then
    curl -L --progress-bar -o "$TMP_DMG" "$DMG_URL"
else
    echo "Error: curl is required but not installed."
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Download complete"

# ── Step 3: Mount & Install ──
echo ""
echo -e "${BOLD}[3/5]${NC} Installing to ${INSTALL_DIR}..."
MOUNT_DIR=$(hdiutil attach "$TMP_DMG" -nobrowse 2>/dev/null | sed -n 's/.*\(\/Volumes\/.*\)/\1/p' | head -1)

if [ -z "$MOUNT_DIR" ]; then
    echo "Error: Could not mount the DMG file."
    exit 1
fi

# Remove old version if exists
if [ -d "${INSTALL_DIR}/${APP_NAME}.app" ]; then
    echo -e "  ${YELLOW}→${NC} Removing previous version..."
    rm -rf "${INSTALL_DIR}/${APP_NAME}.app"
fi

# Copy app
cp -R "${MOUNT_DIR}/${APP_NAME}.app" "${INSTALL_DIR}/"
echo -e "  ${GREEN}✓${NC} Installed to ${INSTALL_DIR}/${APP_NAME}.app"

# ── Step 4: Clear quarantine ──
echo ""
echo -e "${BOLD}[4/5]${NC} Clearing macOS security quarantine..."
xattr -cr "${INSTALL_DIR}/${APP_NAME}.app" 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} Quarantine cleared — no warnings on launch"

# ── Step 5: Cleanup ──
echo ""
echo -e "${BOLD}[5/5]${NC} Cleaning up..."
hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || true
rm -f "$TMP_DMG"
echo -e "  ${GREEN}✓${NC} Temporary files removed"

# ── Done ──
echo ""
echo -e "${GREEN}${BOLD}  ══════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✓ BlueArkive installed successfully!${NC}"
echo -e "${GREEN}${BOLD}  ══════════════════════════════════════${NC}"
echo ""
echo -e "  Open it from ${BOLD}Applications${NC} or run:"
echo -e "  ${BLUE}open -a BlueArkive${NC}"
echo ""

# Ask to launch
read -p "  Launch BlueArkive now? [Y/n] " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
    open -a "$APP_NAME"
    echo -e "  ${GREEN}✓${NC} Launching..."
fi
echo ""
