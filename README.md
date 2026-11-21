# VC

Masaüstü uygulaması (Electron) + Web tabanlı sesli sohbet ve ekran paylaşımı uygulaması.

## Özellikler

- **Sesli odalar**: WebRTC ile düşük gecikmeli ses iletimi
- **Ekran paylaşımı**: Sistem sesi ile birlikte ekran/pencere paylaşımı (masaüstü uygulamasında)
- **Kamera**: Görüntülü arama desteği
- **Sunucular/Kanallar**: Discord benzeri yapıda sunucu ve ses kanalları
- **Arkadaş sistemi**: Arkadaş ekleme, özel mesajlaşma, grup sohbetleri
- **Otomatik güncelleme**: Electron-updater ile GitHub Releases'tan otomatik .exe güncellemesi
- **Hibrit mimari**: Varsayılan uzak sunucu (web verisi), isteğe bağlı yerel sunucu

## Mimari

```
┌─────────────────┐     HTTPS/WSS      ┌──────────────────┐
│  Masaüstü App   │ ◄─────────────────► │  Uzak Sunucu     │
│  (Electron)     │   Web verisi       │  (Railway/VPS)   │
└─────────────────┘                    └──────────────────┘
        │
        │ VC_LOCAL=1
        ▼
┌─────────────────┐
│  Yerel Sunucu   │
│  (localhost)    │
└─────────────────┘
```

- **Varsayılan**: Uygulama uzak sunucuya bağlanır → web ile **aynı veritabanı, aynı hesaplar**
- **Yerel mod**: `VC_LOCAL=1` ile tamamen offline/LAN çalışır

## Gereksinimler

- Node.js 20+
- Windows 10/11 (masaüstü uygulaması için)
- GitHub hesabı (otomatik güncelleme yayını için)

## Kurulum ve Geliştirme

```bash
# Bağımlılıkları yükle
npm install

# Geliştirme modu (yerel sunucu + Electron)
npm run dev

# Sadece yerel sunucu (tarayıcıda test)
VC_LOCAL=1 npm start
```

## Build ve Yayınlama

### 1. İlk Kurulum (Bir Kere)

**GitHub Token:**
1. GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic)
2. `repo` kapsamını işaretle → Generate token → Kopyala
3. PowerShell (Yönetici):
   ```powershell
   [Environment]::SetEnvironmentVariable("GH_TOKEN", "ghp_xxxxxxxxxxxx", "User")
   ```
   PowerShell'i yeniden başlatın.

### 2. Güncelleme Yayınlama (Her Sürümde)

```bash
# 1. Versiyon artır (patch: 1.0.0 → 1.0.1)
npm version patch

# 2. GitHub'a gönder (build + release otomatik)
git push && git push --tags

# VEYA manuel:
npm run publish:github
```

**Ne olur?**
- GitHub Actions build alır (5-10 dk)
- `dist/VC-Setup-x.x.x.exe` Release sayfasına yüklenir
- Kullanıcılar uygulamayı açtığında "Güncelleme var" uyarısı alır → arka planda indirip kurar

### 3. Sadece Build (Yayınlamadan)

```bash
npm run build:exe    # dist/VC-Setup-x.x.x.exe
npm run build:dir    # dist/win-unpacked/ (portable)
```

## Konfigürasyon

`main.js` içinde şu değerleri **kendi bilgilerinizle** değiştirin:

```javascript
// Uzak sunucu URL'niz (web siteniz)
const REMOTE_URL = 'https://SIZIN-WEB-ADRESINIZ.com';

// Auto-updater GitHub reposu
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'GITHUB_KULLANICI_ADINIZ',
  repo: 'REPO_ADINIZ',
});
```

`package.json` içinde:
```json
"publish": {
  "provider": "github",
  "owner": "GITHUB_KULLANICI_ADINIZ",
  "repo": "REPO_ADINIZ"
}
```

## Yerel Sunucu Modu (Offline/LAN)

Tamamen yerel veri ile çalışmak için:

```bash
# Geliştirme
VC_LOCAL=1 npm start

# Build alınca .exe'ye parametre geçirmek için:
VC_LOCAL=1 VC.exe
```

- Veriler: `%APPDATA%\VC\data\store.json` veya yanındaki `data/` klasöründe
- İnternet gerekmez, LAN'de çalışır
- Otomatik güncelleme **kapatılır**

## Proje Yapısı

```
vc-web1/
├── main.js              # Electron main process (auto-updater, screen picker)
├── preload.js           # Güvenli IPC köprüsü (vcDesktop API)
├── server.js            # WebSocket + HTTP sunucusu
├── package.json
├── .gitignore
├── desktop-icons/       # Uygulama simgeleri
├── public/              # Frontend (tarayıcı/Electron renderer)
│   ├── index.html
│   ├── app.js           # Ana uygulama mantığı
│   ├── styles.css
│   ├── mobile-nav.js
│   ├── shortcuts.js
│   └── desktop-update.js
├── test/                # Unit testler
└── data/                # Yerel veritabanı (gitignore'dır)
```

## Ağ Notları

- **WebRTC**: Varsayılan Google STUN (`stun:stun.l.google.com:19302`)
- **Production**: TURN servisi ekleyin (`public/app.js` → `iceServers`)
- **HTTPS/WSS**: İnternetten mikrofon/kamera için zorunlu
- **Port**: 3000 (değiştirmek için `PORT=3001 npm start`)

## Test

```bash
npm test
```

## Lisans

MIT