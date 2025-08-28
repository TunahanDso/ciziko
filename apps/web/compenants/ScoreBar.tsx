import React from "react";

export default function ScoreBar({ scores, delta }:{
  scores:{cacik:number;cucuk:number},
  delta?:{cacik:number;cucuk:number}
}) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
      <Box color="#2ecc71" title="🥒 Cacık" v={scores.cacik} d={delta?.cacik}/>
      <Box color="#e67e22" title="🐣 Cücük" v={scores.cucuk} d={delta?.cucuk}/>
    </div>
  );
}
function Box({ color, title, v, d }:{ color:string; title:string; v:number; d?:number }) {
  return (
    <div style={{ padding:"10px 12px", border:`2px solid ${color}`, borderRadius:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <b>{title}</b>
      <div style={{ fontWeight:700, fontSize:18 }}>
        {v ?? 0}{" "}
        {typeof d==="number" && d!==0 ? <small style={{ color: d>0?"#2ecc71":"#e74c3c" }}>({d>0?"+":""}{d})</small> : null}
      </div>
    </div>
  );
}
