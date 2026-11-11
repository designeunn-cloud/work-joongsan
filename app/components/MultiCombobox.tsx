"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

export interface MultiComboboxHandle {
  /** Enter/클릭으로 커밋되지 않고 입력창에 남아있는 텍스트가 있으면 반환한다 (제출 직전에 사용). */
  flushPending: () => string | null;
}

/** 여러 값을 칩으로 선택할 수 있는 자동완성 입력 (Combobox의 다중 선택 버전). */
const MultiCombobox = forwardRef<
  MultiComboboxHandle,
  {
    values: string[];
    onChange: (values: string[]) => void;
    options: string[];
    placeholder?: string;
    inputLabel?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    keepOpenOnSelect?: boolean;
    inlineOptions?: boolean;
  }
>(function MultiCombobox({ values, onChange, options, placeholder, inputLabel, disabled = false, autoFocus, keepOpenOnSelect = false, inlineOptions = false }, ref) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const includesValue = (value: string) => values.some((item) => item.toLowerCase() === value.toLowerCase());

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useImperativeHandle(ref, () => ({
    flushPending: () => {
      const trimmed = (inputRef.current?.value ?? inputValue).trim();
      return trimmed && !includesValue(trimmed) ? trimmed : null;
    },
  }));

  const q = inputValue.trim().toLowerCase();
  const remaining = [...new Set(options)].filter((o) => !includesValue(o));
  const filtered = q ? remaining.filter((o) => o.toLowerCase().includes(q)) : remaining;
  const customValue = inputValue.trim();
  const canCreate = Boolean(customValue) && !includesValue(customValue) && !options.some((o) => o.toLowerCase() === q);
  // 직접 입력한 값이 목록에 없으면 Enter로 그 값을 우선 추가한다.
  const candidates = canCreate ? [customValue, ...filtered] : filtered;
  const visibleIndex = Math.min(activeIndex, candidates.length - 1);

  useEffect(() => {
    if (open) rootRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, visibleIndex, q]);

  function add(v: string) {
    if (disabled) return;
    const trimmed = v.trim();
    if (!trimmed) return;
    if (!includesValue(trimmed)) onChange([...values, trimmed]);
    setInputValue("");
    setOpen(keepOpenOnSelect);
  }

  function remove(v: string) {
    if (disabled) return;
    onChange(values.filter((x) => x !== v));
  }

  return (
    <div className="relative" ref={rootRef}>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs rounded-full pl-2 pr-1 py-0.5"
            >
              {v}
              <button
                type="button"
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => remove(v)}
                className="hover:bg-indigo-100 rounded-full w-4 h-4 flex items-center justify-center disabled:opacity-60"
                aria-label={`${v} 제거`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        disabled={disabled}
        autoFocus={autoFocus}
        role="combobox"
        aria-label={inputLabel ?? placeholder}
        aria-autocomplete="list"
        aria-expanded={open && candidates.length > 0}
        aria-controls={open && candidates.length > 0 ? listId : undefined}
        aria-activedescendant={open && visibleIndex >= 0 ? `${listId}-${visibleIndex}` : undefined}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => { if (!disabled) { setActiveIndex(0); setOpen(true); } }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && visibleIndex >= 0) add(candidates[visibleIndex]);
            else add(inputValue);
          } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && candidates.length > 0) {
            e.preventDefault(); setOpen(true);
            setActiveIndex(!open ? (e.key === "ArrowDown" ? 0 : candidates.length - 1) : e.key === "ArrowDown"
              ? (visibleIndex + 1) % candidates.length : (visibleIndex - 1 + candidates.length) % candidates.length);
          } else if (open && candidates.length > 0 && (e.key === "Home" || e.key === "End")) {
            e.preventDefault(); setActiveIndex(e.key === "Home" ? 0 : candidates.length - 1);
          } else if (e.key === "Escape" && open && candidates.length > 0) {
            e.preventDefault(); e.stopPropagation(); setOpen(false);
          } else if (e.key === "Backspace" && !inputValue && values.length > 0) {
            remove(values[values.length - 1]);
          }
        }}
        onBlur={(event) => {
          // 목록에 없는 값을 입력만 하고 Enter 없이 다른 곳을 클릭해도 칩으로 남도록,
          // 포커스를 벗어날 때 입력 중이던 텍스트를 자동으로 커밋한다.
          add(event.currentTarget.value);
          setOpen(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
      />
      {!disabled && open && candidates.length > 0 && (
        <div className={`${inlineOptions ? "" : "absolute left-0 top-full z-30"} mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-md`}>
          <p className="border-b border-neutral-100 px-3 py-1.5 text-[10px] text-neutral-400">↑↓ 이동 · Enter 선택 · Esc 닫기</p>
        <div id={listId} role="listbox" aria-label={inputLabel ? `${inputLabel} 검색 결과` : "검색 결과"} aria-multiselectable="true" className="max-h-48 overflow-y-auto py-1">
          {candidates.map((o, index) => (
            <button
              key={o}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={false}
              data-active={index === visibleIndex}
              tabIndex={-1}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => add(o)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${index === visibleIndex ? "bg-blue-50 text-blue-700" : "hover:bg-neutral-50"}`}
            >
              <span className="truncate">{canCreate && index === 0 ? `‘${o}’ 직접 추가` : o}</span>
              {index === visibleIndex && <span className="shrink-0 text-[10px]">Enter로 선택</span>}
            </button>
          ))}
        </div>
        </div>
      )}
    </div>
  );
});

export default MultiCombobox;
