"use client";
import { useEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { roundedHours } from "@/lib/workTime";

export default function WorkTimeInlineInput({ taskName, hours, disabled, active, ready, onSave, card = false }: {
  taskName: string; hours: number | null | undefined; disabled: boolean; active: boolean; ready: boolean;
  onSave: (hours: number) => Promise<boolean>; card?: boolean;
}) {
  const [editing, setEditing] = useState(false), [value, setValue] = useState(""), [error, setError] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const input = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const saving = useRef(false), cancelled = useRef(false);
  const id = useId();
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  async function commit(raw = value) {
    if (saving.current || cancelled.current) return;
    if (!raw.trim()) { setEditing(false); return; }
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0 || next > 24) { setError("0~24시간을 입력해주세요."); return; }
    if (next === hours) { setEditing(false); return; }
    saving.current = true; setError("");
    try { if (await onSave(next)) setEditing(false); else setError("저장하지 못했습니다. Enter로 다시 시도해주세요."); }
    catch { setError("저장하지 못했습니다. Enter로 다시 시도해주세요."); }
    finally { saving.current = false; }
  }
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; });
  useEffect(() => {
    if (!editing) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect) setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)), top: rect.bottom + 240 > window.innerHeight ? Math.max(8, rect.top - 240) : rect.bottom + 8 });
    };
    place();
    const frame = requestAnimationFrame(() => { input.current?.focus(); input.current?.select(); });
    const outside = (event: Event) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) void commitRef.current();
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("focusin", outside);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [editing]);
  function begin() { if (editing) { void commit(); return; } cancelled.current = false; setValue(hours == null ? "" : String(hours)); setError(""); setEditing(true); }
  return <div className={card ? "inline-flex" : "w-full min-w-0"} data-card-interactive>
    <button ref={trigger} type="button" disabled={disabled || active || !ready} aria-label={`${taskName} 소요시간 입력`} aria-haspopup="dialog" aria-expanded={editing} aria-controls={editing ? id : undefined} onClick={event => { setPortalTarget(event.currentTarget.closest('[role="dialog"][aria-modal="true"]') ?? document.body); begin(); }}
      title={active ? "측정을 종료한 뒤 시간을 수정해주세요" : "클릭해 빠른 선택 또는 시간(h) 입력"}
      className={`${card ? "py-1 text-xs underline decoration-dotted underline-offset-4" : "min-h-8 w-full rounded-md border border-neutral-200 bg-white px-1 py-1 text-center font-semibold hover:bg-neutral-50"} tabular-nums ${hours == null ? "text-red-700" : "text-neutral-700"} focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-60`}>
      {card ? "소요시간" : ""}{hours == null ? card ? "" : "미입력" : `${card ? " " : ""}${hours}h`}
    </button>
    {editing && createPortal(<div ref={popup} id={id} role="dialog" aria-label={`${taskName} 소요시간 빠른 입력`} data-card-interactive
      onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelled.current = true; setEditing(false); trigger.current?.focus(); } }}
      style={position} className="fixed z-[90] w-[280px] max-w-[calc(100vw-16px)] rounded-xl border border-neutral-300 bg-white p-3 shadow-lg">
      <label htmlFor={`${id}-hours`} className="mb-2 block text-xs font-semibold text-neutral-800">소요시간(h)</label>
      <input id={`${id}-hours`} ref={input} aria-label={`${taskName} 소요시간(h)`} aria-invalid={!!error} aria-describedby={`${id}-help`} type="number" inputMode="decimal" min="0" max="24" step="0.1" value={value} disabled={disabled}
        placeholder="시간 입력" onChange={event => { setValue(event.target.value); setError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void commit(); } }}
        className="h-9 w-full rounded-lg border border-neutral-300 px-3 text-sm tabular-nums text-neutral-900 placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-indigo-600" />
      <div className="mt-3 grid grid-cols-3 gap-1.5">{[5, 10, 30, 60, 300, 480].map(minutes => <button key={minutes} type="button" disabled={disabled} onClick={() => { const next = String(roundedHours(minutes * 60)); setValue(next); void commit(next); }} className="min-h-9 rounded-lg border border-neutral-200 px-2 text-xs text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-60">{minutes < 60 ? `${minutes}분` : `${minutes / 60}시간`}</button>)}</div>
      <p id={`${id}-help`} className="mt-3 text-[11px] leading-4 text-neutral-600">Enter 또는 바깥 클릭으로 저장 · Esc 취소<br />0.1시간 단위 올림 · 빈칸은 기존 값 유지</p>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>, portalTarget ?? document.body)}
  </div>;
}
