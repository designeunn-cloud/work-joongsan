"use client";
import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import Combobox from "./Combobox";
import TaskProductEditor from "./TaskProductEditor";

type IdentityEditorProps = {
  taskId: string; taskName: string; field: "assignee" | "productName" | "brand" | "platform"; value: string | null;
  displayValue?: string; options: string[]; onSaved?: () => void; onChange?: (value: string) => void;
};
export default function TaskIdentityEditor(props: IdentityEditorProps) {
  return props.field === "productName" ? <TaskProductEditor {...props}/> : <SingleIdentityEditor {...props}/>;
}
function SingleIdentityEditor({ taskId, taskName, field, value, displayValue, options, onSaved, onChange }: IdentityEditorProps) {
  const label = { assignee: "담당자", productName: "품명", brand: "브랜드", platform: "플랫폼" }[field];
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(value ?? ""), [error, setError] = useState("");
  const [folderWarning, setFolderWarning] = useState("");
  const [saved, setSaved] = useState<{ original: string | null; value: string } | null>(null);
  const [busy, setBusy] = useState(false), [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const saving = useRef(false), draftRef = useRef(value ?? "");
  const id = useId();
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const current = saved?.original === value ? saved.value : value ?? "";
  const positioned = position !== null;
  async function commit(raw: string) {
    if (saving.current) return;
    const next = raw.trim();
    if (field === "assignee" && !next) { setError("담당자를 선택하거나 입력해주세요."); return; }
    if (next === current) { setOpen(false); return; }
    if (onChange) { onChange(next); setOpen(false); return; }
    saving.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: next }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `${label}을 저장하지 못했습니다.`);
      if (result.id !== taskId) throw new Error("저장 결과를 확인하지 못했습니다. 다시 시도해주세요.");
      setFolderWarning(typeof result.folderWarning === "string" ? result.folderWarning : "");
      setSaved({ original: value, value: result[field] ?? "" }); setOpen(false);
      window.dispatchEvent(new Event("journal-updated")); onSaved?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다. 다시 시도해주세요."); }
    finally { saving.current = false; setBusy(false); }
  }
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; });
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (anchor) setPosition({ left: Math.max(8, Math.min(anchor.left, innerWidth - 296)), top: Math.max(8, Math.min(anchor.bottom + 8, innerHeight - 310)) });
    };
    const frame = requestAnimationFrame(place);
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) void commitRef.current(draftRef.current); };
    document.addEventListener("pointerdown", outside); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  useEffect(() => {
    if (!open || !positioned) return;
    const frame = requestAnimationFrame(() => { const input = panel.current?.querySelector<HTMLInputElement>("input"); input?.focus(); input?.select(); });
    return () => cancelAnimationFrame(frame);
  }, [open, positioned]);
  return <span className="inline-flex min-w-0 max-w-full flex-wrap items-center" data-card-interactive>
    <button ref={trigger} type="button" aria-label={`${taskName} ${label} 변경`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={event => { setPortalTarget(event.currentTarget.closest('[role="dialog"][aria-modal="true"]') ?? document.body); if (open) { void commit(draftRef.current); return; } draftRef.current = current; setDraft(current); setError(""); setPosition(null); setOpen(true); }}
      className={`min-h-8 max-w-full break-words rounded-md py-1 text-left text-xs underline decoration-dotted underline-offset-4 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-600 ${current ? "text-neutral-600" : "text-red-700"}`}>
      {current ? current === value ? displayValue || current : current : label}
    </button>
    {folderWarning && <span role="status" title={folderWarning} className="ml-1 text-[10px] text-amber-800">폴더명 정리 보류<span className="sr-only"> · {folderWarning}</span></span>}
    {open && createPortal(<div ref={panel} id={id} role="dialog" aria-label={`${label} 검색 및 선택`} data-card-interactive
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? "visible" : "hidden" }}
      onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}
      className="fixed z-[95] w-72 max-w-[calc(100vw-16px)] rounded-xl border border-neutral-300 bg-white p-3 shadow-lg">
      <h3 className="mb-2 text-xs font-semibold text-neutral-800">{label} 검색</h3>
      <Combobox value={draft} options={options} autoFocus disabled={busy} inputLabel={`${label} 검색`} placeholder={`${label} 검색 또는 입력`} onChange={next => { draftRef.current = next; setDraft(next); setError(""); }} onCommit={next => { draftRef.current = next; setDraft(next); void commit(next); }}/>
      <p className="mt-2 text-[11px] leading-4 text-neutral-600">↑↓ 이동 · Enter 적용 · 바깥 클릭 적용{field === "productName" && <><br />여러 품명은 쉼표로 구분해 입력할 수 있습니다.</>}</p>
      {busy && <p role="status" className="mt-2 text-xs text-neutral-600">저장 중…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>, portalTarget ?? document.body)}
  </span>;
}
