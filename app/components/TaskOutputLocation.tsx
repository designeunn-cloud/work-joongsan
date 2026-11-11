"use client";

import { useRef, useState } from "react";

export default function TaskOutputLocation({ taskId, taskName, value, onSaved, inlineRow = false, cell = false }: {
  taskId: string; taskName: string; value?: string | null; onSaved?: () => void; inlineRow?: boolean; cell?: boolean;
}) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [saved, setSaved] = useState<{ original: string | null | undefined; value: string } | null>(null);
  const saving = useRef(false);
  const current = saved && saved.original === value ? saved.value : value ?? "";

  async function save() {
    if (saving.current) return;
    const next = draft.trim();
    if (next === current) { setEditing(false); return; }
    saving.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outputLocation: next || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "폴더 위치를 저장하지 못했습니다.");
      if (result.id !== taskId || result.outputLocation !== (next || null)) throw new Error("저장 결과를 확인하지 못했습니다. 다시 저장해주세요.");
      setSaved({ original: value, value: result.outputLocation ?? "" }); setEditing(false); onSaved?.();
      window.dispatchEvent(new Event("journal-updated"));
      window.dispatchEvent(new Event("journal-sync-requested"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다. 다시 시도해주세요."); }
    finally { saving.current = false; setBusy(false); }
  }

  return <section aria-label={cell ? "결과물 폴더 위치/파일명" : "폴더 위치"} className={cell ? "min-w-0" : `mt-2 border-t border-neutral-200 pt-2${inlineRow ? " flex min-w-0 items-start gap-3" : ""}`} data-card-interactive>
    {!cell && <h3 className={inlineRow ? "flex min-h-8 w-16 shrink-0 items-center text-xs font-medium text-neutral-700" : "mb-1 text-xs font-medium text-neutral-700"}>폴더 위치</h3>}
    {editing ? <form className={inlineRow ? "min-w-0 flex-1" : undefined} onSubmit={event => { event.preventDefault(); void save(); }} onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) setEditing(false); }
      else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); void save(); }
    }}>
      <textarea autoFocus rows={3} aria-label={`${taskName} 폴더 위치`} maxLength={4000} disabled={busy} value={draft} placeholder={cell ? "폴더 위치, 파일명이나 공유 링크를 줄마다 입력" : "폴더 경로나 공유 링크를 줄마다 입력"}
        onChange={event => setDraft(event.target.value)} className="min-h-20 w-full resize-y rounded-lg border border-neutral-300 px-2 py-2 text-xs leading-5 text-neutral-800 placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-60" />
      <p className="mt-1 text-[10px] text-neutral-500">Enter 줄바꿈 · Ctrl+Enter 또는 저장 버튼으로 저장</p>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
      <div className="mt-1 flex justify-end gap-2 text-xs">
        <button type="button" disabled={busy} onClick={() => setEditing(false)} className="min-h-8 rounded-lg px-2 text-neutral-600 hover:bg-neutral-100 disabled:opacity-60">취소</button>
        <button type="submit" disabled={busy} className="min-h-8 rounded-lg border border-neutral-300 px-3 font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60">{busy ? "저장 중…" : "저장"}</button>
      </div>
    </form> : <button type="button" aria-label={`${taskName} 폴더 위치 ${current ? "수정" : "입력"}`} title={current || "폴더 위치 입력"} onClick={() => { setDraft(current); setError(""); setEditing(true); }}
      className={`min-h-8 w-full whitespace-pre-wrap break-words rounded-md py-1 text-left text-xs leading-5 underline decoration-dotted underline-offset-4 [overflow-wrap:anywhere] hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-600 ${inlineRow ? "min-w-0 flex-1 " : ""}${current ? "text-neutral-600" : "text-red-700"}`}>
      {current || (inlineRow || cell ? "입력" : "폴더 위치")}
    </button>}
  </section>;
}
