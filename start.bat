@echo off
:: ============================================================
:: Karaoke Extractor AI — Start Server (Windows)
:: ============================================================

echo Starting Karaoke Extractor AI...
echo.

:: Activate virtual environment
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
) else (
    echo ERROR: Virtual environment not found. Run setup.bat first.
    pause & exit /b 1
)

:: Launch Flask
echo Server starting at http://localhost:5000
echo Press Ctrl+C to stop.
echo.
start "" http://localhost:5000
python app.py
pause
