"use client";

import { useRef, useState } from "react";

export default function TaskNameEditor({ taskId, value, disabled, onSaved }: {
  taskId: string; value: string; disabled?: boolean; onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState<{ original: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const current = saved?.original === value ? saved.value : value;

  async function commit() {
    if (saving.current) return;
    const name = draft.trim();
    if (!name) { setError("업무명을 입력해주세요."); return; }
    if (name === current) { setEditing(false); return; }
    saving.current = true; setBusy(true); setError(""); setWarning("");
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestContent: name }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.id !== taskId || typeof result.requestContent !== "string") throw new Error(result.error || "업무명을 저장하지 못했습니다.");
      setSaved({ original: value, value: result.requestContent }); setEditing(false);
      setWarning(typeof result.folderWarning === "string" ? result.folderWarning : "");
      window.dispatchEvent(new Event("task-name-updated"));
      onSaved?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "업무명을 저장하지 못했습니다."); }
    finally { saving.current = false; setBusy(false); }
  }

  return <div className="min-w-0" data-card-interactive>
    {editing ? <form onSubmit={event => { event.preventDefault(); void commit(); }} className="space-y-1">
      <input autoFocus aria-label="공통 업무명" maxLength={2000} disabled={busy} value={draft}
        onChange={event => { setDraft(event.target.value); setError(""); }}
        onKeyDown={event => { if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); setEditing(false); } }}
        className="min-h-9 w-full min-w-0 rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-900 focus-visible:outline-2 focus-visible:outline-indigo-600" />
      <div className="flex flex-wrap gap-1">
        <button type="submit" disabled={busy} className="min-h-8 rounded bg-indigo-600 px-2 text-xs text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button>
        <button type="button" disabled={busy} onClick={() => { setEditing(false); setError(""); }} className="min-h-8 rounded px-2 text-xs text-neutral-700 hover:bg-neutral-100">취소</button>
      </div>
    </form> : <button type="button" aria-label={`${current} 업무명 수정`} disabled={disabled} title="칸반·테이블·일지의 공통 업무명 수정"
      onClick={() => { setDraft(current); setError(""); setEditing(true); }}
      className="flex min-h-8 w-full items-start gap-1 rounded px-1 py-1 text-left text-xs font-semibold text-neutral-900 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50">
      <span className="min-w-0 flex-1 break-words">{current}</span>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0 text-neutral-600"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>
    </button>}
    {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    {warning && <p role="status" className="mt-1 text-xs text-amber-800">{warning}</p>}
  </div>;
}
