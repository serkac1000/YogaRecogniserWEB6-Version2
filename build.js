
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Yoga Pose Recognition App Build Process...\n');

// Check if node_modules exists
if (!fs.existsSync('node_modules')) {
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
}

// Create icon file if it doesn't exist
const iconPath = path.join(__dirname, 'icon.ico');
if (!fs.existsSync(iconPath)) {
    console.log('⚠️  Warning: icon.ico not found. Using default icon.');
}

// Build for Windows
try {
    console.log('🏗️  Building Windows executable...');
    
    // Set production environment
    process.env.NODE_ENV = 'production';
    
    execSync('npm run build-win', { 
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' }
    });
    console.log('✅ Windows build completed successfully!');
    console.log('📁 Executable files are in the "dist" folder');
    console.log('');
    console.log('⚠️  Important notes for the executable:');
    console.log('   • Make sure you have internet connection when running');
    console.log('   • The app needs to load the AI model from the internet');
    console.log('   • If you get model loading errors, check your firewall/antivirus');
} catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
}

console.log('\n🎉 Build process completed!');
console.log('You can find your executable files in the "dist" directory.');
