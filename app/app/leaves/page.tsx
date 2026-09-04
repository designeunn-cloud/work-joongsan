"use client";

import { useEffect, useState, useCallback } from "react";
import type { Leave, LeaveType } from "@/lib/clientTypes";
import EditLeaveModal, { type EditLeaveInput } from "@/components/EditLeaveModal";
import LeaveMonthCalendar from "@/components/LeaveMonthCalendar";

function formatRange(startISO: string, endISO: string): string {
  const start = startISO.slice(0, 10);
  const end = endISO.slice(0, 10);
  return start === end ? start : `${start} ~ ${end}`;
}

export default function LeavesPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [totalDays, setTotalDays] = useState(0);
  const [totalDaysInput, setTotalDaysInput] = useState("0");
  const [loading, setLoading] = useState(true);
  const [savingQuota, setSavingQuota] = useState(false);
  const [editingLeave, setEditingLeave] = useState<Leave | null>(null);

  function changeMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  const load = useCallback(async (y: number) => {
    setLoading(true);
    const [leavesRes, quotaRes] = await Promise.all([
      fetch(`/api/leaves?year=${y}`).then((r) => r.json()),
      fetch(`/api/leave-quota?year=${y}`).then((r) => r.json()),
    ]);
    setLeaves(leavesRes);
    setTotalDays(quotaRes.totalDays);
    setTotalDaysInput(String(quotaRes.totalDays));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 연도가 바뀔 때마다 그 해 데이터 로드
    load(year);
  }, [year, load]);

  async function saveQuota() {
    const value = Number(totalDaysInput);
    if (Number.isNaN(value)) return;
    setSavingQuota(true);
    try {
      await fetch("/api/leave-quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, totalDays: value }),
      });
      setTotalDays(value);
    } finally {
      setSavingQuota(false);
    }
  }

  async function handleCalendarCreate(dateISO: string, type: LeaveType, memo: string) {
    await fetch("/api/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDateISO: dateISO, endDateISO: dateISO, type, memo }),
    });
    load(year);
  }

  async function handleCalendarResize(id: string, startISO: string, endISO: string) {
    const existing = leaves.find((l) => l.id === id);
    if (!existing) return;
    await fetch(`/api/leaves/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDateISO: startISO,
        endDateISO: endISO,
        type: existing.type,
        memo: existing.memo ?? "",
      }),
    });
    load(year);
  }

  async function handleCalendarChangeType(id: string, type: LeaveType) {
    const existing = leaves.find((l) => l.id === id);
    if (!existing) return;
    await fetch(`/api/leaves/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDateISO: existing.startDate.slice(0, 10),
        endDateISO: existing.endDate.slice(0, 10),
        type,
        memo: existing.memo ?? "",
      }),
    });
    load(year);
  }

  async function handleCalendarDelete(id: string) {
    await fetch(`/api/leaves/${id}`, { method: "DELETE" });
    load(year);
  }

  async function deleteLeave(id: string) {
    if (!confirm("이 휴가 기록을 삭제할까요?")) return;
    await fetch(`/api/leaves/${id}`, { method: "DELETE" });
    load(year);
  }

  async function saveEditedLeave(data: EditLeaveInput) {
    if (!editingLeave) return;
    await fetch(`/api/leaves/${editingLeave.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingLeave(null);
    load(year);
  }

  async function deleteEditingLeave() {
    if (!editingLeave) return;
    if (!confirm("이 휴가 기록을 삭제할까요?")) return;
    await fetch(`/api/leaves/${editingLeave.id}`, { method: "DELETE" });
    setEditingLeave(null);
    load(year);
  }

  const usedDays =
    Math.round(leaves.filter((l) => l.type !== "외부일정").reduce((sum, l) => sum + l.days, 0) * 10) / 10;
  const remainingDays = Math.round((totalDays - usedDays) * 10) / 10;

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-10 w-full">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">연차대장</h1>
            <p className="text-sm text-neutral-500 mt-1">내 연차/반차 사용 내역을 관리하세요.</p>
          </div>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </header>

        <section className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-neutral-200 rounded-xl shadow-sm px-4 py-4">
            <div className="text-xs text-neutral-500 mb-1">총 연차</div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.5"
                value={totalDaysInput}
                onChange={(e) => setTotalDaysInput(e.target.value)}
                onBlur={saveQuota}
                className="w-16 border border-neutral-300 rounded-lg px-2 py-1 text-lg font-bold text-neutral-900"
              />
              <span className="text-sm text-neutral-500">일</span>
              {savingQuota && <span className="text-xs text-neutral-400">저장 중...</span>}
            </div>
          </div>
          <div className="bg-white border border-neutral-200 rounded-xl shadow-sm px-4 py-4">
            <div className="text-xs text-neutral-500 mb-1">사용</div>
            <div className="text-2xl font-bold text-neutral-900">{usedDays}일</div>
          </div>
          <div className="bg-white border border-neutral-200 rounded-xl shadow-sm px-4 py-4">
            <div className="text-xs text-neutral-500 mb-1">잔여</div>
            <div className={`text-2xl font-bold ${remainingDays < 0 ? "text-red-600" : "text-emerald-600"}`}>
              {remainingDays}일
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-center gap-3 mb-3">
            <button
              onClick={() => changeMonth(-1)}
              className="text-sm px-2 py-1 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-100"
            >
              ◀
            </button>
            <h2 className="text-sm font-semibold text-neutral-700">
              {year}년 {month}월
            </h2>
            <button
              onClick={() => changeMonth(1)}
              className="text-sm px-2 py-1 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-100"
            >
              ▶
            </button>
          </div>
          <LeaveMonthCalendar
            year={year}
            month={month}
            leaves={leaves}
            onCreate={handleCalendarCreate}
            onResizeLeave={handleCalendarResize}
            onChangeType={handleCalendarChangeType}
            onDeleteLeave={handleCalendarDelete}
          />
        </section>

        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">사용 내역 ({leaves.length}건)</h2>
          {loading ? (
            <p className="text-sm text-neutral-400">불러오는 중...</p>
          ) : leaves.length === 0 ? (
            <p className="text-sm text-neutral-400">{year}년 등록된 휴가가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {leaves.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 shrink-0">
                        {l.type}
                      </span>
                      <span className="text-sm text-neutral-800">{formatRange(l.startDate, l.endDate)}</span>
                      <span className="text-xs text-neutral-400 shrink-0">{l.days}일</span>
                    </div>
                    {l.memo && <div className="text-xs text-neutral-400 mt-0.5 truncate">{l.memo}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingLeave(l)}
                      className="text-xs px-2 py-1 rounded-lg border border-neutral-200 text-neutral-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => deleteLeave(l.id)}
                      className="text-xs px-2 py-1 rounded-lg border border-neutral-200 text-neutral-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {editingLeave && (
          <EditLeaveModal
            leave={editingLeave}
            onCancel={() => setEditingLeave(null)}
            onSubmit={saveEditedLeave}
            onDelete={deleteEditingLeave}
          />
        )}
      </div>
    </div>
  );
}
