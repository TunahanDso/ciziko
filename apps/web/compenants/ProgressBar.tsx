import React from "react";

export default function ProgressBar({ progress, label }:{ progress:number; label:string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:14, opacity:.8 }}>
        <span>İlerleme</span>
        <span>{label}</span>
      </div>
      <div style={{ height:10, background:"#eee", borderRadius:999 }}>
        <div style={{ height:"100%", width:`${Math.floor(progress*100)}%`, background:"#3498db", borderRadius:999 }} />
      </div>
    </div>
  );
}
