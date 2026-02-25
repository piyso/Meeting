# Build Documentation

This document provides comprehensive instructions for building PiyAPI Notes for all supported platforms.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Build Scripts](#build-scripts)
- [Platform-Specific Builds](#platform-specific-builds)
- [Code Signing](#code-signing)
- [Auto-Update System](#auto-update-system)
- [File Associations](#file-associations)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### All Platforms

- Node.js 18+ and npm 9+
- Git
- 10GB free disk space (for models and build artifacts)

### macOS

- macOS 11 (Big Sur) or later
- Xcode Command Line Tools: `xcode-select --install`
- Apple Developer ID (for code signing and notarization)

### Windows

- Windows 10 or later
- Visual Studio Build Tools or Visual Studio 2019+
- Code signing certificate (optional, but recommended)

### Linux

- Ubuntu 20.04+ / Debian 11+ / Fedora 35+
- Build essentials: `sudo apt install build-essential`
- RPM tools (for RPM builds): `sudo apt install rpm`

## Build Scripts

### Development Build

```bash
npm run dev
```

Starts Vite dev server and Electron in development mode with hot reload.

### Production Build (All Platforms)

```bash
npm run build
```

Builds for the current platform.

### Platform-Specific Builds

#### macOS

```bash
# Universal binary (Intel + Apple Silicon)
npm run build:mac:universal

# Apple Silicon only (M1/M2/M3)
npm run build:mac:arm64

# Intel only
npm run build:mac:x64

# All macOS targets
npm run build:mac
```

**Output:**
- `release/PiyAPI Notes-{version}-mac-universal.dmg`
- `release/PiyAPI Notes-{version}-mac-arm64.zip`
- `release/PiyAPI Notes-{version}-mac-x64.zip`

#### Windows

```bash
# 64-bit installer
npm run build:win:x64

# 32-bit installer
npm run build:win:ia32

# Portable executable
npm run build:win:portable

# All Windows targets
npm run build:win
```

**Output:**
- `release/PiyAPI Notes-Setup-{version}.exe` (NSIS installer)
- `release/PiyAPI Notes-Portable-{version}.exe` (Portable)

#### Linux

```bash
# AppImage (universal)
npm run build:linux:appimage

# Debian package
npm run build:linux:deb

# RPM package
npm run build:linux:rpm

# All Linux targets
npm run build:linux
```

**Output:**
- `release/PiyAPI Notes-{version}.AppImage`
- `release/piyapi-notes_{version}_amd64.deb`
- `release/piyapi-notes-{version}.x86_64.rpm`

### Build All Platforms

```bash
npm run build:all
```

Builds for macOS, Windows, and Linux. Requires all platform prerequisites.

## Platform-Specific Builds

### macOS Build Details

#### Architecture Support

- **Universal Binary**: Runs natively on both Intel and Apple Silicon
- **arm64**: Apple Silicon (M1/M2/M3) - smaller download, faster
- **x64**: Intel Macs - legacy support

#### DMG Configuration

The DMG installer includes:
- Drag-and-drop installation to Applications folder
- Custom background and icon
- Window size: 540x380px
- Icon size: 128px

#### Entitlements

Required entitlements (see `build/entitlements.mac.plist`):
- `com.apple.security.device.audio-input` - Microphone access
- `com.apple.security.cs.allow-jit` - JIT compilation for V8
- `com.apple.security.network.client` - Cloud sync
- `com.apple.security.files.user-selected.read-write` - File access

#### Permissions

The app requests:
- **Microphone**: For audio recording
- **Screen Recording**: For system audio capture (macOS 11+)

Users must grant these in System Settings > Privacy & Security.

### Windows Build Details

#### Installer Types

1. **NSIS Installer** (Recommended)
   - User-friendly installation wizard
   - Desktop and Start Menu shortcuts
   - Uninstaller included
   - File associations configured
   - Per-user installation (no admin required)

2. **Portable Executable**
   - No installation required
   - Runs from any location
   - Ideal for USB drives or restricted environments

#### File Associations

The installer registers `.pnotes` file extension:
- Double-click `.pnotes` files to open in PiyAPI Notes
- Custom icon for `.pnotes` files in Explorer
- "Open with PiyAPI Notes" context menu

#### Audio Capture Requirements

Windows requires **Stereo Mix** to be enabled for system audio capture:

1. Right-click speaker icon in taskbar
2. Select "Sound settings"
3. Click "Sound Control Panel"
4. Go to "Recording" tab
5. Right-click empty space, check "Show Disabled Devices"
6. Right-click "Stereo Mix", select "Enable"

If Stereo Mix is unavailable, the app falls back to microphone capture.

### Linux Build Details

#### Package Formats

1. **AppImage** (Recommended)
   - Universal format, works on all distros
   - No installation required
   - Self-contained with all dependencies
   - Make executable: `chmod +x PiyAPI-Notes-*.AppImage`

2. **DEB Package** (Debian/Ubuntu)
   - Install: `sudo dpkg -i piyapi-notes_*.deb`
   - Integrates with system package manager
   - Automatic dependency resolution

3. **RPM Package** (Fedora/RHEL/CentOS)
   - Install: `sudo rpm -i piyapi-notes-*.rpm`
   - Integrates with system package manager

#### Dependencies

Required system libraries:
- GTK 3
- libnotify
- NSS
- libXScrnSaver
- libXtst
- xdg-utils
- at-spi2-core
- libuuid

These are automatically installed with DEB/RPM packages.

#### Desktop Integration

The Linux packages include:
- Desktop entry in application menu
- MIME type registration for `.pnotes` files
- Icon integration with system theme
- Protocol handler for `piyapi-notes://` URLs

## Code Signing

### Why Code Signing?

Code signing is **critical** for production releases:

- **Windows**: Prevents SmartScreen warnings ("Windows protected your PC")
- **macOS**: Required for Gatekeeper approval and notarization
- **Trust**: Users trust signed applications more

### macOS Code Signing

#### Prerequisites

1. **Apple Developer Account** ($99/year)
   - Sign up at https://developer.apple.com

2. **Developer ID Certificate**
   - Log in to Apple Developer portal
   - Go to Certificates, Identifiers & Profiles
   - Create "Developer ID Application" certificate
   - Download and install in Keychain

#### Signing Process

Set environment variables:

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_ID_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
```

Build with signing:

```bash
npm run build:mac
```

electron-builder will automatically:
1. Sign the app with Developer ID
2. Create a signed DMG
3. Submit for notarization
4. Staple notarization ticket

#### Notarization

Notarization is required for macOS 10.15+:

1. App is uploaded to Apple's notarization service
2. Apple scans for malware
3. If approved, notarization ticket is stapled to DMG
4. Users can open without Gatekeeper warnings

**Notarization time**: 5-30 minutes

#### Troubleshooting macOS Signing

**Error: "No signing identity found"**
- Install Developer ID certificate in Keychain
- Verify: `security find-identity -v -p codesigning`

**Error: "Notarization failed"**
- Check hardened runtime entitlements
- Verify app doesn't contain unsigned binaries
- Check Apple's notarization log for details

### Windows Code Signing

#### Prerequisites

1. **Code Signing Certificate** (~$200/year)
   - Purchase from: DigiCert, Sectigo, SSL.com
   - Choose "EV Code Signing" for instant trust (no SmartScreen warnings)
   - Standard certificates require reputation building (weeks/months)

2. **Certificate Installation**
   - Install certificate in Windows Certificate Store
   - Or use USB token (for EV certificates)

#### Signing Process

Set environment variables:

```bash
# For certificate in Windows Store
set CSC_LINK=path\to\certificate.pfx
set CSC_KEY_PASSWORD=your-password

# For USB token
set CSC_LINK=
set CSC_KEY_PASSWORD=
```

Build with signing:

```bash
npm run build:win
```

electron-builder will automatically sign:
- The executable (`PiyAPI Notes.exe`)
- The installer (`PiyAPI Notes-Setup-{version}.exe`)

#### SmartScreen Filter

**Standard Certificate:**
- Initial builds will show SmartScreen warnings
- Reputation builds over time (weeks/months)
- More downloads = faster reputation building

**EV Certificate:**
- Instant trust, no SmartScreen warnings
- More expensive (~$400/year)
- Requires USB token for signing

#### Troubleshooting Windows Signing

**Error: "Certificate not found"**
- Verify certificate is installed: `certutil -store My`
- Check CSC_LINK path is correct

**Error: "Invalid password"**
- Verify CSC_KEY_PASSWORD is correct
- Check for special characters in password

### Code Signing Placeholders

The build configuration includes placeholders for code signing:

**macOS:**
- `APPLE_ID` - Your Apple ID email
- `APPLE_ID_PASSWORD` - App-specific password
- `APPLE_TEAM_ID` - Your team ID (10 characters)

**Windows:**
- `CSC_LINK` - Path to certificate or thumbprint
- `CSC_KEY_PASSWORD` - Certificate password

**For development builds**, signing is optional. The app will run with warnings.

**For production releases**, signing is **required** to avoid scary warnings.

## Auto-Update System

### Overview

PiyAPI Notes uses `electron-updater` for automatic updates:

- **Check for updates** on app launch
- **Download in background** without interrupting user
- **Notify user** when update is ready
- **Install on quit** or user confirmation

### Update Server Configuration

The app checks for updates at:

```
https://updates.piyapi.cloud
```

This is configured in `package.json`:

```json
"publish": {
  "provider": "generic",
  "url": "https://updates.piyapi.cloud"
}
```

### Update File Structure

The update server must host:

```
https://updates.piyapi.cloud/
├── latest-mac.yml          # macOS update metadata
├── latest-linux.yml        # Linux update metadata
├── latest.yml              # Windows update metadata
├── PiyAPI-Notes-{version}-mac-universal.dmg
├── PiyAPI-Notes-{version}-mac-universal.zip
├── PiyAPI-Notes-Setup-{version}.exe
├── PiyAPI-Notes-{version}.AppImage
└── ...
```

### Update Metadata Format

Example `latest-mac.yml`:

```yaml
version: 0.2.0
files:
  - url: PiyAPI-Notes-0.2.0-mac-universal.dmg
    sha512: abc123...
    size: 123456789
  - url: PiyAPI-Notes-0.2.0-mac-universal.zip
    sha512: def456...
    size: 98765432
path: PiyAPI-Notes-0.2.0-mac-universal.dmg
sha512: abc123...
releaseDate: '2024-02-24T10:00:00.000Z'
```

These files are automatically generated by electron-builder.

### Implementing Auto-Update

Add to main process (`src/main/index.ts`):

```typescript
import { autoUpdater } from 'electron-updater';

// Configure update server
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'https://updates.piyapi.cloud'
});

// Check for updates on app launch
app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify();
});

// Check for updates every 4 hours
setInterval(() => {
  autoUpdater.checkForUpdatesAndNotify();
}, 4 * 60 * 60 * 1000);

// Update event handlers
autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  // Show notification to user
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  // Prompt user to restart and install
});

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
});
```

### Update Flow

1. **App launches** → Check for updates
2. **Update found** → Download in background
3. **Download complete** → Notify user
4. **User quits app** → Install update automatically
5. **App relaunches** → New version running

### Differential Updates

electron-updater supports differential updates:

- Only downloads changed files
- Reduces download size by 70-90%
- Faster updates for users

This is automatically enabled for:
- macOS: `.zip` files (not `.dmg`)
- Windows: NSIS installers
- Linux: AppImage

### Testing Auto-Update

1. Build version 0.1.0: `npm run build`
2. Install and run
3. Build version 0.2.0: `npm run build`
4. Upload to update server
5. Restart app → Should detect and download update

**Development testing:**

```typescript
// Force update check
autoUpdater.checkForUpdates();

