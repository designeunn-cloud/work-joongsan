"use client";

import { useState } from "react";
import { isProductionType, PRODUCTION_TYPES, type ProductionType } from "@/lib/productionTypes";
import InlineChoiceEditor from "./InlineChoiceEditor";

/** 목록에서 작업구분을 직접 선택하면 해당 필드만 저장한다. */
export default function ProductionTypeEditor({ taskId, value, onSaved, compact = false, disabled = false, onSavingChange, inline = false }: {
  taskId: string; value?: ProductionType | null;
  onSaved?: (value: ProductionType | null) => void; compact?: boolean;
  disabled?: boolean; onSavingChange?: (saving: boolean) => void;
  inline?: boolean;
}) {
  const [selection, setSelection] = useState<ProductionType | "">(value ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function persist(next: ProductionType | "") {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productionType: next || null }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "작업구분을 저장하지 못했습니다.");
    if (result.id !== taskId || result.productionType !== (next || null)) throw new Error("저장 결과를 확인하지 못했습니다. 다시 선택해주세요.");
    onSaved?.(result.productionType);
  }

  async function save(next: string) {
    if (saving || disabled || (next !== "" && !isProductionType(next)) || next === selection) return;
    const previous = selection;
    const selected = next as ProductionType | "";
    setSelection(selected); setSaving(true); onSavingChange?.(true); setError("");
    try {
      await persist(selected);
    } catch (cause) {
      setSelection(previous);
      setError(cause instanceof Error ? cause.message : "작업구분을 저장하지 못했습니다. 다시 선택해주세요.");
    } finally { setSaving(false); onSavingChange?.(false); }
  }

  if (inline) return <InlineChoiceEditor label="작업구분" value={value ?? ""} emptyLabel="작업구분"
    options={[{ value: "", label: "작업구분" }, ...PRODUCTION_TYPES.map(type => ({ value: type, label: type }))]} disabled={disabled}
    onSave={async next => {
      if (next !== "" && !isProductionType(next)) throw new Error("작업구분을 목록에서 선택해주세요.");
      onSavingChange?.(true);
      try { await persist(next); } finally { onSavingChange?.(false); }
    }} />;

  return <div className={compact ? "min-w-0" : "inline-flex flex-col items-start"} data-card-interactive
    onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <label className={`flex items-center gap-1.5 text-xs ${selection ? "text-neutral-600" : "text-red-700"}`}>
      <span className={compact ? "sr-only" : undefined}>작업구분</span>
      <select aria-label="작업구분 선택" title="선택하면 바로 저장됩니다" value={selection} disabled={saving || disabled}
        onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
        onChange={(event) => { void save(event.target.value); }}
        className={`min-w-0 cursor-pointer rounded-lg border px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60 ${compact ? "w-full" : "max-w-full"} ${selection ? "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50" : "border-red-500 bg-red-50 font-medium text-red-700 hover:bg-red-100"}`}>
        <option value="">작업구분 미선택</option>
        {PRODUCTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
    </label>
    {saving && <span role="status" className="mt-1 text-xs text-neutral-500">저장 중…</span>}
    {error && <p role="alert" className="mt-1 max-w-64 whitespace-normal text-xs text-red-700">{error}</p>}
  </div>;
}
