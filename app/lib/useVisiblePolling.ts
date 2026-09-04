"use client";

import { useEffect } from "react";

/**
 * load()를 intervalMs마다 반복 호출한다. 탭이 백그라운드일 땐 건너뛰어 불필요한 서버 부하를
 * 줄이고, 다시 화면에 보이게 되는 순간 한 번 즉시 갱신한다.
 */
export function useVisiblePolling(load: () => void, intervalMs: number) {
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) load();
    }, intervalMs);
    function onVisibilityChange() {
      if (!document.hidden) load();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load, intervalMs]);
}
