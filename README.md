# War Thunder Türkiye APP

War Thunder Türkiye için Rust + Tauri tabanlı Windows masaüstü uygulaması.

Bu proje **Flarum Social eklentisinden bağımsızdır**. Foruma kod, rota veya eklenti eklemez; mevcut siteyi ve oturumu native bir Windows penceresinde kullanır.

## Özellikler

- Discord tarzı giriş / kayıt ekranı (site oturumu ve güvenlik doğrulaması korunur)
- Forum, blog ve sosyal bölümlerine doğrudan geçiş
- Son 10 forum konusunu ana ekranda gösterme
- Global **bas-konuş** (varsayılan: Alt) — uygulama arka planda olsa bile çalışır
- Uygulama içi **Ayarlar**: bas-konuş tuşu, 2. monitör, tepsi davranışı, mikrofon izinleri
- İkinci monitörde açılış ve “2. Monitöre Taşı” tepsi komutu
- Sistem tepsisi, tek örnek kilidi, kapatınca tepsiye küçültme
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
dist-installer\WarThunderTurkiyeSetup-0.1.0.exe
```

Tauri ayrıca şurada NSIS kurulumu da üretir:

```text
src-tauri\target\release\bundle\nsis\
```

## Mimari

- `dist/` — yerel dashboard / giriş ekranı
- `src-tauri/` — Rust tarafı: pencereler, tepsi, global bas-konuş, ayarlar, forum konuları API’si
- Site içeriği ayrı bir WebView2 penceresinde `https://warthunder.tr` üzerinden açılır
- Yerel dashboard ile site penceresi ayrıdır; site içeriğinin Tauri IPC’ye erişimi yoktur
- Bas-konuş, siteye sentetik klavye olayları göndererek çalışır. Social ses ayarlarında bas-konuş açık ve tuş **Alt** olmalıdır

## Yol haritası

- İmzalı kurulum ve otomatik güncelleme
- Native bildirimler ve tepsi rozeti
- Maç/oyun durumu entegrasyonu
- Özel ses cihazı seçimi

## Lisans

MIT