// Use dev update server
autoUpdater.setFeedURL({
  provider: 'generic',
  url: 'http://localhost:3000/updates'
});
```

## File Associations

### Overview

PiyAPI Notes registers the `.pnotes` file extension for meeting exports.

### Windows File Association

Configured in `package.json`:

```json
"fileAssociations": [
  {
    "ext": "pnotes",
    "name": "PiyAPI Notes Meeting",
    "description": "PiyAPI Notes Meeting File",
    "icon": "build/file-icon.ico",
    "role": "Editor"
  }
]
```

**Features:**
- Double-click `.pnotes` files to open in PiyAPI Notes
- Custom icon in Windows Explorer
- "Open with PiyAPI Notes" in context menu

**Registry keys created:**
- `HKCR\.pnotes` → `PiyAPINotes.Meeting`
- `HKCR\PiyAPINotes.Meeting\shell\open\command` → App path

### macOS File Association

Configured in `build/entitlements.mac.plist` and `package.json`.

**Features:**
- Double-click `.pnotes` files to open in PiyAPI Notes
- Custom icon in Finder
- "Open With" menu integration

**Info.plist keys:**
- `CFBundleDocumentTypes` → File type definitions
- `UTExportedTypeDeclarations` → UTI declarations

### Linux File Association

Configured in `package.json` and `build/linux-after-install.sh`.

**Features:**
- Double-click `.pnotes` files to open in PiyAPI Notes
- MIME type registration: `application/x-piyapi-notes`
- Desktop file integration

**Files created:**
- `/usr/share/mime/packages/piyapi-notes.xml` → MIME type
- `/usr/share/applications/piyapi-notes.desktop` → Desktop entry

### Protocol Handler

PiyAPI Notes also registers the `piyapi-notes://` protocol:

