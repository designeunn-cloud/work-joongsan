"use client";

import { useState } from "react";

export default function GoogleSheetsJournalSettings({ configured, onConnected, busy = false }: {
  configured: boolean; onConnected: (spreadsheetUrl: string) => void; busy?: boolean;
}) {
  const [source, setSource] = useState("");
  const [webAppUrl, setWebAppUrl] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function prepare() {
    setWorking(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/journal/google-sheets/settings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "연결 코드를 준비하지 못했습니다.");
      setSource(data.source);
      try { await navigator.clipboard.writeText(data.source); setMessage("연결 코드를 복사했습니다. Apps Script에 붙여넣어 주세요."); }
      catch { setMessage("아래 연결 코드를 선택해서 복사해주세요."); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "연결 코드를 준비하지 못했습니다."); }
    finally { setWorking(false); }
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault(); setWorking(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/journal/google-sheets/settings", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect", webAppUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "구글에 연결하지 못했습니다.");
      setSource(""); setMessage("연결했습니다. 날짜를 선택하고 ‘일지 저장 후 시트 동기화’를 눌러주세요."); onConnected(data.spreadsheetUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "구글에 연결하지 못했습니다."); }
    finally { setWorking(false); }
  }

  return <details className="mb-4 rounded-lg border border-neutral-200 bg-white p-3">
    <summary className="cursor-pointer text-sm text-neutral-600 focus-visible:outline-2 focus-visible:outline-indigo-600">
      {configured ? "구글 시트 연결 설정" : "처음 한 번 구글 시트 연결하기"}
    </summary>
    <div className="mt-3 max-w-2xl space-y-3 text-sm leading-6 text-neutral-600">
      <p>회사 구글 계정의 쓰기 권한으로 앱에서 시트에 일지 12개 항목을 전송합니다.</p>
      {configured && <p className="rounded-lg bg-indigo-50 p-3 text-indigo-800">기존 연결을 업데이트할 때는 최신 연결 코드로 기존 Apps Script 코드를 교체해 저장하고, ‘배포 → 배포 관리 → 수정 → 새 버전 → 배포’를 선택하세요. 기존 웹 앱 URL과 연결 키를 그대로 사용하므로 다시 연결할 필요가 없습니다.</p>}
      <ol className="list-decimal space-y-2 pl-5">
        <li>아래에서 연결 코드를 복사하고, 업무일지 구글 시트의 <strong>확장 프로그램 → Apps Script</strong>에 붙여넣어 저장합니다.</li>
        <li>상단 함수 목록에서 <strong>configureJournalSync</strong>를 선택해 한 번 실행하고 구글의 권한 안내를 확인합니다.</li>
        <li><strong>배포 → 새 배포 → 웹 앱</strong>에서 실행 사용자는 <strong>나</strong>, 액세스 권한은 <strong>모든 사용자</strong>로 배포합니다. 등록 요청은 이 컴퓨터에 보관한 연결 키로 확인합니다.</li>
        <li>배포 완료 화면의 <strong>웹 앱 URL</strong>을 아래에 붙여넣어 연결합니다.</li>
      </ol>
      <button type="button" onClick={() => void prepare()} disabled={working || busy}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50">
        {working ? "처리 중…" : "연결 코드 복사"}
      </button>
      {source && <div>
        <label htmlFor="google-journal-source" className="mb-1 block text-xs text-neutral-500">연결 코드 · 비공개 연결 키가 포함되어 있습니다</label>
        <textarea id="google-journal-source" value={source} readOnly rows={6} onFocus={(event) => event.currentTarget.select()}
          className="w-full rounded-lg border border-neutral-300 p-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-indigo-600" />
      </div>}
      <form onSubmit={(event) => void connect(event)} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-xs text-neutral-500">웹 앱 URL
          <input type="url" value={webAppUrl} required placeholder="https://script.google.com/macros/s/…/exec"
            onChange={(event) => setWebAppUrl(event.target.value)} disabled={working || busy}
            className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-800 focus-visible:outline-2 focus-visible:outline-indigo-600" />
        </label>
        <button type="submit" disabled={working || busy} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:opacity-50">
          {working ? "연결 확인 중…" : "연결 확인 및 저장"}
        </button>
      </form>
      {message && <p role="status" className="text-sm text-indigo-700">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  </details>;
}
