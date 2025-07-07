
@echo off
echo Starting Yoga Pose Recognition App (7 Poses Version)...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if port 5000 is in use and kill processes using it
echo Checking port 5000...
netstat -ano | findstr :5000 >nul 2>&1
if not errorlevel 1 (
    echo Port 5000 is in use. Killing processes...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
        echo Killing PID %%a
        taskkill /PID %%a /F >nul 2>&1
    )
    echo Waiting for processes to terminate...
    timeout /t 2 /nobreak >nul
) else (
    echo Port 5000 is free.
)

REM Clear browser cache by adding timestamp to prevent caching
echo Clearing cache and preparing files...
set timestamp=%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set timestamp=%timestamp: =0%

REM Start the application with Python HTTP server on port 5000
echo Starting Yoga Pose Recognition App with 7 poses on port 5000...
echo.
echo IMPORTANT: Clear your browser cache or use Ctrl+F5 to refresh
echo Open: http://localhost:5000
echo.
python -m http.server 5000 --bind 0.0.0.0
if errorlevel 1 (
    echo Trying with python3...
    python3 -m http.server 5000 --bind 0.0.0.0
    if errorlevel 1 (
        echo Error: Python is not installed or not in PATH
        echo Please install Python from https://python.org/
        pause
        exit /b 1
    )
)

pause
