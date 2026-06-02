@echo off
REM update-index.cmd — Windows helper to regenerate songs/index.json
REM
REM Usage:
REM   1. Double-click this file, OR
REM   2. Run from Command Prompt: update-index.cmd
REM
REM What it does:
REM   - Scans songs/ folder for all *.json files
REM   - Regenerates songs/index.json with metadata
REM   - Preserves curation fields (listed, collectionId, tags)

setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo.
echo ========================================
echo   MyKey Song Index Updater
echo ========================================
echo.

if not exist "songs" (
    echo ERROR: songs/ folder not found
    echo Please run this script from project root
    pause
    exit /b 1
)

echo Scanning songs/ folder...
python tools/update_song_index.py
set exitcode=!errorlevel!

echo.
if !exitcode! equ 0 (
    echo ✓ Success! index.json has been regenerated.
    echo.
    echo Next steps:
    echo   - Reload song browser in your app
    echo   - New songs will appear in the library
) else (
    echo ✗ Error occurred. Check the messages above.
)

echo.
pause
exit /b !exitcode!
