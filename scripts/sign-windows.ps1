param(
  [Parameter(Mandatory = $true)]
  [string]$PfxPath,

  [Parameter(Mandatory = $true)]
  [string]$PfxPassword,

  [string]$AppDir,
  [string]$InstallerDir,
  [string]$TimestampUrl = "http://timestamp.digicert.com",

  [switch]$NoTimestamp,
  [switch]$SkipApp,
  [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"

# $PSScriptRoot is not available while parameter defaults are evaluated on
# Windows PowerShell 5.1, so resolve the defaults here.
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $AppDir) {
  $AppDir = Join-Path $repoRoot "dist\win-unpacked"
}

if (-not $InstallerDir) {
  $InstallerDir = Join-Path $repoRoot "dist-installer"
}

if (-not (Test-Path $PfxPath)) {
  throw "PFX bulunamadi: $PfxPath"
}

$signTool = (Get-Command signtool.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source

if (-not $signTool) {
  $kitRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"

  if (Test-Path $kitRoot) {
    $kits = Get-ChildItem $kitRoot -Directory | Sort-Object Name -Descending

    foreach ($kit in $kits) {
      $candidate = Join-Path $kit.FullName "x64\signtool.exe"
      if (Test-Path $candidate) {
        $signTool = $candidate
        break
      }
    }
  }
}

if (-not $signTool) {
  throw "signtool.exe bulunamadi. Windows SDK'yi kurun veya Visual Studio Build Tools'a Windows SDK ekleyin."
}

Write-Host "signtool: $signTool"
Write-Host ""

$targets = @()

if (-not $SkipApp) {
  $targets += Join-Path $AppDir "wttr-app.exe"
  $targets += Join-Path $AppDir "resources\ptt-helper.exe"
}

if (-not $SkipInstaller -and (Test-Path $InstallerDir)) {
  $targets += Get-ChildItem $InstallerDir -Filter "wttr-app-Setup-*.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}

$targets = $targets | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

if ($targets.Count -eq 0) {
  throw "Imzalanacak dosya bulunamadi. Once uygulamayi/installer'i build edin."
}

foreach ($file in $targets) {
  Write-Host "Imzalaniyor: $file"

  $arguments = @(
    "sign",
    "/fd", "SHA256",
    "/f", $PfxPath,
    "/p", $PfxPassword
  )

  if (-not $NoTimestamp) {
    $arguments += @("/tr", $TimestampUrl, "/td", "SHA256")
  }

  $arguments += $file

  & $signTool @arguments

  if ($LASTEXITCODE -ne 0) {
    throw "Imzalama basarisiz: $file"
  }

  $signature = Get-AuthenticodeSignature -FilePath $file
  Write-Host "  Durum: $($signature.Status) - $($signature.StatusMessage)"
  Write-Host ""
}

Write-Host "Imzalama tamamlandi." -ForegroundColor Green
if ($NoTimestamp) {
  Write-Host "Not: zaman damgasi eklenmedi (-NoTimestamp)." -ForegroundColor Yellow
}
