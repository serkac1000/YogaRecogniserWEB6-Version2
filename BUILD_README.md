
# Building Yoga Pose Recognition App

This guide will help you build an executable file from the Yoga Pose Recognition app.

## Prerequisites

- Node.js (version 16 or higher)
- npm (comes with Node.js)

## Quick Build (Windows)

1. Double-click `build.bat` to automatically build the Windows executable

## Manual Build Instructions

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build Executable

For Windows:
```bash
npm run build-win
```

For Linux:
```bash
npm run build-linux
```

For macOS:
```bash
npm run build-mac
```

### Step 3: Find Your Executable

After building, you'll find your executable files in the `dist` folder:

- **Windows**: `dist/Yoga Pose Recognition Setup.exe` (installer) and `dist/Yoga Pose Recognition.exe` (portable)
- **Linux**: `dist/Yoga Pose Recognition.AppImage`
- **macOS**: `dist/Yoga Pose Recognition.dmg`

## Build Options

- **NSIS Installer**: Creates a Windows installer that users can run to install the app
- **Portable**: Creates a standalone .exe file that doesn't require installation
- **AppImage**: Creates a Linux executable that runs without installation
- **DMG**: Creates a macOS disk image for distribution

## Troubleshooting

1. **Build fails**: Make sure all dependencies are installed with `npm install`
2. **Missing icon**: The build will work without an icon, but you can add `icon.ico` for Windows builds
3. **Permission errors**: Run your terminal/command prompt as administrator on Windows

## File Structure After Build

```
dist/
├── Yoga Pose Recognition Setup.exe    (Windows installer)
├── Yoga Pose Recognition.exe           (Windows portable)
├── win-unpacked/                       (Windows build files)
└── builder-debug.yml                   (Build debug info)
```

## Notes

- The built executable includes all necessary files and dependencies
- The app will work offline once built
- Camera permissions may need to be granted when first running the executable
