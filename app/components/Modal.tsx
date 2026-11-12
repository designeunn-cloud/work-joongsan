"use client";

import { useEffect } from "react";

export default function Modal({
  onClose,
  children,
  widthClassName = "max-w-md",
  closeOnBackdropClick = true,
  label = "상세 창",
}: {
  onClose: () => void;
  children: React.ReactNode;
  widthClassName?: string;
  closeOnBackdropClick?: boolean;
  label?: string;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4" onClick={() => { if (closeOnBackdropClick) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-xl shadow-lg w-full p-6 max-h-[90vh] overflow-y-auto ${widthClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
