@echo off
:: ============================================================
:: Karaoke Extractor AI — Windows Setup Script
:: Run this once to install all dependencies.
:: ============================================================

echo.
echo  ██╗  ██╗ █████╗ ██████╗  █████╗  ██████╗ ██╗  ██╗███████╗
echo  ██║ ██╔╝██╔══██╗██╔══██╗██╔══██╗██╔═══██╗██║ ██╔╝██╔════╝
echo  █████╔╝ ███████║██████╔╝███████║██║   ██║█████╔╝ █████╗
echo  ██╔═██╗ ██╔══██║██╔══██╗██╔══██║██║   ██║██╔═██╗ ██╔══╝
echo  ██║  ██╗██║  ██║██║  ██║██║  ██║╚██████╔╝██║  ██╗███████╗
echo  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝
echo                   Extractor AI — Setup
echo.

:: ── 1. Check Python ─────────────────────────────────────────────────────────
echo [1/5] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python not found. Download from https://python.org and re-run.
    pause & exit /b 1
)
python --version

:: ── 2. Check pip ────────────────────────────────────────────────────────────
echo.
echo [2/5] Upgrading pip...
python -m pip install --upgrade pip

:: ── 3. Check FFmpeg ─────────────────────────────────────────────────────────
echo.
echo [3/5] Checking FFmpeg...
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  *** FFmpeg NOT found ***
    echo  Please install FFmpeg manually:
    echo    1. Download from https://www.gyan.dev/ffmpeg/builds/ (ffmpeg-release-essentials.zip)
    echo    2. Extract to C:\ffmpeg
    echo    3. Add C:\ffmpeg\bin to your system PATH
    echo    4. Re-run this script.
    echo.
    pause & exit /b 1
)
echo FFmpeg found.

:: ── 4. Create virtual environment ───────────────────────────────────────────
echo.
echo [4/5] Creating virtual environment...
if not exist venv (
    python -m venv venv
    echo Virtual environment created.
) else (
    echo Virtual environment already exists, skipping.
)

:: ── 5. Install Python packages ───────────────────────────────────────────────
echo.
echo [5/5] Installing Python packages (this may take a few minutes)...
call venv\Scripts\activate.bat
pip install -r requirements.txt

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Package installation failed. Check the output above.
    pause & exit /b 1
)

:: ── Done ────────────────────────────────────────────────────────────────────
echo.
echo ============================================================
echo  Setup complete!
echo ============================================================
echo.
echo  To start the app, run:  start.bat
echo  Or manually:
echo    venv\Scripts\activate
echo    python app.py
echo.
pause
