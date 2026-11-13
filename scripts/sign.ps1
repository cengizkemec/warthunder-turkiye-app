param(
  [string]$PfxPath = $env:WTTR_SIGN_PFX,
  [string]$PfxPassword = $env:WTTR_SIGN_PASSWORD,
  [string]$Thumbprint = $env:WTTR_SIGN_THUMBPRINT,
  [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
  Sort-Object FullName -Descending |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $signtool) {
  throw 'signtool.exe bulunamadı. Windows SDK yüklü olmalı.'
}

if (-not $Thumbprint -and -not $PfxPath) {
  throw 'WTTR_SIGN_THUMBPRINT veya WTTR_SIGN_PFX tanımlanmalı.'
}

$app = Join-Path $root 'src-tauri\target\release\warthunder-desktop.exe'
if (-not (Test-Path $app)) {
  throw "Uygulama derlemesi bulunamadı: $app"
}

function Sign-WithCertificate([string]$File) {
  if ($Thumbprint) {
    & $signtool sign /fd SHA256 /sha1 $Thumbprint /tr $TimestampUrl /td SHA256 $File
  } else {
    & $signtool sign /fd SHA256 /f $PfxPath /p $PfxPassword /tr $TimestampUrl /td SHA256 $File
  }

  if ($LASTEXITCODE -ne 0) {
    throw "İmzalama başarısız: $File"
  }

  & $signtool verify /pa /v $File
  if ($LASTEXITCODE -ne 0) {
    throw "İmza doğrulaması başarısız: $File"
  }
}

Write-Output "Uygulama imzalanıyor: $app"
Sign-WithCertificate $app

$iscc = 'C:\Program Files\Inno Setup 7\ISCC.exe'
if (-not (Test-Path $iscc)) {
  throw "Inno Setup bulunamadı: $iscc"
}

Write-Output 'Kurulum paketi oluşturuluyor...'
& $iscc (Join-Path $root 'installer\warthunder-tr.iss')
if ($LASTEXITCODE -ne 0) {
  throw 'Kurulum paketi oluşturulamadı.'
}

$installer = Get-ChildItem (Join-Path $root 'dist-installer') -Filter 'WarThunderTurkiyeSetup-*.exe' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $installer) {
  throw 'Kurulum paketi bulunamadı.'
}

Write-Output "Kurulum paketi imzalanıyor: $($installer.FullName)"
Sign-WithCertificate $installer.FullName

Write-Output ''
Write-Output 'İmzalama tamamlandı:'
Write-Output "  $app"
Write-Output "  $($installer.FullName)"