```
piyapi-notes://open?meeting=abc123
```

This allows:
- Deep linking from web browser
- Integration with other apps
- Sharing meeting links

## Troubleshooting

### Build Fails with "Cannot find module"

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

### macOS: "No signing identity found"

**Solution:**
1. Install Xcode Command Line Tools
2. Install Developer ID certificate in Keychain
3. Verify: `security find-identity -v -p codesigning`

### Windows: "SmartScreen prevented an unrecognized app"

**Solution:**
- This is expected for unsigned builds
- Click "More info" → "Run anyway"
- For production: Get code signing certificate

### Linux: "Permission denied" when running AppImage

**Solution:**
```bash
chmod +x PiyAPI-Notes-*.AppImage
./PiyAPI-Notes-*.AppImage
```

### Build is very slow

**Solution:**
- Disable antivirus temporarily
- Use SSD instead of HDD
- Increase Node.js memory: `export NODE_OPTIONS=--max-old-space-size=4096`

### "ENOSPC: System limit for number of file watchers reached"

**Solution (Linux):**
```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### DMG creation fails on macOS

**Solution:**
```bash
# Install required tools
brew install graphicsmagick imagemagick

# Retry build
npm run build:mac
```

### NSIS installer fails on Windows

**Solution:**
- Install NSIS: https://nsis.sourceforge.io/Download
- Add to PATH: `C:\Program Files (x86)\NSIS`
- Retry build

## Build Artifacts

After a successful build, artifacts are in the `release/` directory:

```
release/
├── PiyAPI Notes-0.1.0-mac-universal.dmg      # macOS installer
├── PiyAPI Notes-0.1.0-mac-universal.zip      # macOS zip
├── PiyAPI Notes-Setup-0.1.0.exe              # Windows installer
├── PiyAPI Notes-Portable-0.1.0.exe           # Windows portable
├── PiyAPI Notes-0.1.0.AppImage               # Linux AppImage
├── piyapi-notes_0.1.0_amd64.deb              # Debian package
├── piyapi-notes-0.1.0.x86_64.rpm             # RPM package
├── latest-mac.yml                            # macOS update metadata
├── latest-linux.yml                          # Linux update metadata
└── latest.yml                                # Windows update metadata
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.os }}-build
          path: release/*
```

## Resources

- [electron-builder Documentation](https://www.electron.build/)
- [electron-updater Documentation](https://www.electron.build/auto-update)
- [Apple Developer Portal](https://developer.apple.com/)
- [Code Signing Certificates](https://www.digicert.com/signing/code-signing-certificates)
- [NSIS Documentation](https://nsis.sourceforge.io/Docs/)

## Support

For build issues, please:

1. Check this documentation
2. Search existing GitHub issues
3. Create a new issue with:
   - Platform and version
   - Build command used
   - Full error message
   - Build log (`npm run build > build.log 2>&1`)
