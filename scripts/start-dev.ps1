# scripts/start-dev.ps1
# Starts both Frontend (Next.js Dashboard + Control Plane API) and Backend (Voice Runtime Agent)

param(
    [switch]$Inline = $false
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     Sigulon SaaS - Starting Frontend & Backend           " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify root .env.local
if (-not (Test-Path "$RootDir\.env.local")) {
    if (Test-Path "$RootDir\.env.example") {
        Write-Warning "No .env.local found. Copying .env.example to .env.local..."
        Copy-Item "$RootDir\.env.example" "$RootDir\.env.local"
    } else {
        Write-Error ".env.local missing and .env.example not found!"
        exit 1
    }
}

# 2. Verify voice-runtime/.env
$VoiceDir = Join-Path $RootDir "voice-runtime"
if (-not (Test-Path "$VoiceDir\.env")) {
    if (Test-Path "$VoiceDir\.env.example") {
        Write-Warning "No voice-runtime/.env found. Copying .env.example to voice-runtime/.env..."
        Copy-Item "$VoiceDir\.env.example" "$VoiceDir\.env"
    }
}

# 3. Locate Python executable for voice-runtime
$PythonExe = Join-Path $VoiceDir ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    $foundPy = Get-Command python -ErrorAction SilentlyContinue
    if ($foundPy) {
        $PythonExe = $foundPy.Source
    } else {
        $foundLauncher = Get-Command py -ErrorAction SilentlyContinue
        if ($foundLauncher) {
            $PythonExe = "py"
        } else {
            Write-Error "Python not found! Please run 'uv sync' or set up a virtual environment in voice-runtime."
            exit 1
        }
    }
}

Write-Host "[✓] Next.js Environment: $RootDir\.env.local" -ForegroundColor Green
Write-Host "[✓] Voice Runtime Environment: $VoiceDir\.env" -ForegroundColor Green
Write-Host "[✓] Voice Runtime Python: $PythonExe" -ForegroundColor Green

# 4. Verify & start Redis if not running
$redisListening = Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue
if (-not $redisListening) {
    Write-Host "Starting Redis server on port 6379..." -ForegroundColor Yellow
    $redisExe = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "redis-server.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($redisExe) {
        Start-Process -FilePath $redisExe.FullName -ArgumentList "--port 6379" -WorkingDirectory $redisExe.DirectoryName -WindowStyle Hidden
        Start-Sleep -Seconds 1
    }
}
$redisListening = Get-NetTCPConnection -LocalPort 6379 -State Listen -ErrorAction SilentlyContinue
if ($redisListening) {
    Write-Host "[✓] Redis Server: localhost:6379 (Running)" -ForegroundColor Green
} else {
    Write-Warning "Redis is not running on port 6379."
}
Write-Host ""

if ($Inline) {
    Write-Host "Starting Voice Runtime in the background..." -ForegroundColor Yellow
    $voiceProc = Start-Process -FilePath $PythonExe -ArgumentList "agent.py", "dev" -WorkingDirectory $VoiceDir -PassThru

    Write-Host "Starting Next.js Frontend & API on http://localhost:3000..." -ForegroundColor Yellow
    try {
        & npm run dev
    } finally {
        Write-Host "`nStopping Voice Runtime worker (PID $($voiceProc.Id))..." -ForegroundColor Yellow
        Stop-Process -Id $voiceProc.Id -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "Launching Voice Runtime (Backend LiveKit Agent) in a separate window..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host '--- Sigulon Voice Runtime Worker (LiveKit Agent) ---' -ForegroundColor Cyan; cd '$VoiceDir'; & '$PythonExe' agent.py dev"

    Write-Host "Starting Next.js (Frontend & API) on http://localhost:3000..." -ForegroundColor Yellow
    Write-Host "Press Ctrl+C to stop Next.js." -ForegroundColor Cyan
    & npm run dev
}
