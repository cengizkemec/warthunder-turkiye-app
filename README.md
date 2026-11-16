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
- **Sesli oda overlay’i:** Sesli odadayken ekranın üstünde kalan küçük bir HUD;
  oda, katılımcılar, konuşan kişi, PTT durumu, mikrofon/sağırlaştırma/ayrıl
  düğmeleri. Daraltılabilir ve konumu hatırlanır.
- **Flarum Social entegrasyonu:** PTT tuşu `PATCH /api/social/me/profile` ile siteye
  senkronize edilir; sesli odalarda Flarum Social'in beklediği tuş olayları gönderilir.
- **Desktop Bridge:** `https://warthunder.tr/api/desktop/*` üzerinden oturum,
  bildirimler ve son konular alınır.
- **Windows bildirimleri:** Yeni Flarum bildirimleri masaüstü bildirimi olarak gösterilir.
- **GitHub üzerinden otomatik güncelleme:** Açılışta GitHub Releases ve site manifesti
  denetlenir, yeni sürüm arka planda indirilir ve uygulamadan çıkınca otomatik kurulur.
  Hemen kurmak için dock panelindeki "Yeniden başlat ve güncelle" kullanılabilir.
- **Görev Yöneticisi:** Paketlenmiş sürüm `wttr-app.exe` olarak çalışır; uygulama ikonu
  ve sürüm bilgisi exe'ye gömülüdür.

## Geliştirme

Gereksinimler:

- Windows 10/11 x64
- Node.js 20+
- Rust (yalnızca `ptt-helper` için)
- Visual Studio Build Tools (Rust MSVC hedefi için)
- Inno Setup 7 (kurulum paketi için; `ISCC.exe`)

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
npm run pack
& "C:\Program Files\Inno Setup 7\ISCC.exe" installer\wttr-app.iss
```

Inno Setup çıktısı:

```text
dist-installer\wttr-app-Setup-<sürüm>.exe
dist-installer\wttr-app-Setup-<sürüm>.exe.sha256
```

Kurulum kullanıcı bazlıdır (admin gerekmez), `{localappdata}\Programs\wttr`
klasörüne kurulur ve masaüstüne **`WTTR`** adlı kısayolu, Başlat menüsüne
`WTTR` grubunu ekler.

İmzalı yayın üretimi ve SignPath Foundation ayarları için
[`docs/SIGNING.md`](docs/SIGNING.md) dosyasına bakın.

Alternatif olarak electron-builder NSIS paketi de üretilebilir:

```powershell
npm run dist   # NSIS (opsiyonel, birincil dağıtım Inno Setup)
```

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

## Sesli oda overlay’i

Sesli bir odaya girildiğinde `wttr-app` küçük bir always-on-top HUD açar:

- Oda adı, katılımcı sayısı ve gecikme.
- Konuşan katılımcı yeşil halka ile işaretlenir.
- PTT canlı göstergesi (`CANLI`), mikrofon, sağırlaştırma, odaya git ve ayrıl
  düğmeleri.
- Başlık çubuğundan sürüklenebilir; daraltıldığında 264×50 px’lik bir şeride
  dönüşür. Konum `settings.json` içinde saklanır.
- Overlay, uygulama minimize/tepsideyken de görünür. War Thunder **exclusive
  fullscreen** modundaysa Electron penceresi görünmez; borderless/windowed
  modda çalışır.
- Dock’tan veya sistem tepsisinden açılıp kapatılabilir.

Overlay’in mikrofon/sağırlaştırma/ayrıl düğmeleri Flarum Social’in
`voiceSession` nesnesini kullanır. Sesli oda durumu sayfadan 600 ms’de bir
okunur; PTT tuşu ve canlı durum ana süreçten iletilir.

## Güncelleme

Uygulama iki kaynağı kontrol eder:

1. GitHub: `cengizkemec/warthunder-turkiye-app` son release
2. Site: `https://warthunder.tr/api/desktop/config`

Yeni sürüm varsa GitHub asset'i indirilir, SHA-256 doğrulanır ve kurulum dosyası
sessiz parametrelerle başlatılır; installer hem Inno Setup hem NSIS biçimini
destekler. Kurulumdan önce "Yeniden başlat ve güncelle" düğmesi gösterilir.

Yeni sürüm yayınlamak için:

