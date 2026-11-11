"use client";

import { useEffect, useId, useRef, useState } from "react";

/** 네이티브 datalist를 대체하는 자동완성 입력 — 목록이 입력창 바로 아래에 뜬다. */
export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  required,
  inputLabel,
  onCommit,
  autoFocus,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  inputLabel?: string;
  onCommit?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
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
  const uniqueOptions = [...new Set(options)];
  const filtered = q ? uniqueOptions.filter((o) => o.toLowerCase().includes(q)) : uniqueOptions;
  const visibleIndex = Math.min(activeIndex, filtered.length - 1);

  useEffect(() => {
    if (open) rootRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, visibleIndex, q]);

  function select(v: string) {
    onChange(v);
    setOpen(false);
    onCommit?.(v);
  }

  return (
    <div className="relative" ref={rootRef}>
      <input
        role="combobox"
        aria-label={inputLabel ?? placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && visibleIndex >= 0 ? `${listId}-${visibleIndex}` : undefined}
        value={value}
        autoFocus={autoFocus}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => {
          setActiveIndex(0);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          // 한글 조합을 확정하는 Enter는 항목 선택으로 처리하지 않는다.
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && visibleIndex >= 0) select(filtered[visibleIndex]);
            else if (onCommit) { setOpen(false); onCommit(value.trim()); }
          } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && filtered.length > 0) {
            e.preventDefault();
            setOpen(true);
            setActiveIndex(!open ? (e.key === "ArrowDown" ? 0 : filtered.length - 1) : e.key === "ArrowDown"
              ? (visibleIndex + 1) % filtered.length
              : (visibleIndex - 1 + filtered.length) % filtered.length);
          } else if (open && filtered.length > 0 && (e.key === "Home" || e.key === "End")) {
            e.preventDefault();
            setActiveIndex(e.key === "Home" ? 0 : filtered.length - 1);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
      />
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-md">
          <p className="border-b border-neutral-100 px-3 py-1.5 text-[10px] text-neutral-400">↑↓ 이동 · Enter 선택 · Esc 닫기</p>
        <div id={listId} role="listbox" aria-label={inputLabel ? `${inputLabel} 검색 결과` : "검색 결과"} className="max-h-48 overflow-y-auto py-1">
          {filtered.map((o, index) => (
            <button
              key={o}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={o === value}
              data-active={index === visibleIndex}
              tabIndex={-1}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(o)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${index === visibleIndex ? "bg-blue-50 text-blue-700" : "hover:bg-neutral-50"}`}
            >
              <span className="truncate">{o}</span>
              {o === value ? <span className="shrink-0 text-[10px]">✓ 선택됨</span> : index === visibleIndex && <span className="shrink-0 text-[10px]">Enter로 선택</span>}
            </button>
          ))}
        </div>
        {!filtered.length && <p role="status" className="px-3 py-2 text-xs text-neutral-400">검색 결과가 없습니다. 입력한 내용을 사용할 수 있습니다.</p>}
        </div>
      )}
    </div>
  );
}
