# Build Resources

This directory contains resources needed for building platform-specific installers.

## Required Files

### Icons

You need to create the following icon files:

#### macOS
- `icon.icns` - macOS app icon (512x512, 256x256, 128x128, 64x64, 32x32, 16x16)

**How to create:**
```bash
# Create iconset directory
mkdir icon.iconset

# Add PNG files at different sizes
# icon_512x512.png, icon_256x256.png, etc.

# Convert to ICNS
iconutil -c icns icon.iconset -o icon.icns
```

#### Windows
- `icon.ico` - Windows app icon (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)
- `file-icon.ico` - Icon for .pnotes files (same sizes)

**How to create:**
Use online tools like:
- https://icoconvert.com/
- https://convertio.co/png-ico/

Or use ImageMagick:
```bash
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

#### Linux
- `icons/` directory with PNG files at multiple sizes:
  - `16x16/apps/piyapi-notes.png`
  - `32x32/apps/piyapi-notes.png`
  - `48x48/apps/piyapi-notes.png`
  - `64x64/apps/piyapi-notes.png`
  - `128x128/apps/piyapi-notes.png`
  - `256x256/apps/piyapi-notes.png`
  - `512x512/apps/piyapi-notes.png`

### Scripts

- `installer.nsh` - Custom NSIS installer script (✅ Created)
- `entitlements.mac.plist` - macOS entitlements (✅ Created)
- `linux-after-install.sh` - Linux post-install script (✅ Created)

## Icon Design Guidelines

### App Icon

The app icon should:
- Be simple and recognizable at small sizes
- Use the PiyAPI Notes brand colors
- Include a microphone or note-taking symbol
- Work well on light and dark backgrounds

### Recommended Design

- **Primary element**: Microphone or waveform
- **Secondary element**: Note or document
- **Colors**: Blue (#0066FF) and white
- **Style**: Modern, flat design with subtle gradients

### File Icon (.pnotes)

The file icon should:
- Be distinct from the app icon
- Indicate it's a document/file
- Use similar colors to maintain brand consistency
- Include a document or page symbol

## Temporary Placeholders

Until you create proper icons, you can use placeholder icons:

```bash
# macOS - Use default Electron icon
cp node_modules/electron/dist/Electron.app/Contents/Resources/electron.icns build/icon.icns

# Windows - Use default Electron icon
# (electron-builder will use a default if icon.ico is missing)

# Linux - Create simple PNG placeholders
# (electron-builder will use defaults if missing)
```

## Code Signing Certificates

### macOS

1. **Apple Developer Account** ($99/year)
   - Sign up at https://developer.apple.com

2. **Developer ID Certificate**
   - Create in Apple Developer portal
   - Download and install in Keychain

3. **Environment Variables**
   ```bash
   export APPLE_ID="your-apple-id@example.com"
   export APPLE_ID_PASSWORD="app-specific-password"
   export APPLE_TEAM_ID="YOUR_TEAM_ID"
   ```

### Windows

1. **Code Signing Certificate** (~$200/year)
   - Purchase from DigiCert, Sectigo, or SSL.com
   - Choose EV certificate for instant trust

2. **Environment Variables**
   ```bash
   set CSC_LINK=path\to\certificate.pfx
   set CSC_KEY_PASSWORD=your-password
   ```

## Testing Builds

### Without Code Signing (Development)

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

The builds will work but show security warnings.

### With Code Signing (Production)

Set environment variables and run:

```bash
# macOS (with notarization)
export APPLE_ID="..."
export APPLE_ID_PASSWORD="..."
export APPLE_TEAM_ID="..."
npm run build:mac

# Windows (with signing)
set CSC_LINK="..."
set CSC_KEY_PASSWORD="..."
npm run build:win
```

## Resources

- [electron-builder Icons](https://www.electron.build/icons)
- [macOS Icon Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- [Windows Icon Guidelines](https://docs.microsoft.com/en-us/windows/apps/design/style/iconography/app-icon-design)
- [Linux Icon Theme Specification](https://specifications.freedesktop.org/icon-theme-spec/icon-theme-spec-latest.html)
