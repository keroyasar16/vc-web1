# VC logo güncellemesi

## Web / Railway
Bu paketin içindeki dosyaları mevcut GitHub projesine, aynı dosyaların üzerine yükleyin. public klasörünü de eksiksiz yükleyin. Railway dağıtımı tamamlanınca sekmede logo görünür. Eski ikon görünürse sekmeyi kapatıp yeniden açın; gerekirse site önbelleğini temizleyin.

Sekme ikonu, site içindeki VC işaretleri, Apple dokunmatik ikonu ve web uygulaması manifesti eklendi. Sunucu ve mevcut uygulama özellikleri korunmuştur.

## Windows masaüstü ve setup
Bu ZIP mevcut Electron masaüstü projesini veya setup oluşturma dosyalarını içermiyor. Buradaki npm run build:exe komutu yerel Node sunucusunu paketler; mevcut çevrimiçi masaüstü istemcisinin kurucusu değildir. Bu komutu masaüstü güncellemesi için kullanmayın.

Hazır Windows ikonu: desktop-icons/vc.ico (16–256 piksel çoklu boyut).
PNG: desktop-icons/vc.png.

Mevcut Electron projesinde BrowserWindow seçeneklerine icon: path.join(__dirname, "desktop-icons", "vc.ico") ekleyin ve bu dosyaları paket kapsamına alın.

electron-builder kullanılıyorsa mevcut build ayarlarına aşağıdakileri birleştirin; diğer ayarları silmeyin:

```json
{
  "win": { "icon": "desktop-icons/vc.ico" },
  "nsis": {
    "installerIcon": "desktop-icons/vc.ico",
    "uninstallerIcon": "desktop-icons/vc.ico",
    "installerHeaderIcon": "desktop-icons/vc.ico"
  }
}
```

Sürüm numarasını artırıp mevcut Windows derleme komutuyla yeni setup oluşturulmalı. Yeni kurulumla EXE, masaüstü kısayolu ve kurucu ikonu güncellenir. Web dağıtımı tek başına mevcut kurulu EXE ikonunu değiştirmez.
Masaüstü kaynak projesi sağlandığında bu ayarlar doğrudan o projeye uygulanabilir.

Bu sürümde logonun dış zemini alfa transparandır. PNG ve ICO dosyaları buna göre yenilendi.
