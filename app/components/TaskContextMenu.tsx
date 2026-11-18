"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Action = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  description?: string;
  destructive?: boolean;
};

export default function TaskContextMenu({ taskName, x, y, trigger, actions, onClose }: {
  taskName: string;
  x: number;
  y: number;
  trigger: HTMLElement;
  actions: Action[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [x, y, trigger]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    function scroll(event: Event) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    function focusOutside(event: FocusEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusOutside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", focusOutside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  function closeAndFocus() {
    onClose();
    trigger.focus({ preventScroll: true });
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${taskName} 업무 메뉴`}
      className="fixed z-[80] w-56 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-lg bg-white p-1.5 text-sm text-neutral-800 shadow-lg ring-1 ring-neutral-200"
      style={{ left: x, top: y }}
      onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          closeAndFocus();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      <p className="truncate px-2.5 py-2 text-xs font-medium text-neutral-600" title={taskName}>{taskName}</p>
      {actions.map(action => <button
        key={action.label}
        type="button"
        role="menuitem"
        tabIndex={-1}
        disabled={action.disabled}
        title={action.description}
        className={`flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600 disabled:cursor-not-allowed disabled:text-neutral-500 ${action.destructive ? "text-red-700 hover:bg-red-50 focus:bg-red-50" : "hover:bg-neutral-100 focus:bg-neutral-100"}`}
        onClick={() => {
          closeAndFocus();
          action.onSelect();
        }}
      >
        <span aria-hidden="true" className="shrink-0">{action.icon}</span>
        <span>{action.label}{action.disabled && action.description && <span className="mt-0.5 block text-xs">{action.description}</span>}</span>
      </button>)}
    </div>,
    document.body,
  );
}
