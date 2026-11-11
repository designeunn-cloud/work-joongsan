"use client";
import { useEffect, useState } from "react";

type Status = { configured: boolean; pending: number; running?: boolean; error?: string; lastSyncedAt?: string; lastDate?: string; lastHash?: string; url?: string };

export default function JournalAutoSyncStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    let latestStamp = "";
    const refresh = async () => {
      if (fetching || controller.signal.aborted) return;
      fetching = true;
      try {
        const response = await fetch("/api/journal/auto-sync", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const data: Status = await response.json();
        if (controller.signal.aborted) return;
        setStatus(data); setOffline(false);
        if (data.lastSyncedAt && data.lastDate && data.lastHash && data.url && data.lastSyncedAt !== latestStamp) {
          latestStamp = data.lastSyncedAt;
          try {
            const stamps = JSON.parse(localStorage.getItem("journal-sync-stamps-v1") || "{}");
            stamps[data.lastDate] = { at: data.lastSyncedAt, hash: `${data.url}|${data.lastHash}` };
            localStorage.setItem("journal-sync-stamps-v1", JSON.stringify(stamps));
            window.dispatchEvent(new CustomEvent("journal-auto-synced", { detail: stamps }));
          } catch { /* 전송 성공 여부는 저장소 사용 가능 여부와 무관하다. */ }
        }
      } catch { if (!controller.signal.aborted) setOffline(true); }
      finally { fetching = false; }
    };
    void refresh();
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 4000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, []);
  if (!status && !offline) return null;
  const failed = offline || !!status?.error;
  const text = offline ? "시트 연결 상태를 확인할 수 없습니다. 앱에 저장한 내용은 유지됩니다."
    : status?.error ? `시트 전송 대기 · ${status.error}`
    : !status?.configured ? "자동 동기화를 사용하려면 구글 시트를 연결해주세요."
    : status.running ? "시트 자동 동기화 중…"
    : status.pending ? "변경 내용을 시트로 전송할 예정입니다."
    : status.lastSyncedAt ? `시트 자동 동기화 완료 · ${new Date(status.lastSyncedAt).toLocaleTimeString("ko-KR")}`
    : "시트 자동 동기화 · 저장한 변경 내용을 자동 반영합니다.";
  return <div className={`flex flex-wrap items-center justify-end gap-2 border-b px-3 py-2 text-xs ${failed ? "border-amber-200 bg-amber-50 text-amber-900" : "border-neutral-200 bg-white text-neutral-600"}`}>
    <span role={failed ? "alert" : "status"}>{text}</span>
    {failed && <button type="button" className="min-h-8 rounded border border-amber-400 px-2 font-medium hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-amber-800" onClick={async () => {
      try { await fetch("/api/journal/auto-sync", { method: "POST" }); setOffline(false); }
      catch { setOffline(true); }
    }}>지금 다시 시도</button>}
  </div>;
}