```powershell
# package.json ve installer\wttr-app.iss sürümünü artır
npm version 1.0.1 --no-git-tag-version

# Uygulamayı paketle ve Inno Setup kurulumunu üret
npm run pack
& "C:\Program Files\Inno Setup 7\ISCC.exe" installer\wttr-app.iss

# SHA-256 dosyasını yaz
$file = "dist-installer\wttr-app-Setup-1.0.1.exe"
$hash = (Get-FileHash $file -Algorithm SHA256).Hash.ToLower()
"$hash  $(Split-Path $file -Leaf)" | Set-Content -Encoding ASCII "$file.sha256"

# GitHub release oluştur (gh CLI ile)
gh release create v1.0.1 $file "$file.sha256" `
  --repo cengizkemec/warthunder-turkiye-app `
  --title "wttr-app 1.0.1" --notes "Değişiklikler..." --latest
```

Ardından `warthunder-desktop-bridge` içindeki `desktopApp` alanını yeni sürüm,
`installerUrl` ve `sha256` ile güncelleyin; eklentiyi sunucuda yeniden yükleyin.

## Code signing policy

**Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).**

- Committers and reviewers: [@cengizkemec](https://github.com/cengizkemec)
- Approvers: [@cengizkemec](https://github.com/cengizkemec)
- Site policy page: <https://warthunder.tr/p/20-kod-imzalama-politikasi>
- Privacy policy: [docs/PRIVACY.md](docs/PRIVACY.md)
- Signing process and release checklist: [docs/SIGNING.md](docs/SIGNING.md)

The project applied to the SignPath Foundation program on 16 November 2026.
After approval, every release is built by GitHub Actions from this repository,
manually approved in SignPath, and signed by SignPath Foundation. The signed
files are `wttr-app.exe`, `resources/ptt-helper.exe`, and the Inno Setup
installer `wttr-app-Setup-<version>.exe`.

Until the application is approved, release files are unsigned and Windows
SmartScreen may show an “Unknown publisher” warning. The SHA-256 of each installer
is published with the release and in the site manifest so users can verify the
download.

### Yerel test / topluluk imzası

Kendi sertifikanızla yerel test yapmak için:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\create-selfsigned-cert.ps1
powershell -ExecutionPolicy Bypass -File scripts\sign-windows.ps1 `
  -PfxPath dist-signing\wttr-selfsigned.pfx `
  -PfxPassword "<sifre>"
```

Self-signed sertifika yalnızca test ve topluluk içi dağıtım içindir. Kullanıcı
`.cer` dosyasını güvenilen kök/yayıncı deposuna eklemedikçe SmartScreen uyarısı
devam eder.

### Antivirüs yanlış pozitifleri

İmza süreci tamamlanana kadar Defender/Norton yeni exe dosyalarını karantinaya
alabilir. Kalıcı çözüm imzalı yayındır. Geçici olarak:

- SmartScreen: **Daha fazla bilgi → Yine de çalıştır**
- Defender istisnası (yönetici PowerShell):

```powershell
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\Programs\wttr"
```

- Norton: `%LOCALAPPDATA%\Programs\wttr` klasörünü istisnalara ekleyin.

Yanlış pozitif bildirimi için `docs/SIGNING.md` içindeki Microsoft/Norton
bağlantılarını kullanın. Antivirüsü tüm sistemde kapatmayın.

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
src/screen-picker/ Ekran/pencere seçici arayüzü
src/shared/      PTT tuş haritası
ptt-helper/      Rust global bas-konuş yardımcısı
installer/       Inno Setup kurulum betiği
docs/            Kod imzalama ve gizlilik politikası
assets/          ikon, tray ikonu, giriş arka planı
scripts/         tuş haritası üretici, yardımcı derleme, imzalama
```

## Bilinen notlar

- **Turnstile hatası:** 1.1.0 ile `challenges.cloudflare.com` iframe’ine gereken
  storage izinleri verildi. Giriş ekranındaki **Doğrulamayı yenile** bağlantısı
  widget’ı yeniden yükler. Sorun sürerse VPN’i kapat, ağı değiştir veya birkaç
  dakika sonra tekrar dene.
- WebView2/Electron alt süreçleri Görev Yöneticisi'nde görünür; bu normaldir. Ana
  uygulama süreci paketlenmiş sürümde `wttr-app.exe` olarak görünür.
- Windows mikrofon gizlilik ayarlarında uygulama Electron/Chromium süreci olarak
  listelenebilir. `Mikrofonu test et` ile izin isteğini tetikleyin.
- Flarum oturumu `persist:warthunder` Electron oturumunda saklanır. Tarayıcıdaki
  oturum uygulamaya taşınmaz; ilk açılışta bir kez giriş yapılır.
- Eski Tauri sürümü GitHub üzerinden bu Electron sürümünü görür; indirilen
  kurulum dosyasını takip ederek geçiş yapabilir.
