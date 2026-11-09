# VC

Tarayıcıda çalışan sesli sohbet ve ekran paylaşımı uygulaması. Kullanıcılar isim yazarak misafir olarak oda açabilir/katılabilir ya da hesap oluşturup giriş yaparak kendi sunucularını kurabilir. Sunucularda davet bağlantısıyla katılınabilen ses kanalları bulunur. WebRTC medya bağlantılarını WebSocket sinyal sunucusunu kullanarak tarayıcılar arasında kurar; uygulama medya akışlarını almaz veya kaydetmez.

## Gereksinimler

- Node.js 20 veya üzeri
- Mikrofonu ve ekran paylaşımını başlatmak için `localhost` ya da HTTPS
- Farklı ağlardaki kullanıcılar için erişilebilir bir sunucu adresi; HTTPS/WSS önerilir

## Kurulum ve çalıştırma

```sh
npm install
npm start
```

Ardından `http://localhost:3000` adresini aç. Başka bir port seçmek için `PORT` ortam değişkenini ayarla.

İlk açılışta e-posta, uygulamada görünecek kullanıcı adı ve en az 8 karakterli şifreyle kayıt olabilir veya e-posta adresinle giriş yapabilirsin. Önceki sürümde oluşturulmuş e-postasız hesaplar kullanıcı adıyla giriş yapmaya devam edebilir. E-posta doğrulaması henüz bulunmaz. Şifreler `scrypt` ile özetlenerek `data/store.json` içinde saklanır. Profil ekranından görünen adını ve biyografini düzenleyebilir, üyelik tarihini görebilirsin. Kullanıcı ayarlarının Şifre ve Güvenlik bölümünde şifreni değiştirebilir, cihaz oturumlarını görüntüleyip kapatabilir ve arkadaşın olmayan kullanıcılardan özel mesaj almayı açıp kapatabilirsin; şifre değişikliği diğer cihazlardaki oturumları sonlandırır. Ses bölümünde mikrofon/hoparlör cihazını seçebilir, ses seviyelerini ayarlayabilir ve mikrofon ile hoparlörü test edebilirsin. Ses tercihleri tarayıcıda saklanır. Hesap sahibi ayrı sunucu panelinden birden fazla sunucu kurabilir, ses kanalları ekleyebilir ve sunucu/oda adlarını düzenleyebilir. Davet bağlantısını alan kullanıcılar hesap açmadan da sunucuya katılabilir. Hesaplar, üyelikler ve oturumlar sunucu yeniden başlatıldığında korunur; açıkça çıkış yapmadıkça tekrar giriş gerekmez. Oturum belirteçlerinin kendisi değil SHA-256 özeti kalıcılaştırılır.

Sunucu panelindeki davet düğmesi seçili sunucu için yeni bir davet kodu üretip bağlantıyı paylaşır; eski kod geçersiz olur. Sunucu ayarlarından adı ve fotoğrafı (PNG, JPEG veya WebP) değiştirebilir, sunucu şifresi ekleyebilir/değiştirebilir ya da kaldırabilirsin. Büyük fotoğraflar yüklemeden önce otomatik olarak 256 KB sınırına küçültülür. Sunucu şifresi şu an yalnızca ayar olarak saklanır, katılımı kısıtlamaz; sunucu şifreleri `scrypt` ile özetlenir.

## Windows uygulaması (.exe)

Windows'ta Node.js 20 veya üzeri kurulu bir geliştirme bilgisayarında:

```sh
npm install
npm run build:exe
```

Oluşturulan dosya `dist/VC.exe` konumundadır. Bu dosya uygulamanın web sunucusunu başlatır; uygulama tarayıcıda çalıştığı için `http://localhost:3000` adresini aç. Hesaplar ve mesajlar, çalıştırılabilir dosyanın yanındaki `dist/data/store.json` dosyasına kaydedilir. Bu `data` klasörünü ve yedeklerini koru; başka bir bilgisayarda dosyayı çalıştırırken klasör yazılabilir olmalıdır. Yeni bir bilgisayarda `.exe`'yi açmak için Node.js gerekmez.

