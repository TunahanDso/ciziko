import React from "react";

export default function ShareRoom({ roomCode }:{ roomCode:string }) {
  const url = buildRoomUrl(roomCode);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      alert("Oda linki kopyalandı!");
    } catch {
      prompt("Kopyalayın:", url);
    }
  }

  async function nativeShare() {
    try {
      // @ts-ignore
      if (navigator.share) {
        // @ts-ignore
        await navigator.share({ title: "Çiziko", text: `Çiziko odası: ${roomCode}`, url });
      } else {
        copyLink();
      }
    } catch {}
  }

  return (
    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
      <code style={{ padding:"6px 8px", background:"#f3f3f3", borderRadius:6 }}>{roomCode}</code>
      <button onClick={copyLink} style={btn()}>Linki Kopyala</button>
      <button onClick={nativeShare} style={btn()}>Paylaş</button>
    </div>
  );
}

function buildRoomUrl(roomCode:string) {
  const origin = typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
  // odası önceden dolu bir giriş ekranı:
  return `${origin}/?room=${encodeURIComponent(roomCode)}`;
}

function btn() {
  return { padding:"8px 12px", border:"1px solid #ccc", borderRadius:8 } as const;
}
