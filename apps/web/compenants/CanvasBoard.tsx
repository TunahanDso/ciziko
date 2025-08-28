import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Socket } from "socket.io-client";

export type CanvasBoardHandle = {
  remoteStrokeBegin: (p:any)=>void;
  remoteStrokePoint: (p:any)=>void;
  remoteStrokeEnd: (p:any)=>void;
  remoteBrushChange: (p:any)=>void;
  remoteClear: ()=>void;
  remoteUndo: ()=>void;
};

export default forwardRef<CanvasBoardHandle, { enabled:boolean; socket:Socket|null }>(
  ({ enabled, socket }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const drawingRef = useRef(false);
    const brushRef = useRef({ color: "#111", w: 4, tool: "pen" as "pen"|"eraser" });

    const outBufferRef = useRef<{x:number;y:number;t:number}[]>([]);
    const flushTimerRef = useRef<number | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current!;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctxRef.current = ctx;

      const onResize = () => {
        const rect2 = canvas.getBoundingClientRect();
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        canvas.width = Math.floor(rect2.width * dpr);
        canvas.height = Math.floor(rect2.height * dpr);
        ctx.scale(dpr, dpr);
        ctx.putImageData(img, 0, 0);
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => {
      const flush = () => {
        if (!socket) return;
        if (outBufferRef.current.length === 0) return;
        socket.emit("stroke_point", { points: outBufferRef.current.splice(0) });
      };
      flushTimerRef.current = window.setInterval(flush, 33) as unknown as number;
      return () => { if (flushTimerRef.current) window.clearInterval(flushTimerRef.current); };
    }, [socket]);

    function beginLocal(x:number, y:number) {
      const ctx = ctxRef.current!; ctx.beginPath(); ctx.moveTo(x, y);
      drawingRef.current = true;
      socket?.emit("stroke_begin", { x, y, w: brushRef.current.w, tool: brushRef.current.tool, color: brushRef.current.color });
    }
    function moveLocal(x:number, y:number) {
      if (!drawingRef.current) return;
      const ctx = ctxRef.current!; const b = brushRef.current;
      ctx.strokeStyle = b.tool === "eraser" ? "#fff" : b.color;
      ctx.lineWidth = b.w;
      ctx.lineTo(x, y); ctx.stroke();
      outBufferRef.current.push({ x, y, t: Date.now() });
    }
    function endLocal() { drawingRef.current = false; socket?.emit("stroke_end", {}); }

    function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!enabled) return;
      const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
      beginLocal(e.clientX - r.left, e.clientY - r.top);
    }
    function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!enabled || !drawingRef.current) return;
      const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
      moveLocal(e.clientX - r.left, e.clientY - r.top);
    }
    function onPointerUp() { if (!enabled) return; endLocal(); }

    // remote
    function remoteStrokeBegin(p:any) {
      const ctx = ctxRef.current!; ctx.beginPath(); ctx.moveTo(p.x, p.y);
      const b = brushRef.current; if (p.w != null) b.w = p.w; if (p.tool) b.tool = p.tool; if (p.color) b.color = p.color;
    }
    function remoteStrokePoint(p:any) {
      const ctx = ctxRef.current!; const b = brushRef.current;
      ctx.strokeStyle = b.tool === "eraser" ? "#fff" : b.color;
      ctx.lineWidth = b.w;
      for (const pt of p.points || []) { ctx.lineTo(pt.x, pt.y); ctx.stroke(); }
    }
    function remoteStrokeEnd() {}
    function remoteBrushChange(p:any) { const b = brushRef.current; if (p.color) b.color = p.color; if (p.w != null) b.w = p.w; if (p.tool) b.tool = p.tool; }
    function remoteClear() { const ctx = ctxRef.current!; const c = canvasRef.current!; ctx.clearRect(0,0,c.width,c.height); }
    function remoteUndo() {}

    useImperativeHandle(ref, () => ({ remoteStrokeBegin, remoteStrokePoint, remoteStrokeEnd, remoteBrushChange, remoteClear, remoteUndo }), []);

    return (
      <div style={{ border:"1px solid #ccc", borderRadius:8, overflow:"hidden", height: 360, marginTop: 8 }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", touchAction: "none", background:"#fff" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
    );
  }
);