Sol üstteki uygulama simgesi Arkadaşlar ekranını açar; çevrimiçi arkadaşları, tüm arkadaşları ve bekleyen istekleri görüntüleyebilir, kullanıcı adına göre yeni arkadaşlık isteği gönderebilirsin. Arkadaşlıklar ve istekler kalıcı olarak saklanır. Çevrimiçi durumu, kullanıcının kimliği doğrulanmış uygulama, sohbet veya ses bağlantılarından hesaplanır; birden fazla sekme/bağlantı varsa son bağlantı kapanana kadar çevrimiçi görünür. Arkadaş araması ve çevrimiçi/tüm arkadaşlar ile Şimdi Aktif listeleri kişiye tıklayarak kalıcı, gerçek zamanlı özel mesajlaşma açar. Kullanıcı ayarlarında özel mesajları etkinleştirmiş kişilerle arkadaş olmadan da arama sonuçlarından sohbet başlatabilirsin. Gelen özel mesajlar, arkadaşlık istekleri ve sohbet mesajlarında senden bahsedilmesi sol üstteki simgede okunmamış bildirim sayısını gösterir. Sunucu logoları sol şeritte kalır; bir logoya tıkladığında yalnızca o sunucunun odaları gösterilir.

Sunucu ayarlarından varsayılan izinleri düzenleyebilir; roller oluşturup ada göre arayabilir, rol rengi ve izinlerini değiştirebilir, rolleri üyelere atayabilirsin. Uygulanan rol izinleri sunucu yönetme, kanal yönetme, rol yönetme ve davet oluşturmadır; sunucu sahibi her zaman tüm izinlere sahiptir. Sunucuyu yönetme iznini yalnızca sunucu sahibi verebilir.
Masaüstünde sunucu listesinin sağ kenarını sürükleyerek genişliğini ayarlayabilirsin; tercih tarayıcıda saklanır. Klavyeyle ayırıcıya odaklanıp sağ/sol ok tuşlarını da kullanabilirsin.

Her sunucuda bir genel sohbet, her ses kanalında da kendine ait ayrı bir metin sohbeti bulunur. Mesajlar gerçek zamanlı iletilir ve her sohbetin son 100 mesajı `data/store.json` içinde saklanır.
Metin sohbetinde sağdaki Üyeler paneli, sunucu üyelerini çevrimiçi ve çevrimdışı olarak gerçek zamanlı gösterir.

Katılımcılar mikrofon erişimini onayladıktan sonra ses kanalına bağlanır; ekran paylaşımı tarayıcının yerel ekran seçicisiyle başlatılır. Ses kontrollerinin yanından kamerayı açabilir; ekran paylaşımı ve kamera için 1080p 60fps, 1080p 30fps veya 720p 30fps kalitesini seçebilirsin. Ses kanalı başına en fazla 12 kişi desteklenir.
Sesli odada konuşan katılımcıların profil simgesi yeşil bir halkayla vurgulanır; konuşma durunca vurgu söner.

## Ağ notları

Uygulama WebRTC için genel STUN hizmetini kullanır. İki kullanıcının ağları doğrudan medya bağlantısına izin vermediğinde güvenilir bağlantı için TURN hizmeti eklenip `public/app.js` içindeki `iceServers` ayarı dağıtım ortamına göre yapılandırılmalıdır. İnternetten erişimde HTTPS/WSS kullan. Bu sürümde e-posta doğrulaması, şifre sıfırlama ve sunucu/kanal moderasyon rolleri bulunmaz.

### Başka kişilerin çevrimiçi bağlanması

`.exe` tek başına internet üzerinde barındırma sağlamaz: sunucuyu çalıştıran bilgisayar açık ve internete bağlı kalmalıdır.

1. `VC.exe`'yi sürekli açık kalacak, güvenilir bir Windows bilgisayarda veya Windows sunucusunda çalıştır.
2. Yalnızca sunucu bilgisayarı `VC.exe`'yi çalıştırır; diğer kişiler `.exe`'yi değil, paylaşacağın web adresini tarayıcılarında açar. Aynı yerel ağda arayüze `http://SUNUCU_YEREL_IP:3000` adresinden ulaşılabilir. Windows Güvenlik Duvarı'nda TCP 3000 için gelen bağlantıya izin ver; internetten erişim için ayrıca yönlendiricide bu portu sunucu bilgisayarına yönlendirmek gerekir.
3. İnternetten mikrofon/kamera erişimi için HTTPS gerekir. Gerçek kullanıma açarken bir alan adı ve TLS sertifikası ayarla; HTTPS'i destekleyen bir ters vekil (ör. Caddy) üzerinden uygulamanın `localhost:3000` adresine yönlendir. WebSocket bağlantıları için vekilde WebSocket geçişinin etkin olması gerekir. Uygulamayı doğrudan HTTP ile internete açma.
4. Bazı kullanıcıların ses/video bağlantıları NAT veya güvenlik duvarı nedeniyle kurulamıyorsa kendi TURN hizmetini yapılandır. Uygulama verilerini düzenli yedekle ve sunucuyu güncel tut.

## Test

```sh
npm test
```
