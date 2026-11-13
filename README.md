# War Thunder Türkiye APP

War Thunder Türkiye için Rust + Tauri tabanlı Windows masaüstü uygulaması.

Bu proje **Flarum Social eklentisinden bağımsızdır**. Foruma kod, rota veya eklenti eklemez; mevcut siteyi ve oturumu native bir Windows penceresinde kullanır.

## Özellikler

- Login-first açılış: giriş yapılmadan Forum, Blog ve Sosyal bölümleri açılmaz
- Site oturumu WebView2 profilinde saklanır; çıkış yapılmadığı sürece tekrar giriş istenmez
- Discord tarzı giriş / kayıt ekranı; giriş siteye ait gerçek form ve güvenlik doğrulaması ile tamamlanır
- Forum, blog ve sosyal bölümlerine doğrudan geçiş
- Forum üst menüsündeki Forum, Sosyal, Discord, Destek, İndir, Araçlar, TV ve Yasal bağlantıları
- Son 10 forum konusunu ana ekranda gösterme
- Global **bas-konuş** — uygulama arka planda olsa bile çalışır
- Uygulama içi **Ayarlar**: istenen tuşu bas-konuş olarak atama (Caps Lock, harfler, fonksiyon tuşları ve daha fazlası), bas-konuş aç/kapat, tepsi davranışı, mikrofon izinleri
- GitHub Releases üzerinden sürüm kontrolü ve tek tıkla güncelleme indirme
- Sistem tepsisi, tek örnek kilidi, kapatınca tepsiye küçültme, manuel “2. Monitöre Taşı”
- WebView2 tabanlı native pencere; site oturumu, Pusher ve LiveKit aynen çalışır

## Gereksinimler

- Windows 10/11 x64
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (Windows 10/11'de genellikle kuruludur)
- Geliştirme için: Rust, Node.js 20+, Visual Studio Build Tools

## Geliştirme

```powershell
npm install
npm run dev
```

## Windows kurulum paketi

```powershell
npm install
npm run tauri build
```

Ardından Inno Setup ile kurulum dosyasını üret:

```powershell
& "C:\Program Files\Inno Setup 7\ISCC.exe" installer\warthunder-tr.iss
```

Çıktı:

```text
dist-installer\WarThunderTurkiyeSetup-0.2.1.exe
```

Tauri ayrıca şurada NSIS kurulumu da üretir:

```text
src-tauri\target\release\bundle\nsis\
```

## Oturum köprüsü

Uygulama, gizli ana pencerede `warthunder.tr` sayfasını yükler ve sayfaya küçük bir oturum okuyucu enjekte eder. Sayfa, oturum durumunu `https://warthunder.tr/__wttr_desktop/session` adresine bildirir; Rust tarafı bu yönlendirmeyi yakalar, isteği siteye göndermeden iptal eder ve dashboard'u günceller. Site içeriğinin Tauri IPC'ye erişimi yoktur.

İsteğe bağlı `warthunder-desktop-bridge` eklentisi, `/api/desktop/session` yedeğini ve `warthunder.tr` üzerinden güncelleme manifestini sağlar. Uygulama bu eklenti olmadan da Flarum oturumunu okuyabilir.

Bas-konuş, siteye `WTTRDesktop.setPTT` üzerinden bildirilir. Social ses ayarlarında bas-konuş açık olmalıdır; masaüstü uygulamasındaki tuş yalnızca global kısayoldur ve Social tarafındaki tuştan bağımsız çalışır.

## Sorun giderme

### “Oturum kontrol ediliyor” ekranında kalıyor

- İnternet bağlantısını ve `https://warthunder.tr` erişimini kontrol et.
- Norton 360, Smart App Control veya benzeri güvenlik yazılımları imzasız yeni derlemeyi ilk açılışta karantinaya alabilir. Uygulamaya izin ver, ardından **Tekrar dene** düğmesine bas.
- Kurulumdan sonra uygulamayı bir kez normal olarak açıp siteye erişebildiğini doğrula.

### Giriş yaparken Turnstile / çerez bildirimi

Giriş penceresinde Turnstile doğrulaması etkileşimli çıkabilir. Doğrulamayı tamamlayıp **Giriş Yap** düğmesine bas. Çerez bildirimi giriş sırasında gizlenir; giriş sonrası siteyi kullanırken yeniden görünebilir.

### Bas-konuş çalışmıyor

- Social sesli oda ayarlarında bas-konuşun açık olduğundan emin ol.
- Uygulama Ayarlar ekranından farklı bir tuş atayıp tekrar dene.
- Mikrofon izninin Windows gizlilik ayarlarında açık olduğunu kontrol et.

### Güvenlik yazılımı uygulamayı siliyor veya engelliyor

İmzasız release dosyaları Norton/Smart App Control tarafından engellenebilir. Dağıtım için kod imzalama sertifikası kullanılması önerilir. Test sırasında uygulama klasörünü güvenlik yazılımının istisna listesine ekle.

## Mimari

- `dist/` — yerel dashboard / giriş ekranı
- `src-tauri/` — Rust tarafı: pencereler, tepsi, global bas-konuş, ayarlar, forum konuları API'si, oturum köprüsü ve güncelleme kontrolü
- Site içeriği ayrı bir WebView2 penceresinde `https://warthunder.tr` üzerinden açılır
- Yerel dashboard ile site penceresi ayrıdır; site içeriğinin Tauri IPC'ye erişimi yoktur
- Ayarlar `%LOCALAPPDATA%\tr.warthunder.desktop\settings.json` altında saklanır

## Yol haritası

- İmzalı kurulum ve otomatik güncelleme
- Native bildirimler ve tepsi rozeti
- Maç/oyun durumu entegrasyonu
- Özel ses cihazı seçimi

## Lisans

MIT
