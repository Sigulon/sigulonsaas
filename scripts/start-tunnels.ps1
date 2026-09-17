# Scripts/start-tunnels.ps1
# Starts Cloudflare tunnels for local Next.js (port 3000) and Voice Runtime (port 8000)
# and updates .env.local and voice-runtime/.env with the newly generated URLs.

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$CloudflaredBin = Join-Path $RootDir "cloudflared.exe"

if (-not (Test-Path $CloudflaredBin)) {
    $found = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($found) {
        $CloudflaredBin = $found.Source
    } else {
        Write-Error "cloudflared.exe not found in $RootDir or in system PATH."
        exit 1
    }
}

$WebLog = Join-Path $RootDir "cloudflared-web.log"
$RuntimeLog = Join-Path $RootDir "voice-runtime\cloudflared-runtime.log"

# Clean up old logs
if (Test-Path $WebLog) { Remove-Item $WebLog -Force }
if (Test-Path $RuntimeLog) { Remove-Item $RuntimeLog -Force }

Write-Host "Starting Cloudflare quick tunnels..." -ForegroundColor Cyan

# 1. Start web tunnel (port 3000)
$webProc = Start-Process -FilePath $CloudflaredBin -ArgumentList "tunnel", "--url", "http://localhost:3000", "--logfile", $WebLog -PassThru

# 2. Start voice-runtime tunnel (port 8000)
$runtimeProc = Start-Process -FilePath $CloudflaredBin -ArgumentList "tunnel", "--url", "http://127.0.0.1:8000", "--logfile", $RuntimeLog -PassThru

Write-Host "Waiting for tunnel URLs to be assigned..." -ForegroundColor Yellow

$webUrl = $null
$runtimeUrl = $null
$timeout = 20
$elapsed = 0

while ($elapsed -lt $timeout) {
    Start-Sleep -Seconds 1
    $elapsed++

    if (-not $webUrl -and (Test-Path $WebLog)) {
        $content = Get-Content $WebLog -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
            $webUrl = $matches[0]
        }
    }

    if (-not $runtimeUrl -and (Test-Path $RuntimeLog)) {
        $content = Get-Content $RuntimeLog -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-zA-Z0-9-]+\.trycloudflare\.com') {
            $runtimeUrl = $matches[0]
        }
    }

    if ($webUrl -and $runtimeUrl) {
        break
    }
}

if (-not $webUrl) {
    Write-Warning "Failed to capture web tunnel URL from $WebLog within $timeout seconds."
}
if (-not $runtimeUrl) {
    Write-Warning "Failed to capture voice runtime tunnel URL from $RuntimeLog within $timeout seconds."
}

if ($webUrl -and $runtimeUrl) {
    Write-Host ""
    Write-Host "Tunnels established successfully!" -ForegroundColor Green
    Write-Host "  Web App (port 3000)        : $webUrl" -ForegroundColor Cyan
    Write-Host "  Voice Runtime (port 8000)  : $runtimeUrl" -ForegroundColor Cyan
    Write-Host ""

    # Update .env.local
    $envLocalPath = Join-Path $RootDir ".env.local"
    if (Test-Path $envLocalPath) {
        $lines = Get-Content $envLocalPath
        $updatedLines = @()
        $hasWeb = $false
        $hasRuntime = $false

        foreach ($line in $lines) {
            if ($line -match "^PUBLIC_WEB_URL=") {
                $updatedLines += "PUBLIC_WEB_URL=$webUrl"
                $hasWeb = $true
            } elseif ($line -match "^VOICE_RUNTIME_URL=") {
                $updatedLines += "VOICE_RUNTIME_URL=$runtimeUrl"
                $hasRuntime = $true
            } else {
                $updatedLines += $line
            }
        }

        if (-not $hasWeb) { $updatedLines += "PUBLIC_WEB_URL=$webUrl" }
        if (-not $hasRuntime) { $updatedLines += "VOICE_RUNTIME_URL=$runtimeUrl" }

        Set-Content -Path $envLocalPath -Value $updatedLines
        Write-Host "Updated .env.local with new tunnel URLs." -ForegroundColor Green
    }

    # Update voice-runtime/.env
    $runtimeEnvPath = Join-Path $RootDir "voice-runtime\.env"
    if (Test-Path $runtimeEnvPath) {
        $lines = Get-Content $runtimeEnvPath
        $updatedLines = @()
        $hasWeb = $false

        foreach ($line in $lines) {
            if ($line -match "^PUBLIC_WEB_URL=") {
                $updatedLines += "PUBLIC_WEB_URL=$webUrl"
                $hasWeb = $true
            } else {
                $updatedLines += $line
            }
        }

        if (-not $hasWeb) { $updatedLines += "PUBLIC_WEB_URL=$webUrl" }
        Set-Content -Path $runtimeEnvPath -Value $updatedLines
        Write-Host "Updated voice-runtime\.env with PUBLIC_WEB_URL." -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "NOTE: Remember to restart 'npm run dev' and your voice-runtime so they reload .env!" -ForegroundColor Yellow
}
