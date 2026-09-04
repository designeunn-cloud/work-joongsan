"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toISODate } from "@/lib/dateHelpers";
import type { Task } from "@/lib/clientTypes";

// 예) "위즈웰 피자오븐 디자인자료(수정) (WOP121)" — 브랜드는 품명 DB에 있을 때만 앞에 붙이고,
// 없으면 그냥 업무요청내용만 쓴다(품명이 없으면 괄호도 생략).
function buildJournalText(tasks: Task[]): string {
  return tasks
    .map((t) => {
      const brandPrefix = t.brand ? `${t.brand} ` : "";
      const productSuffix = t.productName ? ` (${t.productName})` : "";
      const header = `- ${brandPrefix}${t.requestContent}${productSuffix}`;
      const subtaskLines = t.subtasks
        .map((s) => `  · ${s.done ? "[완료] " : ""}${s.content}`)
        .join("\n");
      return subtaskLines ? `${header}\n${subtaskLines}` : header;
    })
    .join("\n");
}

/** 복사용 텍스트 — 화면 표시와 달리 업무 줄 앞의 "- " 불릿은 뺀다. */
function buildCopyText(journalText: string): string {
  return journalText
    .split("\n")
    .map((line) => (line.startsWith("- ") ? line.slice(2) : line))
    .join("\n");
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export default function DailyJournal() {
  const todayISO = toISODate(new Date());
  const [dateISO, setDateISO] = useState(todayISO);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const res = await fetch(`/api/journal/${d}`);
    const data = await res.json();
    setTasks(data.tasks ?? []);
    setPreview(!!data.preview);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 날짜가 바뀔 때마다 서버에서 그날 스냅샷 로드
    load(dateISO);
  }, [dateISO, load]);

  const journalText = useMemo(() => buildJournalText(tasks), [tasks]);

  async function copy() {
    await navigator.clipboard.writeText(buildCopyText(journalText));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDateISO((d) => addDays(d, -1))}
            className="text-sm px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100"
            aria-label="이전날"
          >
            ◀
          </button>
          <h3 className="text-sm font-semibold text-neutral-700">
            {dateISO === todayISO ? "오늘" : dateISO} 업무일지 · {tasks.length}건
          </h3>
          <button
            onClick={() => setDateISO((d) => addDays(d, 1))}
            className="text-sm px-2 py-1 rounded-lg border border-neutral-300 hover:bg-neutral-100"
            aria-label="다음날"
          >
            ▶
          </button>
          {dateISO !== todayISO && (
            <button
              onClick={() => setDateISO(todayISO)}
              className="text-xs px-2.5 py-1 rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50"
            >
              오늘로
            </button>
          )}
        </div>
        <button
          onClick={copy}
          disabled={tasks.length === 0}
          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {copied ? "복사됨" : "복사하기"}
        </button>
      </div>

      {preview && (
        <p className="text-xs text-amber-600 mb-2">
          오늘 목록은 실시간으로 갱신되며, 자정이 지나면 고정됩니다. 밤 10시 이후 등록된 업무는 다음 영업일 일지로 넘어갑니다.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-neutral-400">불러오는 중...</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-neutral-400">해당 날짜에 기록된 업무가 없습니다.</p>
      ) : (
        <pre className="text-sm text-neutral-800 bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3 whitespace-pre-wrap font-sans">
          {journalText}
        </pre>
      )}
    </div>
  );
}
