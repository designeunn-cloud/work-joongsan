"use client";

import Modal from "./Modal";

export default function MemoModal({
  title,
  memo,
  onClose,
}: {
  title: string;
  memo: string;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} widthClassName="max-w-sm">
      <h2 className="text-sm font-semibold text-neutral-500 mb-1">메모</h2>
      <p className="text-xs text-neutral-400 mb-3 truncate">{title}</p>
      <p className="text-sm text-neutral-800 whitespace-pre-wrap mb-5">{memo}</p>
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="text-sm px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-100"
        >
          닫기
        </button>
      </div>
    </Modal>
  );
}
