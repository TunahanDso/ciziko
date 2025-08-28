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
