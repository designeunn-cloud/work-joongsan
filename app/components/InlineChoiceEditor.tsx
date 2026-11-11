"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Choice = { value: string; label: string };

/** 담당자 편집기와 같은 텍스트 트리거·검색창을 사용하는 목록 전용 편집기. */
export default function InlineChoiceEditor({ label, value, displayValue, emptyLabel, options, disabled = false, onSave }: {
  label: string; value: string; displayValue?: string; emptyLabel: string;
  options: Choice[]; disabled?: boolean; onSave: (value: string) => Promise<void>;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [saved, setSaved] = useState<{ original: string; value: string } | null>(null);
  const current = saved?.original === value ? saved.value : value;
  const currentLabel = options.find(option => option.value === current)?.label ?? displayValue ?? emptyLabel;
  const filtered = options.filter(option => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  const visibleIndex = Math.min(activeIndex, filtered.length - 1);
  const positioned = position !== null;

  function close(restoreFocus = false) {
    if (saving.current) return;
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  }

  async function select(next: string) {
    if (saving.current || disabled || !options.some(option => option.value === next)) return;
    if (next === current) { close(true); return; }
    saving.current = true; setBusy(true); setError("");
    try {
      await onSave(next);
      setSaved({ original: value, value: next }); setOpen(false);
      requestAnimationFrame(() => trigger.current?.focus());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "저장하지 못했습니다. 다시 선택해주세요.");
    } finally { saving.current = false; setBusy(false); }
  }

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect(), box = panel.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      setPosition({ left: Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8)), top: Math.max(8, Math.min(anchor.bottom + 8, innerHeight - box.height - 8)) });
    };
    const frame = requestAnimationFrame(place);
    const outside = (event: Event) => {
      if (!saving.current && !panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside); window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, filtered.length, error]);

  useEffect(() => {
    if (!open || !positioned || busy) return;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, positioned, busy]);

  useEffect(() => {
    if (open) panel.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, visibleIndex, query]);

  return <span className="inline-flex min-w-0 max-w-full" data-card-interactive>
    <button ref={trigger} type="button" disabled={disabled || busy} aria-label={`${label} 선택`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={event => { if (open) { close(); return; } setPortalTarget(event.currentTarget.closest('[role="dialog"][aria-modal="true"]') ?? document.body); setQuery(""); setActiveIndex(Math.max(0, options.findIndex(option => option.value === current))); setError(""); setPosition(null); setOpen(true); }}
      className={`min-h-8 max-w-full break-words rounded-md py-1 text-left text-xs underline decoration-dotted underline-offset-4 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-60 ${current ? "text-neutral-600" : "text-red-700"}`}>
      {current ? currentLabel : emptyLabel}
    </button>
    {open && portalTarget && createPortal(<div ref={panel} id={id} role="dialog" aria-label={`${label} 검색 및 선택`} data-card-interactive
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? "visible" : "hidden" }}
      onClick={event => event.stopPropagation()} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
        else if (event.key === "Tab" && !saving.current) { setOpen(false); trigger.current?.focus(); }
      }}
      className="fixed z-[95] w-72 max-w-[calc(100vw-16px)] rounded-xl border border-neutral-300 bg-white p-3 shadow-lg">
      <h3 className="mb-2 text-xs font-semibold text-neutral-800">{label} 검색</h3>
      <input ref={input} role="combobox" aria-label={`${label} 검색`} aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={visibleIndex >= 0 ? `${id}-option-${visibleIndex}` : undefined}
        value={query} disabled={busy} placeholder={`${label} 검색`} onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Enter") { event.preventDefault(); if (visibleIndex >= 0) void select(filtered[visibleIndex].value); }
          else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && filtered.length) {
            event.preventDefault(); setActiveIndex(event.key === "ArrowDown" ? (visibleIndex + 1) % filtered.length : (visibleIndex - 1 + filtered.length) % filtered.length);
          } else if ((event.key === "Home" || event.key === "End") && filtered.length) {
            event.preventDefault(); setActiveIndex(event.key === "Home" ? 0 : filtered.length - 1);
          }
        }} autoComplete="off" className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" />
      <div className="mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-md">
        <p className="border-b border-neutral-100 px-3 py-1.5 text-[10px] text-neutral-400">↑↓ 이동 · Enter 선택 · Esc 닫기</p>
        <div id={`${id}-list`} role="listbox" aria-label={`${label} 검색 결과`} className="max-h-48 overflow-y-auto py-1">
          {filtered.map((option, index) => <button key={option.value} id={`${id}-option-${index}`} type="button" role="option" aria-selected={option.value === current} data-active={index === visibleIndex} tabIndex={-1} disabled={busy}
            onMouseDown={event => event.preventDefault()} onMouseMove={() => setActiveIndex(index)} onClick={() => void select(option.value)}
            className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-60 ${index === visibleIndex ? "bg-blue-50 text-blue-700" : "hover:bg-neutral-50"}`}>
            <span className="truncate">{option.label}</span>{option.value === current ? <span className="shrink-0 text-[10px]">✓ 선택됨</span> : index === visibleIndex && <span className="shrink-0 text-[10px]">Enter로 선택</span>}
          </button>)}
          {!filtered.length && <p role="status" className="px-3 py-2 text-xs text-neutral-500">검색 결과가 없습니다. 목록에 있는 항목을 선택해주세요.</p>}
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-neutral-600">↑↓ 이동 · Enter 적용 · 바깥 클릭 취소</p>
      {busy && <p role="status" className="mt-2 text-xs text-neutral-600">저장 중…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>, portalTarget)}
  </span>;
}
