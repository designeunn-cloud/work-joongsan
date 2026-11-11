"use client";
import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { splitProducts } from "@/lib/productPolicy";
import MultiCombobox, { type MultiComboboxHandle } from "./MultiCombobox";

export default function TaskProductEditor({ taskId, taskName, value, options, onSaved, onChange }: {
  taskId: string; taskName: string; value: string | null;
  options: string[]; onSaved?: () => void; onChange?: (value: string) => void;
}) {
  const label = "품명";
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(value ?? ""), [error, setError] = useState("");
  const [folderWarning, setFolderWarning] = useState("");
  const [saved, setSaved] = useState<{ original: string | null; value: string } | null>(null);
  const [busy, setBusy] = useState(false), [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const productsInput = useRef<MultiComboboxHandle>(null);
  const saving = useRef(false), draftRef = useRef(value ?? "");
  const id = useId();
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const current = saved?.original === value ? saved.value : value ?? "";
  const products = splitProducts(current);
  const productSummary = products.length > 1 ? `${products.length}종` : products[0] || label;
  const positioned = position !== null;
  async function commit(raw: string) {
    if (saving.current) return;
    const next = splitProducts(raw).join(", ");
    if (next === current) { setOpen(false); return; }
    if (onChange) { onChange(next); setOpen(false); return; }
    saving.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productName: next }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `${label}을 저장하지 못했습니다.`);
      if (result.id !== taskId) throw new Error("저장 결과를 확인하지 못했습니다. 다시 시도해주세요.");
      setFolderWarning(typeof result.folderWarning === "string" ? result.folderWarning : "");
      setSaved({ original: value, value: result.productName ?? "" }); setOpen(false);
      window.dispatchEvent(new Event("journal-updated")); onSaved?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장하지 못했습니다. 다시 시도해주세요."); }
    finally { saving.current = false; setBusy(false); }
  }
  function saveDraft() {
    const pending = productsInput.current?.flushPending();
    const next = pending ? [draftRef.current, pending].filter(Boolean).join(", ") : draftRef.current;
    return commit(next);
  }
  const commitRef = useRef(saveDraft);
  useEffect(() => { commitRef.current = saveDraft; });
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect(), box = panel.current?.getBoundingClientRect();
      if (anchor && box) setPosition({ left: Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8)), top: Math.max(8, Math.min(anchor.bottom + 8, innerHeight - box.height - 8)) });
    };
    const frame = requestAnimationFrame(place);
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) void commitRef.current(); };
    document.addEventListener("pointerdown", outside); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  useEffect(() => {
    if (!open || !positioned) return;
    const frame = requestAnimationFrame(() => { const input = panel.current?.querySelector<HTMLInputElement>("input"); input?.focus(); input?.select(); });
    return () => cancelAnimationFrame(frame);
  }, [open, positioned]);
  return <span className="inline-flex min-w-0 max-w-full flex-wrap items-center" data-card-interactive>
    <button ref={trigger} type="button" disabled={busy} title={products.length ? products.join(", ") : undefined} aria-label={`${taskName} ${label} 변경${products.length ? ` · ${products.join(", ")}` : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={event => { setPortalTarget(event.currentTarget.closest('[role="dialog"][aria-modal="true"]') ?? document.body); if (open) { void saveDraft(); return; } draftRef.current = current; setDraft(current); setError(""); setPosition(null); setOpen(true); }}
      className={`min-h-8 max-w-full break-words rounded-md py-1 text-left text-xs underline decoration-dotted underline-offset-4 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-600 ${current ? "text-neutral-600" : "text-red-700"}`}>
      {productSummary}
    </button>
    {folderWarning && <span role="status" title={folderWarning} className="ml-1 text-[10px] text-amber-800">폴더명 정리 보류<span className="sr-only"> · {folderWarning}</span></span>}
    {open && createPortal(<div ref={panel} id={id} role="dialog" aria-label={`${label} 검색 및 선택`} data-card-interactive
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? "visible" : "hidden" }}
      onKeyDownCapture={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!busy) { setOpen(false); trigger.current?.focus(); } }
        else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); void saveDraft(); }
      }}
      onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}
      className="fixed z-[95] max-h-[calc(100vh-16px)] w-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-neutral-300 bg-white p-3 shadow-lg">
      <h3 className="mb-2 text-xs font-semibold text-neutral-800">{label} 검색</h3>
      <>
        <MultiCombobox ref={productsInput} values={splitProducts(draft)} options={options} autoFocus disabled={busy} keepOpenOnSelect inlineOptions inputLabel="품명 검색" placeholder="품명 검색 또는 입력" onChange={next => { const value = splitProducts(next.join(", ")).join(", "); draftRef.current = value; setDraft(value); setError(""); }}/>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => { setOpen(false); trigger.current?.focus(); }} className="min-h-9 rounded-lg px-3 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-60">취소</button>
          <button type="button" disabled={busy} onMouseDown={event => event.preventDefault()} onClick={() => void saveDraft()} className="min-h-9 rounded-lg bg-indigo-600 px-3 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? "저장 중…" : onChange ? "선택 적용" : "선택 저장"}</button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-neutral-600">여러 품명을 선택하고 저장해주세요.<br />Enter 선택 · 바깥 클릭 적용 · Esc 취소</p>
      </>
      {busy && <p role="status" className="mt-2 text-xs text-neutral-600">저장 중…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>, portalTarget ?? document.body)}
  </span>;
}
