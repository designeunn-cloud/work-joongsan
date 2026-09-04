"use client";

import { useEffect, useState, useCallback } from "react";
import type { SyncInfo } from "@/lib/clientTypes";

export default function SettingsPage() {
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [taskSyncing, setTaskSyncing] = useState(false);
  const [taskSyncResult, setTaskSyncResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/notion-sync");
    setSync(await res.json());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 마운트 시 동기화 상태 로드
    load();
  }, [load]);

  async function runSync() {
    setSyncing(true);
    try {
      await fetch("/api/notion-sync", { method: "POST" });
    } finally {
      setSyncing(false);
      load();
    }
  }

  async function runTaskSync() {
    setTaskSyncing(true);
    setTaskSyncResult(null);
    try {
      const res = await fetch("/api/tasks/sync-to-notion", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setTaskSyncResult(`생성 ${data.created}건 · 업데이트 ${data.updated}건 · 실패 ${data.failed}건`);
      } else {
        setTaskSyncResult(`실패: ${data.error}`);
      }
    } catch (err) {
      setTaskSyncResult(`실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTaskSyncing(false);
    }
  }

  const assigneeSync = sync?.states.find((s) => s.target === "assignee");
  const productSync = sync?.states.find((s) => s.target === "product");
  const platformSync = sync?.states.find((s) => s.target === "platform");

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-10 w-full">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">설정</h1>
          <p className="text-sm text-neutral-500 mt-1">Notion 담당자 동기화와 기본 항목을 관리합니다.</p>
        </header>

        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">Notion → 앱 동기화</h2>
          <div className="text-sm text-neutral-600 space-y-1 mb-4">
            <div>
              담당자 {sync ? `${sync.assigneeCount}명` : "-"}
              {assigneeSync && ` · 마지막 동기화 ${new Date(assigneeSync.lastSyncedAt).toLocaleString("ko-KR")}`}
            </div>
            <div>
              제품명 {sync ? `${sync.productCount}개` : "-"}
              {productSync && ` · 마지막 동기화 ${new Date(productSync.lastSyncedAt).toLocaleString("ko-KR")}`}
            </div>
            <div>
              플랫폼 {sync ? `${sync.platformCount}개` : "-"}
              {platformSync && ` · 마지막 동기화 ${new Date(platformSync.lastSyncedAt).toLocaleString("ko-KR")}`}
            </div>
          </div>
          <button
            onClick={runSync}
            disabled={syncing}
            className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50 text-sm"
          >
            {syncing ? "동기화 중..." : "지금 동기화"}
          </button>
        </section>

        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">앱 → Notion 업무 동기화</h2>
          <p className="text-sm text-neutral-400 mb-4">
            버튼을 누르면 현재 등록된 업무 전체를 노션 &ldquo;업무&rdquo; DB에 생성/업데이트합니다. 자동으로는
            동기화되지 않고, 누를 때마다 최신 상태로 반영됩니다.
          </p>
          <button
            onClick={runTaskSync}
            disabled={taskSyncing}
            className="px-3 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-50 text-sm"
          >
            {taskSyncing ? "동기화 중..." : "업무 노션 동기화"}
          </button>
          {taskSyncResult && <p className="text-sm text-neutral-600 mt-3">{taskSyncResult}</p>}
        </section>

        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-neutral-700 mb-2">카테고리 · 태그 · 상태 색상 관리</h2>
          <p className="text-sm text-neutral-400">
            카테고리/태그 직접 관리와 상태 색상 커스터마이징은 다음 라운드에서 제공될 예정입니다. 현재는 업무
            등록 시 자유롭게 카테고리·태그를 입력할 수 있습니다.
          </p>
        </section>
      </div>
    </div>
  );
}
