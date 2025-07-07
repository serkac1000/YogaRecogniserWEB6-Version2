
# Troubleshooting Yoga Pose Recognition Executable

## Common Issues and Solutions

### ❌ "Failed to load the pose recognition model" Error

This error occurs when the app cannot connect to the internet to download the AI model.

**Possible Causes:**
1. No internet connection
2. Firewall/antivirus blocking the app
3. Corporate network restrictions
4. Model server temporarily unavailable

**Solutions:**

#### 1. Check Internet Connection
- Make sure you have a stable internet connection
- Try opening a web browser and visiting any website

#### 2. Firewall/Antivirus Settings
- Temporarily disable your antivirus/firewall
- Add the app to your antivirus whitelist
- Allow the app through Windows Firewall

#### 3. Network Restrictions
- If on a corporate network, ask IT to allow access to:
  - `teachablemachine.withgoogle.com`
  - `storage.googleapis.com`
- Try running the app on a different network (mobile hotspot)

#### 4. Windows Defender SmartScreen
- If Windows blocks the app, click "More info" then "Run anyway"
- Or right-click the exe → Properties → Unblock

### ⚠️ Camera Permission Issues

**Solution:**
- Go to Windows Settings → Privacy → Camera
- Enable "Allow apps to access your camera"
- Make sure the app has camera permission

### 🔧 Model URL Issues

If the default model doesn't work:
1. Open the app settings
2. Try these alternative model URLs:
   - `https://teachablemachine.withgoogle.com/models/5H-V2YcoQ/`
   - `https://teachablemachine.withgoogle.com/models/BmWV2_mfv/`

### 📋 Still Having Issues?

1. Right-click the executable and "Run as administrator"
2. Make sure all files are in the same folder as the .exe
3. Try running from a folder without special characters in the path
4. Restart your computer and try again

## Technical Notes

- The app requires internet connection on first run to download the AI model
- The model is about 10-20MB and downloads automatically
- Camera access is required for pose recognition
- The app works best with good lighting and clear camera view
