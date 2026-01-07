# Start Chrome Bridge - All Components
# Run this before using browser automation in Claude Code
#
# Usage:
#   .\start-all.ps1                    # Use separate debug profile (default)
#   .\start-all.ps1 -Profile default   # Use your normal Chrome profile
#   .\start-all.ps1 -Profile debug     # Use separate debug profile
#
# Note: Using "default" profile will close any existing Chrome windows

param(
    [ValidateSet("default", "debug")]
    [string]$Profile = "debug"
)

$ErrorActionPreference = "SilentlyContinue"
$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$HostPath = "$PSScriptRoot\src\index.js"

# Set user data directory based on profile choice
if ($Profile -eq "default") {
    $UserDataDir = "$env:LOCALAPPDATA\Google\Chrome\User Data"
    $ProfileName = "Default (your normal profile)"
} else {
    $UserDataDir = "$env:USERPROFILE\chrome-debug-profile"
    $ProfileName = "Debug (separate profile)"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Chrome Bridge Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Profile: $ProfileName" -ForegroundColor Gray
Write-Host ""

# Check if Chrome debugging port is already active
$chromeDebug = netstat -an | findstr ":9222.*LISTENING"
if ($chromeDebug) {
    Write-Host "[OK] Chrome already running with debugging" -ForegroundColor Green
} else {
    Write-Host "[..] Starting Chrome with debugging..." -ForegroundColor Yellow

    # Kill existing Chrome to ensure clean debug startup
    Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
    Start-Sleep 2

    Start-Process $ChromePath -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=$UserDataDir"
    Start-Sleep 3

    # Verify
    $chromeDebug = netstat -an | findstr ":9222.*LISTENING"
    if ($chromeDebug) {
        Write-Host "[OK] Chrome started successfully" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Chrome failed to start with debugging" -ForegroundColor Red
        Write-Host "       Try closing all Chrome windows and run again" -ForegroundColor Gray
        exit 1
    }
}

# Check if Windows host is already running
$hostRunning = netstat -an | findstr ":19222.*LISTENING"
if ($hostRunning) {
    Write-Host "[OK] Windows host already running" -ForegroundColor Green
} else {
    Write-Host "[..] Starting Windows host..." -ForegroundColor Yellow

    # Kill any existing node processes on our port
    $nodeProcs = Get-NetTCPConnection -LocalPort 19222 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    foreach ($proc in $nodeProcs) {
        Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep 1

    Start-Process node -ArgumentList $HostPath -WindowStyle Hidden
    Start-Sleep 3

    # Verify
    $hostRunning = netstat -an | findstr ":19222.*LISTENING"
    if ($hostRunning) {
        Write-Host "[OK] Windows host started successfully" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Windows host failed to start" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Chrome Bridge Ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Chrome debugging: localhost:9222" -ForegroundColor Gray
Write-Host "WebSocket bridge: localhost:19222" -ForegroundColor Gray
Write-Host ""
Write-Host "You can now use browser tools in Claude Code (WSL)" -ForegroundColor Cyan
Write-Host ""
