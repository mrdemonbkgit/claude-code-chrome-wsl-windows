# Stop Chrome Bridge - All Components
# Cleanly shuts down Chrome and the Windows host

$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "  Stopping Chrome Bridge" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

# Find and kill node processes on port 19222
$hostProcs = Get-NetTCPConnection -LocalPort 19222 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($hostProcs) {
    foreach ($proc in $hostProcs) {
        Write-Host "[..] Stopping Windows host (PID: $proc)..." -ForegroundColor Yellow
        Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[OK] Windows host stopped" -ForegroundColor Green
} else {
    Write-Host "[--] Windows host not running" -ForegroundColor Gray
}

# Optionally stop Chrome (ask user)
$chromeProcs = Get-Process -Name chrome -ErrorAction SilentlyContinue
if ($chromeProcs) {
    Write-Host ""
    $response = Read-Host "Stop Chrome as well? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Write-Host "[..] Stopping Chrome..." -ForegroundColor Yellow
        Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Chrome stopped" -ForegroundColor Green
    } else {
        Write-Host "[--] Chrome left running" -ForegroundColor Gray
    }
}

# Clean up any orphaned node processes (from previous sessions)
$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcs) {
    Write-Host ""
    Write-Host "Found $($nodeProcs.Count) node process(es) still running." -ForegroundColor Yellow
    $response = Read-Host "Kill all node processes? (y/N)"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Stop-Process -Name node -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] All node processes killed" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Chrome Bridge Stopped" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
