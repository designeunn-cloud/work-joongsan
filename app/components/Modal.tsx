"use client";

import { useEffect } from "react";

export default function Modal({
  onClose,
  children,
  widthClassName = "max-w-md",
}: {
  onClose: () => void;
  children: React.ReactNode;
  widthClassName?: string;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-xl shadow-lg w-full p-6 max-h-[90vh] overflow-y-auto ${widthClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
