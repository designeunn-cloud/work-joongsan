"use client";

import { PRODUCTION_TYPES, type ProductionType } from "@/lib/productionTypes";

export default function ProductionTypeField({ value, onChange, disabled = false }: {
  value: ProductionType | ""; onChange: (value: ProductionType | "") => void; disabled?: boolean;
}) {
  return <label className="block text-xs font-medium text-neutral-600">
    작업구분 {!value && <span className="ml-1 text-red-700">미입력</span>}
    <select aria-label="작업구분" value={value} disabled={disabled}
      onChange={(event) => onChange(event.target.value as ProductionType | "")}
      className={`mt-1 block w-full rounded-lg border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50 ${value ? "border-neutral-300 bg-white text-neutral-800" : "border-red-500 bg-red-50 text-red-700"}`}>
      <option value="">미입력</option>
      {PRODUCTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
    </select>
    {!value && <span className="mt-1 block text-xs font-normal text-red-700">직접 선택해주세요. 비워 두면 미입력으로 표시됩니다.</span>}
  </label>;
}
