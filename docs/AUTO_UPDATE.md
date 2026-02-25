# Auto-Update System

This document explains how to implement and configure the auto-update system for PiyAPI Notes.

## Overview

PiyAPI Notes uses `electron-updater` to provide seamless automatic updates:

- ✅ Check for updates on app launch
- ✅ Download updates in background
- ✅ Notify user when ready
- ✅ Install on app restart
- ✅ Differential updates (smaller downloads)
- ✅ Rollback support

## Architecture

```
┌─────────────────┐
│   Electron App  │
│                 │
│  electron-      │
│  updater        │
└────────┬────────┘
         │
         │ HTTPS
         ▼
┌─────────────────┐
│  Update Server  │
│                 │
│  updates.       │
│  piyapi.cloud   │
└────────┬────────┘
         │
         │ Hosts
         ▼
┌─────────────────┐
│  Update Files   │
│                 │
│  - latest.yml   │
│  - installers   │
│  - checksums    │
└─────────────────┘
```

## Implementation

### 1. Install Dependencies

Already included in `package.json`:

```json
{
  "dependencies": {
    "electron-updater": "^6.1.7"
  }
}
```

### 2. Configure Update Server

In `package.json`:

```json
{
  "build": {
    "publish": {
      "provider": "generic",
      "url": "https://updates.piyapi.cloud"
    }
  }
}
```

### 3. Implement in Main Process

Create `src/main/updater.ts`:

