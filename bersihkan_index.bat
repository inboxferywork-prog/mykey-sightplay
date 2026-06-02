@echo off
setlocal EnableDelayedExpansion

set "DOWNLOAD_DIR=D:\Download D"
set "SONGS_DIR=D:\Download D\Project Apps Music Learning\mykey-sightplay\songs"
set "OLD_DIR=%SONGS_DIR%\old source"

if not exist "%OLD_DIR%" mkdir "%OLD_DIR%"

REM ====================================================
REM Backup index.json lama
REM ====================================================

if exist "%SONGS_DIR%\index.json" (

    for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i

    move "%SONGS_DIR%\index.json" "%OLD_DIR%\index_!TS!.json"

)

REM ====================================================
REM Ambil file index terbaru dari folder download
REM ====================================================

set "LATEST_FILE="

for /f "delims=" %%i in ('dir /b /a-d /o-d "%DOWNLOAD_DIR%\index*.json"') do (
    set "LATEST_FILE=%%i"
    goto :FOUND
)

:FOUND

echo.
echo LATEST_FILE = !LATEST_FILE!
echo.

if not defined LATEST_FILE (
    echo ERROR: Tidak menemukan file index*.json
    pause
    exit /b 1
)

REM Jangan pakai file index.json yang ada di folder download
if /i "!LATEST_FILE!"=="index.json" (
    echo ERROR: File terbaru ternyata index.json
    pause
    exit /b 1
)

copy /Y "%DOWNLOAD_DIR%\!LATEST_FILE!" "%SONGS_DIR%\index.json"

echo.
echo COPY ERRORLEVEL = %ERRORLEVEL%
echo.

if exist "%SONGS_DIR%\index.json" (
    echo BERHASIL
) else (
    echo GAGAL
)

pause