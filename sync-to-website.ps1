# sync-to-website.ps1
# Sync mykey-sightplay → mykey-music-labs/public/apps/sightplay/
#
# Usage:
#   .\sync-to-website.ps1           preview dulu (dry-run)
#   .\sync-to-website.ps1 -copy     langsung copy
#   .\sync-to-website.ps1 -copy -log  copy + simpan log ke sync.log

param(
    [switch]$copy,
    [switch]$log
)

$source = $PSScriptRoot
$dest   = Resolve-Path (Join-Path $PSScriptRoot "..\mykey-music-labs\public\apps\sightplay")

Write-Host ""
Write-Host "=== SightPlay Sync ===" -ForegroundColor Cyan
Write-Host "Source : $source"
Write-Host "Dest   : $dest"
Write-Host ""

$excludeDirs  = @('.git', 'node_modules')
$excludeFiles = @('sync-to-website.ps1', 'sync.log', 'package-lock.json')

if (-not $copy) {
    Write-Host "MODE: DRY-RUN (preview saja, tidak ada yang dicopy)" -ForegroundColor Yellow
    Write-Host "Jalankan dengan -copy untuk benar-benar sync." -ForegroundColor Yellow
    Write-Host ""
    robocopy "$source" "$dest" /E /L `
        /XD $excludeDirs `
        /XF $excludeFiles `
        /NP /NDL
} else {
    Write-Host "MODE: COPY" -ForegroundColor Green
    Write-Host ""

    if ($log) {
        robocopy "$source" "$dest" /E /XD $excludeDirs /XF $excludeFiles /NP /TEE /LOG:"$PSScriptRoot\sync.log"
    } else {
        robocopy "$source" "$dest" /E /XD $excludeDirs /XF $excludeFiles /NP
    }

    $exitCode = $LASTEXITCODE
    Write-Host ""

    if ($exitCode -le 7) {
        Write-Host "Sync selesai." -ForegroundColor Green
        Write-Host ""
        Write-Host "Langkah selanjutnya:" -ForegroundColor Cyan
        Write-Host "  1. Kalau ada lagu baru/berubah:"
        Write-Host "       cd ..\mykey-music-labs\public\apps\sightplay"
        Write-Host "       python tools/update_song_index.py"
        Write-Host "       python tools/export_sightplay_to_games.py --games-json ../../games.json"
        Write-Host "  2. Deploy:"
        Write-Host "       cd ..\mykey-music-labs"
        Write-Host "       firebase deploy --only hosting"
    } else {
        Write-Host "Ada error saat copy. Exit code: $exitCode" -ForegroundColor Red
        Write-Host "Cek apakah folder dest ada dan bisa diakses."
    }
}

Write-Host ""
