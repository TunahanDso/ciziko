import { useEffect, useRef, useState } from "react";

export function useWakeLock() {
  const [wakelock, setWakelock] = useState(false);
  const wakeLockRef = useRef<any>(null);

  async function requestWakeLock() {
    try {
      // @ts-ignore
      if (navigator?.wakeLock?.request) {
        // @ts-ignore
        const lock = await navigator.wakeLock.request("screen");
        wakeLockRef.current = lock;
        setWakelock(true);
        lock.addEventListener("release", () => setWakelock(false));
      }
    } catch {}
  }
  async function releaseWakeLock() {
    try { await wakeLockRef.current?.release?.(); } catch {}
    setWakelock(false);
  }

  // görünürlük değişince yeniden iste
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState === "visible" && wakelock) {
        await requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [wakelock]);

  return { wakelock, requestWakeLock, releaseWakeLock };
}
