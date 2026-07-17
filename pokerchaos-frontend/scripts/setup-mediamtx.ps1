param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$FrontendRoot = Split-Path -Parent $PSScriptRoot
$InstallDirectory = Join-Path $FrontendRoot ".mediamtx"
$ExecutablePath = Join-Path $InstallDirectory "mediamtx.exe"
$ArchivePath = Join-Path $InstallDirectory "mediamtx.zip"

if ((Test-Path -LiteralPath $ExecutablePath) -and -not $Force) {
  Write-Host "MediaMTX is already installed at $ExecutablePath"
  return
}

$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
$assetArchitecture = switch ($architecture) {
  "X64" { "amd64" }
  "Arm64" { "arm64v8" }
  default { throw "Unsupported Windows architecture: $architecture" }
}

New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null

Write-Host "Finding the latest compatible MediaMTX v1 release..."
$headers = @{ "User-Agent" = "PlaybackPoker-local-stream-setup" }
$releases = Invoke-RestMethod `
  -Uri "https://api.github.com/repos/bluenviron/mediamtx/releases?per_page=20" `
  -Headers $headers
$release = $releases |
  Where-Object {
    -not $_.draft -and
    -not $_.prerelease -and
    $_.tag_name -match '^v1\.'
  } |
  Select-Object -First 1

if (-not $release) {
  throw "No stable MediaMTX v1 release was found."
}

$assetPattern = "_windows_${assetArchitecture}\.zip$"
$asset = $release.assets |
  Where-Object { $_.name -match $assetPattern } |
  Select-Object -First 1

if (-not $asset) {
  throw "Release $($release.tag_name) has no Windows $assetArchitecture archive."
}

Write-Host "Downloading MediaMTX $($release.tag_name) from $($asset.browser_download_url)"
Invoke-WebRequest `
  -Uri $asset.browser_download_url `
  -Headers $headers `
  -OutFile $ArchivePath

try {
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $InstallDirectory -Force
} finally {
  if (Test-Path -LiteralPath $ArchivePath) {
    Remove-Item -LiteralPath $ArchivePath -Force
  }
}

if (-not (Test-Path -LiteralPath $ExecutablePath)) {
  throw "The MediaMTX archive did not contain mediamtx.exe."
}

Write-Host "MediaMTX $($release.tag_name) installed successfully."
