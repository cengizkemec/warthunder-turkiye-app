# Güvenlik

## Desteklenen sürümler

Yalnızca en son GitHub sürümü güvenlik güncellemeleri alır.

- Son sürüm: https://github.com/cengizkemec/warthunder-turkiye-app/releases/latest

## Güvenlik açığı bildirimi

Lütfen güvenlik açıklarını herkese açık issue olarak açma. Depo sahibine GitHub üzerinden özel mesaj gönder veya GitHub Security Advisory özelliğini kullan.

## Kod imzalama

Windows SmartScreen, Norton ve Smart App Control için güvenilir bir kod imzalama sertifikası gerekir.

- Dağıtım dosyaları **OV veya EV kod imzalama sertifikası** ile imzalanmalıdır.
- EV sertifikası SmartScreen itibarını daha hızlı kazandırır.
- Self-signed sertifika yalnızca yerel test içindir; dağıtımda kullanılmamalıdır.
- Her sürümde aynı sertifika ve zaman damgası kullanılmalıdır.

Depodaki imzalama betiği:

```powershell
$env:WTTR_SIGN_PFX = 'C:\path\to\certificate.pfx'
$env:WTTR_SIGN_PASSWORD = 'pfx-password'
powershell -ExecutionPolicy Bypass -File scripts\sign.ps1
```

Script önce uygulama exe'sini, sonra kurulum paketini imzalar. Sertifika mağazası/EV token için:

```powershell
$env:WTTR_SIGN_THUMBPRINT = 'CERTIFICATE_THUMBPRINT'
powershell -ExecutionPolicy Bypass -File scripts\sign.ps1
```

## Güncelleme doğrulaması

- Uygulama güncelleme dosyasını indirdikten sonra **SHA-256** özetini doğrular.
- GitHub Releases assetlerinde GitHub’ın `sha256:` digest değeri kullanılır.
- `warthunder.tr` manifesti (`/api/desktop/config`) `desktopApp.sha256` alanını sağlar.
- Hash eksikse veya eşleşmezse kurulum başlatılmaz.
- Güncelleme yalnızca HTTPS ve `github.com`, `*.githubusercontent.com` veya `warthunder.tr` adreslerinden indirilir.

Kurulum dosyasının SHA-256’sını doğrulamak için:

```powershell
Get-FileHash .\WarThunderTurkiyeSetup-0.2.3.exe -Algorithm SHA256
Get-Content .\WarThunderTurkiyeSetup-0.2.3.exe.sha256
```

## Yanlış pozitif bildirimi

Antivirüs yazılımı uygulamayı yanlışlıkla tehdit olarak görürse aşağıdaki bilgilerle başvuru yapılabilir:

- Ürün: War Thunder Türkiye APP
- Üretici: Cengiz Kemec
- Site: https://warthunder.tr
- Kaynak kod: https://github.com/cengizkemec/warthunder-turkiye-app
- Sürüm: v0.2.3
- Kurulum dosyası SHA-256: (release sayfasındaki `.sha256` dosyası)
- Teknoloji: Rust + Tauri 2 + Microsoft Edge WebView2
- Davranış:
  - warthunder.tr sitesini WebView2 içinde açar.
  - Flarum oturumunu okur; kullanıcı adı/şifre saklamaz.
  - Bas-konuş için yalnızca kullanıcının seçtiği tuşu `GetAsyncKeyState` ile dinler; tuş loglamaz.
  - Güncelleme kontrolü için GitHub Releases ve warthunder.tr API'sine HTTPS isteği yapar.
  - Güncelleme dosyasını SHA-256 doğruladıktan sonra çalıştırır.
  - Reklam, telemetri veya gizli veri toplama yoktur.

Başvuru adresleri:

- Microsoft Defender/SmartScreen: https://www.microsoft.com/en-us/wdsi/filesubmission
- Norton: https://submit.norton.com/
- VirusTotal: https://www.virustotal.com/

## Görev Yöneticisi'nde WebView2

WebView2, Windows'ta `msedgewebview2.exe` adlı ayrı sandbox süreçlerinde çalışır. Bu süreçler uygulamanın parçasıdır; ana sürece gömme desteklenmez. Görev Yöneticisi'nde "WebView2" olarak görünmesi normaldir.

## Mikrofon izni

Windows, WebView2 tabanlı uygulamalarda mikrofon iznini "WebView2" adıyla gösterebilir. İzin verildiğinde mikrofon çalışır. Uygulama ayarlarındaki **Mikrofonu test et** düğmesi izin isteğini tetikler.

## Kaynak koddan doğrulama

```powershell
git clone https://github.com/cengizkemec/warthunder-turkiye-app
cd warthunder-turkiye-app
npm install
npm run tauri build
```

Üretilen exe ve kurulum paketi, release sayfasındaki dosyalarla karşılaştırılabilir. Build çıktısının hash'i birebir aynı olmayabilir (zaman damgası, ortam farkları); kaynak kod ve sürüm numarası doğrulanabilir.
