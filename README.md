# wttr-app

War Thunder Türkiye için Electron tabanlı Windows masaüstü uygulaması.

Uygulama siteyi yeniden yazmaz; `https://warthunder.tr` deneyimini gerçek Flarum
oturumu, Flarum Social sesli odaları ve global bas-konuş ile masaüstüne taşır.
Kurulan çalıştırılabilir dosya **`wttr-app.exe`** olarak üretilir.

## Özellikler

- **Site-first ve sosyal odaklı:** Uygulama doğrudan `https://warthunder.tr/social`
  akışında açılır.
- **Flarum'un varsayılan girişi:** Kullanıcı adı/şifre, Discord, Google, Steam ve
  passkey girişleri Flarum'un kendi giriş ekranıyla çalışır.
- **Beni hatırla:** Flarum'un `flarum_remember` çerezi ile oturum kalıcıdır. İşaretliyse
  uygulama yeniden açıldığında doğrudan sosyal akışa girilir; çıkış yapılınca giriş
  ekranı geri gelir.
- **Uygulama içi bas-konuş:** Tuş ataması, bas-konuşu açma/kapama, mikrofon testi ve
  Windows mikrofon ayarları uygulama panelinden yapılır.
- **Arka planda bas-konuş:** Uygulama minimize edilse veya tepsiye küçültülse bile
  global bas-konuş çalışır. `backgroundThrottling` kapalıdır.
- **Flarum Social entegrasyonu:** PTT tuşu `PATCH /api/social/me/profile` ile siteye
  senkronize edilir; sesli odalarda Flarum Social'in beklediği tuş olayları gönderilir.
- **Desktop Bridge:** `https://warthunder.tr/api/desktop/*` üzerinden oturum,
  bildirimler ve son konular alınır.
- **Windows bildirimleri:** Yeni Flarum bildirimleri masaüstü bildirimi olarak gösterilir.
- **GitHub üzerinden otomatik güncelleme:** Açılışta GitHub Releases denetlenir, yeni
  sürüm arka planda indirilir; "Yeniden başlat ve güncelle" ile kurulur.
- **Görev Yöneticisi:** Paketlenmiş sürüm `wttr-app.exe` olarak çalışır; uygulama ikonu
  ve sürüm bilgisi exe'ye gömülüdür.

## Geliştirme

Gereksinimler:

- Windows 10/11 x64
- Node.js 20+
- Rust (yalnızca `ptt-helper` için)
- Visual Studio Build Tools (Rust MSVC hedefi için)

```powershell
npm install
node node_modules\electron\install.js

# Global bas-konuş yardımcısını derle
npm run build:helper

# Geliştirme modunda çalıştır
npm start
```

> `npm start` geliştirme modunda `electron.exe` kullanır; Görev Yöneticisi'nde Electron
> görünür. `wttr-app.exe` adını ve uygulama ikonunu görmek için paketlenmiş sürümü
> çalıştırın veya `dist\wttr-app-Setup-*.exe` ile kurun.

### Paketleme

```powershell
npm run pack   # dist\win-unpacked\wttr-app.exe
npm run dist   # dist\wttr-app-Setup-<sürüm>.exe
```

Kurulum NSIS tabanlıdır ve kullanıcı bazlı kurulur (`perMachine: false`). Kurulumda
masaüstü ve Başlat menüsü kısayolları oluşturulur.

## Bas-konuş

Varsayılan tuş `Alt`'tır. Uygulama panelinden `Bas-konuş tuşu` düğmesine basıp istenen
tuşa basılarak değiştirilir. Desteklenen tuşlar `src/shared/keymap.js` içinde üretilir
(A-Z, 0-9, F1-F24, yön tuşları, medya tuşları, Caps Lock, Space, vb.).

Akış:

1. `ptt-helper.exe` Windows `GetAsyncKeyState` ile yalnızca seçilen tuşu izler.
2. Yardımcı süreç `ptt-worker.js` içinde ayrı bir Node worker thread'inde çalıştırılır;
   böylece Windows Defender'ın exe taraması ana pencereyi dondurmaz.
3. Ana süreç, `keydown`/`keyup` olaylarını sayfaya gönderir.
4. Sayfa, Flarum Social'in beklediği tuş olaylarını ve `wttr-desktop-ptt` olayını
   yayınlar. Uygulama tuşu ile site tuşu farklıysa ikisi de gönderilir.
