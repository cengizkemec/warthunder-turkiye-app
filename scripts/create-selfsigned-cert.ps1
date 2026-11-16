param(
  [string]$Password = "WTTR-SelfSigned-ChangeMe!",
  [string]$OutputDir,
  [string]$Subject = "CN=WTTR Self-Signed, O=Cengiz Kemec, C=TR",
  [int]$Years = 3
)

$ErrorActionPreference = "Stop"

# $PSScriptRoot is not available while parameter defaults are evaluated on
# Windows PowerShell 5.1, so resolve the default output directory here.
if (-not $OutputDir) {
  $OutputDir = Join-Path (Split-Path -Parent $PSScriptRoot) "dist-signing"
}

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $Subject `
  -KeyUsage DigitalSignature `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -FriendlyName "WTTR Self-Signed Code Signing" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears($Years) `
  -KeyExportPolicy Exportable

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$pfxPath = Join-Path $OutputDir "wttr-selfsigned.pfx"
$cerPath = Join-Path $OutputDir "wttr-selfsigned.cer"
$securePassword = ConvertTo-SecureString $Password -AsPlainText -Force

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

Write-Host ""
Write-Host "Self-signed code signing certificate created." -ForegroundColor Green
Write-Host "Thumbprint: $($cert.Thumbprint)"
Write-Host "PFX:        $pfxPath"
Write-Host "CER:        $cerPath"
Write-Host ""
Write-Host "Bu sertifika yalnizca test/topluluk ici kullanim icindir." -ForegroundColor Yellow
Write-Host "Kullanicilar CER dosyasini guvenilen kok/yayinci deposuna eklemelidir:" -ForegroundColor Yellow
Write-Host "  certutil -addstore -user Root `"$cerPath`""
Write-Host "  certutil -addstore -user TrustedPublisher `"$cerPath`""
Write-Host ""
Write-Host "Imzalama:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\sign-windows.ps1 -PfxPath `"$pfxPath`" -PfxPassword `"<sifre>`""
