Çiziko (v1.0.0)

Tunix · TGame sunar — gerçek zamanlı, takımlı çizim & tahmin oyunu.

Stack: Next.js (web) + Express/Socket.IO (sunucu) — Odalar, takım seçimi, hazır/başla, rakip takımın kelime oylaması, canlı çizim (kalem/silgi, renk/kalınlık, temizle/geri al), tahmin & puanlama, tur ilerlemesi.

✨ Özellikler

Odalar & Lobi: Oda kodu ile giriş, takım seçimi (Cacık / Cücük), “Hazırım” mantığı, geri sayım.

Oyun Akışı:

Rakip takım 4 seçenekten kelimeyi oylayarak seçer (10 sn)

Çizer kelimeyi çizer (45 sn)

Çizerin takımı tahmin eder (15 sn)

Puanlama: Doğru +10, yanlış −5 (çizen takım hanesine). Son tur delta puan gösterimi.

Çizim Araçları: Kalem/Silgi, renk & kalınlık seçimi, Temizle, Geri Al. 30 Hz buffer ile düşük gecikmeli Socket.IO yayın.

UI Ekstraları: Tur ilerleme çubuğu, kalan süre, doğru/yanlış yapanların isimleri, paylaş/kopyala linki, Wake Lock (ekran açık tut).

Mobil-dostu: Dokunmatik destekli canvas.

🧱 Monorepo / Klasör Yapısı
Çiziko/
├─ apps/
│  ├─ server/           # Express + Socket.IO (TypeScript)
│  │  ├─ src/index.ts
│  │  └─ package.json
│  └─ web/              # Next.js istemci (TypeScript, React)
│     ├─ pages/index.tsx (oyun ekranı)
│     └─ package.json
├─ package.json         # (varsa) workspace tanımı
└─ pnpm-workspace.yaml  # (varsa) pnpm workspaces


Not: Proje daha önce /server ve /web dizinleriyle çalıştıysa, güncel yapı apps/ altındadır.

⚙️ Script’ler (önerilen)

apps/server/package.json

{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}


apps/web/package.json

{
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000"
  }
}

🔌 Ortam Değişkenleri

Sunucu (apps/server/.env)

PORT=4000        # varsayılan 4000


Web (apps/web/.env.local)

NEXT_PUBLIC_SOCKET_URL=http://localhost:4000   # veya tünel/prod URL’in

🚀 Hızlı Başlangıç (Windows / PowerShell)

Node.js 18+ ve npm/pnpm kurulu olmalı. (pnpm önerilir)

# 1) Repoyu klonla
git clone https://github.com/<kullanici>/<repo-adi>.git C:\Users\<SEN>\Desktop\Ciziko
cd C:\Users\<SEN>\Desktop\Ciziko

# 2) Bağımlılıkları kur (root'ta)
# pnpm yoksa: npm i -w
pnpm install

# 3) Env dosyalarını hazırla
# Sunucu portu:
# echo PORT=4000 > apps\server\.env

# Web socket adresi:
# echo NEXT_PUBLIC_SOCKET_URL=http://localhost:4000 > apps\web\.env.local

# 4) Sunucuyu başlat
cd apps\server
pnpm dev   # veya: npm run dev
# Sunucu: http://localhost:4000

# 5) Yeni bir terminal aç, web'i başlat
cd ..\web
pnpm dev   # veya: npm run dev
# Web: http://localhost:3000

🌐 Hızlı Uzaktan Deneme (Cloudflare Tunnel)

Geçici denemeler içindir, prod’a uygun değildir.

# Sunucu terminalinde:
cloudflared tunnel --url http://localhost:4000


Cloudflare’ın verdiği https://*.trycloudflare.com adresini apps/web/.env.local içinde NEXT_PUBLIC_SOCKET_URL olarak kullanın.

🎮 Nasıl Oynanır?

Web arayüzünde isim ve oda kodu gir → Odaya Katıl.

Takımını seç → Hazırım.

Geri sayım sonrası tur başlar:

Rakip takım 4 kelime arasından oy vererek seçer (10 sn).

Çizer gizli kelimeyi görür ve çizer (45 sn).

Çizerin takımı (çizer hariç) tahmin eder (15 sn).

Skorlar ve delta ekranda görünür. Üstte tur ilerlemesi.

Çizer için Araçlar

Kalem / Silgi

Renkler: siyah, kırmızı, yeşil, mavi, mor, sarı

Kalınlık: 3 / 6 / 10 / 16

Temizle (tuvali boşalt)

Geri Al (son çizgiyi sil)

🧠 Socket Olayları (Geliştiriciler)
<details> <summary><strong>Client → Server</strong></summary>

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

</details> <details> <summary><strong>Server → Client</strong></summary>

room_snapshot { code,status,players,teams,canStart,reason,scores,turnIndex,totalTurns }

start_countdown { t }

match_started

turn_setup_public { drawerId, team, turnIndex }

word_options { options, deadline } (rakip takıma)

secret_word { word, deadline } (sadece çizer)

draw_start { drawerId, team, options, deadline }

guess_phase { options, deadline } (çizer hariç)

turn_result { correctIndex, teamScores, delta?, correctGuessers?, wrongGuessers? }

game_over { scores }

Çizim relay: stroke_*, brush_change, canvas_clear, undo

</details>
🧩 Sorun Giderme

Bağlanamıyor: NEXT_PUBLIC_SOCKET_URL doğru mu? Sunucu portu açık mı? Güvenlik duvarı izin verdi mi?

CORS: Sunucuda cors({ origin: "*", methods:["GET","POST"] }) varsayılan. Değiştiyse istemci URL’sini ekleyin.

React “Invalid hook call”: Birden fazla React kopyası/versiyonu çakışıyor olabilir. node_modules temizleyip tek paket yöneticisiyle yükleyin.

Çizim gecikmesi: Tarayıcı sekmesi performansı, ağ durumu ve 30 Hz buffer etkiler. (Tüneller ekstra gecikme ekleyebilir.)

🛣️ Yol Haritası

Oda kalıcı alias, kalıcı tünel/host

Avatar & isim doğrulama

Mobil paketleme (Capacitor/EAS)

Anti-spam / anti-idle iyileştirmeleri

Çoklu dil desteği

📜 Lisans

Bu repo için şimdilik lisans belirtilmedi (tüm hakları saklıdır). Ticari/üretim kullanımı için lütfen bizimle iletişime geçin.

❤️ İmza

Tunix – TGame
“Çiz, tahmin et, kazan.”
