# Çiziko (v1.0.0)
*Tunix · TGame sunar — gerçek zamanlı, takımlı çizim & tahmin oyunu.*

Next.js (web) + Express/Socket.IO (sunucu). Odalar, takım seçimi, hazır/başla, rakip takımın kelime oylaması, canlı çizim (pen/silgi, renk/kalınlık, temizle/geri al), tahmin ve puanlama + tur ilerlemesi.

---

## ✨ Özellikler
- **Odalar & Lobi:** Oda kodu ile giriş, takım seçimi (Cacık / Cücük), “Hazırım” mantığı, geri sayım.
- **Oyun akışı:**  
  1) **Rakip** takım 4 seçenekten kelimeyi **oylayarak** seçer (10 sn)  
  2) **Çizer** çizim yapar (45 sn)  
  3) Çizerin **takımı** tahmin eder (15 sn)
- **Puanlama:** Doğru başına **+10**, yanlış başına **-5** (çizen takım hanesine). Son tur **delta** puan gösterimi.
- **Çizim araçları:** Kalem/Silgi, renk ve kalınlık seçimi, **Temizle** ve **Geri Al**, 30Hz buffer ile düşük gecikmeli Socket.IO yayın.
- **UI ekstraları:** Tur ilerleme çubuğu, anlık kalan süre, doğru/yanlış yapanların isimleri, paylaş/kopyala linki, **Wake Lock** (ekran açık tut).
- **Mobil-dostu:** Dokunmatik destekli canvas.

---

## 🧱 Mimari / Klasör Yapısı
/server # Express + Socket.IO sunucu (TypeScript)
└─ src/index.ts

/web # Next.js istemci (TypeScript, React)
└─ pages/index.tsx (oyun ekranı)

---

## 🚀 Hızlı Başlangıç (Windows / PowerShell)
> Node.js 18+ ve npm/pnpm kurulu olmalı. (pnpm önerilir)

```powershell
# Repoyu klonla
git clone https://github.com/<kullanici>/<repo-adi>.git C:\Users\<SEN>\Desktop\Ciziko
cd C:\Users\<SEN>\Desktop\Ciziko

# Bağımlılıkları yükle
# (pnpm yoksa: npm i)
pnpm install

# Sunucu için .env (opsiyonel)
# PORT=4000 olarak çalışır; değiştirmek istersen:
# echo PORT=4000 > server\.env

# 1. Sunucuyu başlat
cd server
pnpm dev    # veya: npm run dev
# Sunucu: http://localhost:4000

# 2. Yeni bir terminal aç, web'i başlat
cd ..\web
# Socket URL'yi ön yüzde görünür kıl (prod/dev):
# echo NEXT_PUBLIC_SOCKET_URL=http://localhost:4000 > .env.local
pnpm dev    # veya: npm run dev
# Web: http://localhost:3000
Arkadaşların uzaktan bağlansın mı? Hızlı deneme için Cloudflare Tunnel:

# Sunucu terminalinde:
cloudflared tunnel --url http://localhost:4000
# Verilen trycloudflare.com adresini .env.local içinde NEXT_PUBLIC_SOCKET_URL olarak kullan.


Not: Hızlı tünel geçici ve prod için uygun değil.

⚙️ Script’ler (önerilen)

server/package.json

{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}


web/package.json

{
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000"
  }
}

🔌 Ortam Değişkenleri

Sunucu

PORT (varsayılan: 4000)

Web

NEXT_PUBLIC_SOCKET_URL → http://localhost:4000 (veya tünel/prod URL’n)

🎮 Nasıl Oynanır?

Sunucuyu ve web’i başlat.

Web’de isim ve oda kodu gir → Odaya Katıl.

Takımını seç → Hazırım.

Geri sayım sonrası tur başlar:

Rakip takım 4 kelime arasından oy vererek seçer (10 sn).

Çizer, gizli kelimeyi görür ve çizer (45 sn).

Çizen takım (çizer hariç) doğru seçeneği tahmin eder (15 sn).

Skorlar ve delta ekranda görünür. Tur ilerlemesi üstte.

Çizim Araçları (sadece çizer):

Kalem/Silgi modu

Renk: siyah, kırmızı, yeşil, mavi, mor, sarı

Kalınlık: 3, 6, 10, 16

Temizle (tuvali boşalt)

Geri Al (son çizgiyi sil)

🧠 Socket Olayları (Geliştiriciler için)

Client → Server

join_room { roomCode, name }

switch_team { team }

toggle_ready

word_vote { optionIndex }

guess_submit { optionIndex }

stroke_begin { x,y,w,tool,color }

stroke_point { points:[{x,y,t},...] }

stroke_end {}

brush_change { color?, w?, tool? }

canvas_clear

undo

heartbeat { t }

Server → Client

room_snapshot { code,status,players,teams,canStart,reason,scores,turnIndex,totalTurns }

start_countdown { t }

match_started

turn_setup_public { drawerId, team, turnIndex }

word_options { options, deadline } (sadece rakip takım)

secret_word { word, deadline } (sadece çizer)

draw_start { drawerId, team, options, deadline }

guess_phase { options, deadline } (çizen takım/çizer hariç)

turn_result { correctIndex, teamScores, delta?, correctGuessers?, wrongGuessers? }

game_over { scores }

Çizim relay: stroke_begin/point/end, brush_change, canvas_clear, undo

🧩 Sorun Giderme

Bağlanamıyor: NEXT_PUBLIC_SOCKET_URL doğru mu? Sunucu portu açık mı? Windows güvenlik duvarı izin verdi mi?

CORS: Sunucu cors({ origin: "*", methods:["GET","POST"] }) açık; değiştiyse istemci URL’sini ekle.

React “Invalid hook call”: Aynı projede birden fazla React kopyası/versiyon çakışması olabilir. node_modules temizleyip tek paket yöneticisi ile yükle.

Çizim gecikmesi: Tarayıcı sekmesi performansı, ağ durumu ve çizim buffer (30Hz) etkiler. (Ağ tünelleri de ek gecikme getirebilir.)

🛣️ Yol Haritası

Oda kalıcı alias, kalıcı tünel/host

Kişisel avatar/isim doğrulama

Mobil paketleme (Capacitor/EAS)

Anti-spam/anti-idle iyileştirmeleri

Çoklu dil

📜 Lisans

Bu repo için şimdilik lisans belirtilmedi (tüm hakları saklı). Ticari/üretim kullanımı için lütfen bizimle iletişime geçin.

❤️ İmza

Tunix – TGame
“Çiz, tahmin et, kazan.”
