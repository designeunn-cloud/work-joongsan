"use client";

import { useRef, useState } from "react";

export default function TaskMemo({ taskId, memo, onSaved, compact = false, inlineRow = false, cell = false, field = "memo", label = "비고" }: { taskId: string; memo: string | null; onSaved?: () => void; compact?: boolean; inlineRow?: boolean; cell?: boolean; field?: "memo" | "referenceMemo"; label?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState<{ original: string | null; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const current = saved && saved.original === memo ? saved.value : memo ?? "";
  async function save(value: string) {
    if (savingRef.current) return;
    const nextMemo = value.trim();
    if (nextMemo === current) { setEditing(false); return; }
    savingRef.current = true;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: nextMemo }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `${label}를 저장하지 못했습니다.`);
      setSaved({ original: memo, value: result[field] ?? "" }); setEditing(false); window.dispatchEvent(new Event("journal-updated")); onSaved?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : `${label}를 저장하지 못했습니다.`); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return <div className={cell ? "min-w-0" : "mb-2"}>
    {editing ? <div className="rounded-lg bg-amber-50/70 px-2 py-1.5 text-xs text-neutral-700">
      <label className="mb-0.5 block text-[10px] text-neutral-500" htmlFor={`${field}-${taskId}`}>{label} · Enter 줄바꿈 · Ctrl+Enter 저장 · 다른 곳을 누르면 자동 저장</label>
      <textarea id={`${field}-${taskId}`} aria-label={`업무 ${label}`} autoFocus rows={3} readOnly={saving} value={draft} onChange={(event) => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); void save(event.currentTarget.value); }
        }}
        onBlur={(event) => { void save(event.currentTarget.value); }}
        placeholder={`업무 ${label}를 남겨주세요`} className="block w-full resize-y border-0 bg-transparent p-0 text-xs leading-relaxed text-neutral-700 outline-none focus:ring-0" />
      {saving && <p role="status" className="mt-1 text-[10px] text-neutral-400">저장 중…</p>}
      {error && <div className="mt-1 text-xs text-red-600"><p role="alert">{error}</p>
        <button type="button" onClick={() => { void save(draft); }} className="mt-1 underline">다시 저장</button>
      </div>}
    </div> : <button type="button" aria-label={`${label} ${current ? "수정" : "남기기"}`} onClick={() => { setDraft(current); setError(""); setEditing(true); }}
      title={current || `${label} 남기기`} className={`w-full rounded-lg ${cell ? "min-h-8 py-1 underline decoration-dotted underline-offset-4" : inlineRow ? "py-0" : compact ? "py-1" : "px-2 py-1.5"} text-left text-xs ${current ? compact || inlineRow || cell ? "text-neutral-600 hover:bg-neutral-100" : "bg-amber-50/70 text-neutral-700 hover:bg-amber-100/70" : "text-red-700 hover:bg-red-50"}`}>
      {cell ? <span className="block whitespace-pre-wrap break-words leading-5 [overflow-wrap:anywhere]">{current || "입력"}</span> : inlineRow ? <span className="flex min-h-8 min-w-0 items-start gap-3"><span className="flex min-h-8 w-16 shrink-0 items-center font-medium text-neutral-700">{label}</span><span className={`min-w-0 flex-1 whitespace-pre-wrap break-words py-1 leading-5 [overflow-wrap:anywhere] ${current ? "text-neutral-700" : "text-red-700"}`}>{current || "미입력"}</span></span>
        : compact ? <><span className="flex min-h-8 items-center text-xs font-medium text-neutral-700">{label}</span><span className={`block whitespace-pre-wrap break-words text-xs leading-5 [overflow-wrap:anywhere] ${current ? "text-neutral-700" : "text-red-700"}`}>{current || "미입력"}</span></> : current ? <><span className="mb-0.5 block text-[10px] text-neutral-500">{label} · 클릭하여 수정</span><span className="line-clamp-3 whitespace-pre-wrap break-words">{current}</span></> : `+ ${label} 남기기`}
    </button>}
  </div>;
}