5. PTT tuşu, uygulama panelinden değiştirildiğinde siteye `voice_settings` olarak
   kaydedilir.

## Güncelleme

Uygulama iki kaynağı kontrol eder:

1. GitHub: `cengizkemec/warthunder-turkiye-app` son release
2. Site: `https://warthunder.tr/api/desktop/config`

Yeni sürüm varsa GitHub asset'i indirilir, SHA-256 doğrulanır ve NSIS kurulumu
`/S` ile başlatılır. Kurulumdan önce "Yeniden başlat ve güncelle" düğmesi gösterilir.

Yeni sürüm yayınlamak için:

```powershell
# package.json sürümünü artır
npm version 1.0.1 --no-git-tag-version
npm run dist

# GitHub release oluştur (gh CLI ile)
gh release create v1.0.1 dist\wttr-app-Setup-1.0.1.exe `
  dist\wttr-app-Setup-1.0.1.exe.sha256 `
  --repo cengizkemec/warthunder-turkiye-app `
  --title "wttr-app 1.0.1" --notes "Değişiklikler..." --latest
```

Ardından `warthunder-desktop-bridge` içindeki `desktopApp` alanını yeni sürüm,
`installerUrl` ve `sha256` ile güncelleyin; eklentiyi sunucuda yeniden yükleyin.

## Antivirüs ve kod imzalama

Bu projede obfuscation, UPX veya eksik imzalı otomatik çalıştırma yoktur. Ancak
**imzasız** yeni bir NSIS kurulum dosyası SmartScreen, Norton veya Defender tarafından
uyarıyla karşılanabilir. Bunu tamamen garantilemek mümkün değildir; dağıtım için
OV/EV kod imzalama sertifikası gerekir.

electron-builder imzalamayı ortam değişkenlerinden okur:

```powershell
$env:CSC_LINK = "C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "pfx-password"
npm run dist
```

`ptt-helper.exe` ayrı bir çalıştırılabilir olduğu için aynı sertifikayla imzalanmalıdır:

```powershell
signtool sign /f certificate.pfx /p password /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 `
  ptt-helper\target\release\wttr-ptt-helper.exe
```

Kurulum sonrası Defender/SmartScreen istisnası gerekirse uygulama klasörünü ve
`wttr-app.exe` dosyasını güvenilir listeye ekleyin.

## Sunucu tarafı

`warthunder-desktop-bridge` eklentisi Flarum 2 için `warthunder.tr` sunucusunda
etkinleştirilmelidir. Sağladığı uçlar:

- `GET /api/desktop/config`
- `GET /api/desktop/session`
- `GET /api/desktop/notifications`
- `GET /api/desktop/discussions`

Eklenti ayrıca `window.WTTRDesktop` köprüsünü yükler. Uygulama, oturum bilgisini
mümkünse doğrudan `window.app.session` üzerinden de okur; bridge geçici olarak
erişilemezse temel oturum algılama çalışmaya devam eder.

## Dosya düzeni

```text
src/main/        Electron ana süreç: pencere, IPC, tray, güncelleme, PTT
src/preload/     contextBridge API
src/renderer/    site.js (Flarum köprüsü), dock.js/css, offline.html
src/shared/      PTT tuş haritası
ptt-helper/      Rust global bas-konuş yardımcısı
assets/          ikon, tray ikonu, giriş arka planı
scripts/         tuş haritası üretici, yardımcı derleme
```

## Bilinen notlar

- WebView2/Electron alt süreçleri Görev Yöneticisi'nde görünür; bu normaldir. Ana
  uygulama süreci paketlenmiş sürümde `wttr-app.exe` olarak görünür.
- Windows mikrofon gizlilik ayarlarında uygulama Electron/Chromium süreci olarak
  listelenebilir. `Mikrofonu test et` ile izin isteğini tetikleyin.
- Flarum oturumu `persist:warthunder` Electron oturumunda saklanır. Tarayıcıdaki
  oturum uygulamaya taşınmaz; ilk açılışta bir kez giriş yapılır.
- Eski Tauri sürümü GitHub üzerinden bu Electron sürümünü görür; indirilen NSIS
  kurulumunu takip ederek geçiş yapabilir.