```typescript
import { autoUpdater } from 'electron-updater';
import { app, BrowserWindow, dialog } from 'electron';
import log from 'electron-log';

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Configure auto-download
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

export class AppUpdater {
  private mainWindow: BrowserWindow | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Checking for updates
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates...');
      this.sendStatusToWindow('Checking for updates...');
    });

    // Update available
    autoUpdater.on('update-available', (info) => {
      log.info('Update available:', info.version);
      this.sendStatusToWindow(`Update available: ${info.version}`);
      
      // Ask user if they want to download
      dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available. Download now?`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
    });

    // No update available
    autoUpdater.on('update-not-available', (info) => {
      log.info('Update not available:', info.version);
      this.sendStatusToWindow('App is up to date');
    });

    // Download progress
    autoUpdater.on('download-progress', (progressObj) => {
      const message = `Downloading: ${Math.round(progressObj.percent)}%`;
      log.info(message);
      this.sendStatusToWindow(message);
      
      // Send progress to renderer
      this.mainWindow?.webContents.send('update-download-progress', {
        percent: progressObj.percent,
        transferred: progressObj.transferred,
        total: progressObj.total,
        bytesPerSecond: progressObj.bytesPerSecond
      });
    });

    // Update downloaded
    autoUpdater.on('update-downloaded', (info) => {
      log.info('Update downloaded:', info.version);
      this.sendStatusToWindow('Update ready to install');
      
      // Notify user
      dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart now to install?`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1
      }).then((result) => {
        if (result.response === 0) {
          // Quit and install
          setImmediate(() => autoUpdater.quitAndInstall());
        }
      });
    });

    // Error
    autoUpdater.on('error', (err) => {
      log.error('Update error:', err);
      this.sendStatusToWindow('Update error');
      
      // Only show error dialog if it's not a network error
      if (!err.message.includes('net::')) {
        dialog.showErrorBox('Update Error', err.message);
      }
    });
  }

  private sendStatusToWindow(text: string) {
    this.mainWindow?.webContents.send('update-status', text);
  }

  // Check for updates
  public checkForUpdates() {
    autoUpdater.checkForUpdates();
  }

  // Check for updates and notify (silent if no update)
  public checkForUpdatesAndNotify() {
    autoUpdater.checkForUpdatesAndNotify();
  }
}
```

### 4. Initialize in Main Process

In `src/main/index.ts`:

```typescript
import { app, BrowserWindow } from 'electron';
import { AppUpdater } from './updater';

let mainWindow: BrowserWindow | null = null;
let updater: AppUpdater | null = null;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL('http://localhost:5173');

  // Initialize updater
  updater = new AppUpdater(mainWindow);

  // Check for updates on launch (after 3 seconds)
  setTimeout(() => {
    updater.checkForUpdatesAndNotify();
  }, 3000);

  // Check for updates every 4 hours
  setInterval(() => {
    updater.checkForUpdatesAndNotify();
  }, 4 * 60 * 60 * 1000);
});

// Handle manual update check from renderer
ipcMain.handle('check-for-updates', () => {
  updater?.checkForUpdates();
});
```

### 5. Add UI in Renderer

In `src/renderer/components/UpdateNotification.tsx`:

```typescript
import React, { useEffect, useState } from 'react';

interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export const UpdateNotification: React.FC = () => {
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  useEffect(() => {
    // Listen for update status
    window.electron.onUpdateStatus((status: string) => {
      setStatus(status);
    });

    // Listen for download progress
    window.electron.onUpdateProgress((progress: UpdateProgress) => {
      setProgress(progress);
    });

    return () => {
      // Cleanup listeners
    };
  }, []);

  const handleCheckForUpdates = () => {
    window.electron.checkForUpdates();
  };

  if (!status && !progress) return null;

  return (
    <div className="update-notification">
      {status && <p>{status}</p>}
      
      {progress && (
        <div className="update-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p>
            {Math.round(progress.percent)}% - 
            {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
            ({formatBytes(progress.bytesPerSecond)}/s)
          </p>
        </div>
      )}

      <button onClick={handleCheckForUpdates}>
        Check for Updates
      </button>
    </div>
  );
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
```

### 6. Add Preload Script

In `src/main/preload.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
  onUpdateStatus: (callback: (status: string) => void) => {
    ipcRenderer.on('update-status', (_, status) => callback(status));
  },
  
  onUpdateProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('update-download-progress', (_, progress) => callback(progress));
  }
});
```

## Update Server Setup

### Option 1: Static File Hosting (Recommended)

Host update files on any static file server:

- **Cloudflare R2** (Free tier: 10GB storage, 10M requests/month)
- **AWS S3** + CloudFront
- **DigitalOcean Spaces**
- **GitHub Releases** (Free for public repos)

### Option 2: electron-release-server

Self-hosted update server with admin UI:

```bash
git clone https://github.com/ArekSredzki/electron-release-server
cd electron-release-server
npm install
npm start
```

### Option 3: Nucleus

Commercial update server with analytics:

- https://nucleus.sh
- $29/month for unlimited apps

## File Structure

After building, electron-builder generates:

```
release/
├── latest-mac.yml              # macOS update metadata
├── latest-linux.yml            # Linux update metadata
├── latest.yml                  # Windows update metadata
├── PiyAPI-Notes-0.1.0-mac-universal.dmg
├── PiyAPI-Notes-0.1.0-mac-universal.zip    # For differential updates
├── PiyAPI-Notes-Setup-0.1.0.exe
├── PiyAPI-Notes-0.1.0.AppImage
└── ...
```

Upload these files to your update server at:

```
https://updates.piyapi.cloud/
```

## Update Metadata Format

Example `latest-mac.yml`:

```yaml
version: 0.2.0
files:
  - url: PiyAPI-Notes-0.2.0-mac-universal.zip
    sha512: abc123def456...
    size: 98765432
    blockMapSize: 12345
path: PiyAPI-Notes-0.2.0-mac-universal.zip
sha512: abc123def456...
releaseDate: '2024-02-24T10:00:00.000Z'
releaseNotes: |
  ## What's New
  - Added real-time transcription
  - Improved note expansion
  - Bug fixes and performance improvements
```

## Differential Updates

electron-updater supports differential updates (only downloads changed files):

### Enable for macOS

Use `.zip` files instead of `.dmg`:

```json
{
  "mac": {
    "target": ["zip"]
  }
}
```

### Enable for Windows

NSIS installers support differential updates by default.

### Enable for Linux

AppImage supports differential updates by default.

### Benefits

- 70-90% smaller downloads
- Faster updates
- Less bandwidth usage

## Testing Updates

### Local Testing

1. **Build version 0.1.0:**
   ```bash
   npm version 0.1.0
   npm run build
   ```

2. **Install and run the app**

3. **Build version 0.2.0:**
   ```bash
   npm version 0.2.0
   npm run build
   ```

4. **Set up local update server:**
   ```bash
   cd release
   python3 -m http.server 8080
   ```

5. **Configure app to use local server:**
   ```typescript
   autoUpdater.setFeedURL({
     provider: 'generic',
     url: 'http://localhost:8080'
   });
   ```

6. **Restart app** → Should detect and download update

### Staging Environment

Before production, test on staging:

```typescript
const updateServer = process.env.NODE_ENV === 'production'
  ? 'https://updates.piyapi.cloud'
  : 'https://staging-updates.piyapi.cloud';

autoUpdater.setFeedURL({
  provider: 'generic',
  url: updateServer
});
```

## Rollback Strategy

If an update causes issues:

1. **Remove bad version from update server**
2. **Upload previous stable version**
3. **Update `latest.yml` to point to stable version**
4. **Users will "update" back to stable version**

Example rollback:

```bash
# Remove bad version
rm PiyAPI-Notes-0.2.0-*

# Re-upload stable version
cp backup/PiyAPI-Notes-0.1.9-* .

# Update metadata
cat > latest-mac.yml << EOF
version: 0.1.9
files:
  - url: PiyAPI-Notes-0.1.9-mac-universal.zip
    sha512: ...
    size: ...
path: PiyAPI-Notes-0.1.9-mac-universal.zip
sha512: ...
releaseDate: '2024-02-24T10:00:00.000Z'
EOF
```

## Security

### Code Signing

Updates **must** be code-signed:

- **macOS**: Signed with Developer ID and notarized
- **Windows**: Signed with code signing certificate
- **Linux**: No signing required (but recommended)

### Checksum Verification

electron-updater automatically verifies SHA-512 checksums:

- Prevents corrupted downloads
- Prevents man-in-the-middle attacks
- Ensures integrity

### HTTPS Only

Always use HTTPS for update server:

```json
{
  "publish": {
    "provider": "generic",
    "url": "https://updates.piyapi.cloud"
  }
}
```

**Never use HTTP** - updates could be intercepted and modified.

## Monitoring

### Track Update Metrics

Log update events to analytics:

```typescript
autoUpdater.on('update-available', (info) => {
  analytics.track('Update Available', {
    version: info.version,
    currentVersion: app.getVersion()
  });
});

autoUpdater.on('update-downloaded', (info) => {
  analytics.track('Update Downloaded', {
    version: info.version,
    downloadTime: Date.now() - downloadStartTime
  });
});

autoUpdater.on('error', (err) => {
  analytics.track('Update Error', {
    error: err.message,
    version: app.getVersion()
  });
});
```

### Monitor Update Server

- **Uptime**: Use UptimeRobot or Pingdom
- **Bandwidth**: Monitor CDN usage
- **Errors**: Track 404s and 500s

## Troubleshooting

### "Cannot find latest.yml"

**Cause:** Update server not configured or files not uploaded

**Solution:**
1. Verify update server URL is correct
2. Check files are uploaded to correct location
3. Test URL in browser: `https://updates.piyapi.cloud/latest-mac.yml`

### "Update download failed"

**Cause:** Network error or corrupted file

**Solution:**
1. Check internet connection
2. Verify file exists on server
3. Check SHA-512 checksum matches

### "Update not detected"

**Cause:** Version comparison issue

**Solution:**
1. Verify version in `package.json` is incremented
2. Check `latest.yml` has correct version
3. Ensure version follows semver (e.g., 0.2.0, not 0.2)

### "Code signature invalid"

**Cause:** Update not signed or signature doesn't match

**Solution:**
1. Verify update is code-signed
2. Check signing certificate is valid
3. Re-sign and re-upload update

## Best Practices

1. **Always increment version** before building
2. **Test updates on staging** before production
3. **Keep old versions** for rollback
4. **Monitor update success rate**
5. **Provide release notes** in updates
6. **Don't force updates** (let users choose when)
7. **Handle errors gracefully** (don't crash app)
8. **Log update events** for debugging

## Resources

- [electron-updater Documentation](https://www.electron.build/auto-update)
- [Electron Release Server](https://github.com/ArekSredzki/electron-release-server)
- [Nucleus Update Server](https://nucleus.sh)
- [Cloudflare R2](https://www.cloudflare.com/products/r2/)
