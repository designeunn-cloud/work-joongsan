"use client";

import { useEffect, useRef, useState } from "react";

/** 네이티브 datalist를 대체하는 자동완성 입력 — 목록이 입력창 바로 아래에 뜬다. */
export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const q = value.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;

  function select(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="relative" ref={rootRef}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-neutral-200 rounded-lg shadow-md py-1">
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => select(o)}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-50 truncate"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
