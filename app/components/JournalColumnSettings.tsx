"use client";
import { useState } from "react";
import { JOURNAL_COLUMNS, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH, columnWidth, defaultJournalLayout, moveJournalColumn, type JournalColumn } from "@/lib/journalColumns";
const button = "rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-40";
export default function JournalColumnSettings({ layout, onChange }: { layout: JournalColumn[]; onChange: (layout: JournalColumn[]) => void }) {
  const [dragged, setDragged] = useState<string | null>(null);
  const shown = layout.filter(column => column.visible).length;
  return <div id="journal-column-settings" className="mb-4 rounded-xl border border-neutral-300 bg-white p-3 sm:p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-neutral-800">표 설정 · {shown}개 열 표시</h4><button type="button" className={button} onClick={() => onChange(defaultJournalLayout())}>기본값 복원</button></div>
    <p className="mb-3 text-xs leading-5 text-neutral-600">체크로 표시 여부를 바꾸고, 이동 손잡이를 끌거나 위·아래 버튼으로 순서를 바꾸세요. 너비 값이 클수록 해당 열이 넓어집니다. 전체 폭은 화면에 맞춰 유지됩니다. 표 제목 오른쪽 경계를 끌어 조절할 수도 있습니다. 이 브라우저에 자동 저장됩니다.</p>
    <ol className="grid gap-1" aria-label="업무일지 열 배치">
      {layout.map((column, index) => {
        const label = JOURNAL_COLUMNS.find(item => item.id === column.id)!.label;
        return <li key={column.id} onDragOver={event => { if (dragged) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragged) onChange(moveJournalColumn(layout, dragged, column.id)); setDragged(null); }} className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 ${dragged === column.id ? "bg-indigo-50" : "bg-neutral-50"}`}>
          <button type="button" draggable aria-label={`${label} 이동 손잡이`} title="끌어서 열 순서 변경" className={`${button} cursor-grab touch-auto`} onDragStart={event => { setDragged(column.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column.id); }} onDragEnd={() => setDragged(null)}><svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">{[4,9,14].map(y => <g key={y}><circle cx="4" cy={y} r="1"/><circle cx="10" cy={y} r="1"/></g>)}</svg></button>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-neutral-800"><input type="checkbox" checked={column.visible} disabled={column.visible && shown === 1} aria-label={`${label} 열 표시`} onChange={event => onChange(layout.map(item => item.id === column.id ? { ...item, visible: event.target.checked } : item))} className="h-4 w-4 accent-indigo-600"/><span>{label}</span></label>
          <div className="flex items-center gap-1"><label className="flex items-center gap-1 text-xs text-neutral-600"><input aria-label={`${label} 열 너비`} type="number" min={MIN_COLUMN_WIDTH} max={MAX_COLUMN_WIDTH} value={column.width} onChange={event => { if (event.target.value && Number.isFinite(event.target.valueAsNumber)) onChange(layout.map(item => item.id === column.id ? { ...item, width: columnWidth(event.target.valueAsNumber) } : item)); }} className="w-16 rounded border border-neutral-300 bg-white px-1 py-1.5 text-right tabular-nums"/>너비</label>
          <button type="button" aria-label={`${label} 열 위로`} className={button} disabled={index === 0} onClick={() => onChange(moveJournalColumn(layout, column.id, layout[index - 1].id))}>위</button><button type="button" aria-label={`${label} 열 아래로`} className={button} disabled={index === layout.length - 1} onClick={() => onChange(moveJournalColumn(layout, column.id, layout[index + 1].id))}>아래</button></div>
        </li>;
      })}
    </ol>
    <p className="mt-3 text-xs text-neutral-600">최소 한 열은 표시해야 합니다. 숨긴 열의 입력값은 유지됩니다.</p>
  </div>;
}
