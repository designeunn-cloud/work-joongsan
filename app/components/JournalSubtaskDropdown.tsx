"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { JournalTableRow } from "@/lib/journalTable";
export default function JournalSubtaskDropdown({ row, rowLabel, disabled, onToggle }: {
  row: JournalTableRow; rowLabel: string; disabled: boolean;
  onToggle: (subtask: JournalTableRow["subtasks"][number], checked: boolean) => void;
}) {
  const [open,setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    function position() {
      const button = anchor.current, dropdown = panel.current;
      if (!button || !dropdown) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width,340),window.innerWidth-24);
      const below = window.innerHeight-rect.bottom-12, above=rect.top-12;
      const aboveButton = below < 200 && above > below;
      const available = Math.max(100,aboveButton ? above : below);
      dropdown.style.width = `${width}px`;
      dropdown.style.maxHeight = `${Math.min(360,available)}px`;
      dropdown.style.left = `${Math.max(12,Math.min(rect.left,window.innerWidth-width-12))}px`;
      dropdown.style.top = `${aboveButton ? Math.max(12,rect.top-dropdown.getBoundingClientRect().height-6) : rect.bottom+6}px`;
      dropdown.style.visibility="visible";
    }
    function outside(event: PointerEvent) {
      if (!panel.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) setOpen(false);
    }
    function focusOutside(event: FocusEvent) {
      if (!panel.current?.contains(event.target as Node) && !anchor.current?.contains(event.target as Node)) setOpen(false);
    }
    const frame = requestAnimationFrame(() => { position(); panel.current?.querySelector<HTMLInputElement>('input:not([disabled])')?.focus(); });
    window.addEventListener("resize",position); window.addEventListener("scroll",position,true);
    document.addEventListener("pointerdown",outside,true); document.addEventListener("focusin",focusOutside);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize",position); window.removeEventListener("scroll",position,true); document.removeEventListener("pointerdown",outside,true); document.removeEventListener("focusin",focusOutside); };
  },[open]);
  function close() { setOpen(false); anchor.current?.focus(); }
  return <>
    <button ref={anchor} type="button" disabled={disabled} aria-label={`${rowLabel} 그날 한 세부할일 선택`} aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==="ArrowDown"){event.preventDefault();setOpen(true);} if(event.key==="Escape" && open){event.preventDefault();close();}}} className="journal-subtask-trigger mb-2 flex min-h-9 w-full items-center justify-between gap-1 rounded-md border border-indigo-200 bg-indigo-50/50 px-2 py-2 text-left font-medium text-indigo-800 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600">
      <span>세부할일 <span className="tabular-nums">{row.selectedSubtaskIds.length}/{row.subtasks.length}</span></span><svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0"><path d={open?"m4 10 4-4 4 4":"m4 6 4 4 4-4"}/></svg>
    </button>
    {open && createPortal(<div id={id} ref={panel} role="group" aria-label={`${row.taskName || row.projectName} 세부할일 선택`} style={{visibility:"hidden"}} className="fixed z-[60] overflow-y-auto rounded-xl border border-neutral-300 bg-white p-2 shadow-lg" onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();}}}>
      <div className="mb-1 flex items-start justify-between gap-2 border-b border-neutral-200 px-2 pb-2 pt-1"><div className="min-w-0"><p className="text-sm font-semibold text-neutral-900">그날 한 세부할일</p><p className="mt-1 break-words text-xs text-neutral-600">{row.taskName || row.projectName}</p></div><button type="button" onClick={close} className="shrink-0 rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-700">닫기</button></div>
      {[...row.subtasks].sort((a,b) => Number(a.done) - Number(b.done)).map(subtask=><label key={subtask.id} className="flex min-h-9 cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-indigo-50"><input type="checkbox" aria-label={`${rowLabel} 세부할일: ${subtask.content}`} checked={row.selectedSubtaskIds.includes(subtask.id)} disabled={disabled} onChange={event=>onToggle(subtask,event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"/><span className="min-w-0 flex-1 break-words text-sm leading-5 text-neutral-800">{subtask.content}</span><span className={`shrink-0 whitespace-nowrap text-xs leading-5 ${subtask.done ? "text-emerald-700" : "text-neutral-600"}`}>{subtask.done?"완료":"미완료"}</span></label>)}
      <p className="border-t border-neutral-200 px-2 pt-2 text-xs leading-5 text-neutral-600">업무명 아래에 체크한 항목만 처리내용으로 표시됩니다. 선택을 바꾸면 처리내용이 선택 항목으로 교체됩니다. 원본 업무의 완료 상태는 바뀌지 않습니다.</p>
    </div>,document.body)}
  </>;
}
