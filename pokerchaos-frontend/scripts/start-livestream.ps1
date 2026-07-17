$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$FrontendRoot = Split-Path -Parent $PSScriptRoot
$ExecutablePath = Join-Path $FrontendRoot ".mediamtx\mediamtx.exe"
$ConfigPath = Join-Path $FrontendRoot "livestream\mediamtx.yml"
$SetupScript = Join-Path $PSScriptRoot "setup-mediamtx.ps1"

if (-not (Test-Path -LiteralPath $ExecutablePath)) {
  Write-Host "MediaMTX is not installed yet; running the one-time setup."
  & $SetupScript
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "MediaMTX configuration was not found at $ConfigPath"
}

Write-Host "Starting the local Playback Poker stream server..."
Write-Host "OBS WHIP URL: http://127.0.0.1:8889/mystream/whip"
Write-Host "Viewer:        http://localhost:5183/livestream/index.html"
Write-Host "Press Ctrl+C to stop the media server."

& $ExecutablePath $ConfigPath
exit $LASTEXITCODE
