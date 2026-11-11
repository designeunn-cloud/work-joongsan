"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { TaskStatus } from "@/lib/statusConfig";
import type { Task, MasterData, ActivityLogItem, Project, Leave } from "@/lib/clientTypes";
import { compareByDueDateUrgentFirst } from "@/lib/dateHelpers";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { StatCard } from "@/components/Primitives";
import TaskCard, { type DateField } from "@/components/TaskCard";
import EditTaskModal, { type EditTaskInput } from "@/components/EditTaskModal";

const LOG_PREVIEW_COUNT = 10;

const DATE_FIELD_BODY_KEY: Record<DateField, string> = {
  requestDate: "requestDateISO",
  plannedEndDate: "plannedEndDateISO",
  startDate: "startDateISO",
  reviewDate: "reviewDateISO",
  endDate: "endDateISO",
  dueDate: "dueDateISO",
};

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLeaveRange(startISO: string, endISO: string): string {
  const start = startISO.slice(0, 10);
  const end = endISO.slice(0, 10);
  return start === end ? start : `${start} ~ ${end}`;
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([]);
  const [master, setMaster] = useState<MasterData>({ assignees: [], products: [], platforms: [] });
  const [projects, setProjects] = useState<Project[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const load = useCallback(async () => {
    const [tasksRes, masterRes, activityLogRes, projectsRes, leavesRes] = await Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch("/api/master").then((r) => r.json()),
      fetch("/api/activity-log").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/leaves").then((r) => r.json()),
    ]);
    setTasks(tasksRes);
    setMaster(masterRes);
    setActivityLog(activityLogRes);
    setProjects(projectsRes);
    setLeaves(leavesRes);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 마운트 시 서버 데이터 로드
    load();
  }, [load]);
  useVisiblePolling(load, 8000);

  async function updateTaskStatus(id: string, status: TaskStatus) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function updateDate(id: string, field: DateField, iso: string) {
    const bodyKey = DATE_FIELD_BODY_KEY[field];
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [bodyKey]: iso }),
    });
    load();
  }

  async function openFolder(taskId: string) {
    await fetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
  }

  async function deleteTask(id: string) {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) {
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "삭제에 실패했습니다.");
    }
  }

  async function updateContent(id: string, content: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestContent: content }),
    });
    load();
  }

  async function saveEditedTask(data: EditTaskInput) {
    if (!editingTask) return;
    await fetch(`/api/tasks/${editingTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingTask(null);
    load();
  }

  const now = useMemo(() => new Date(), []);
  const todayISO = toISODate(now);

  const counts = useMemo(
    () => ({
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      review: tasks.filter((t) => t.status === "review").length,
      done: tasks.filter((t) => t.status === "done").length,
    }),
    [tasks]
  );

  const monthCompletedCount = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.completedAt &&
          new Date(t.completedAt).getFullYear() === now.getFullYear() &&
          new Date(t.completedAt).getMonth() === now.getMonth()
      ).length,
    [tasks, now]
  );

  const monthTotalCount = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !!t.requestDate && new Date(t.requestDate).getFullYear() === now.getFullYear() &&
          new Date(t.requestDate).getMonth() === now.getMonth()
      ).length,
    [tasks, now]
  );

  const todayTasks = useMemo(
    () => tasks.filter((t) => t.status !== "done").sort(compareByDueDateUrgentFirst),
    [tasks]
  );

  const reviewTasks = useMemo(() => tasks.filter((t) => t.status === "review"), [tasks]);

  // 오늘 포함 이후로 끝나는(=진행 중이거나 앞으로 있을) 휴가만 날짜순으로 보여준다.
  const upcomingLeaves = useMemo(
    () =>
      leaves
        .filter((l) => l.endDate.slice(0, 10) >= todayISO)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [leaves, todayISO]
  );

  // category는 수동 등록 업무엔 아예 없고(입력란이 없음) 일부 과거 데이터에도 비어있어 "미지정"이
  // 많이 나온다. project는 등록 시 항상 자동/수동으로 배정되므로(확인 안 되면 "기타") 대신 쓴다.
  const deptProjectTable = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const t of tasks) {
      const dept = t.department || "미지정";
      const project = t.project?.name || "기타";
      if (!map.has(dept)) map.set(dept, new Map());
      const inner = map.get(dept)!;
      inner.set(project, (inner.get(project) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tasks]);

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-10 w-full">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">대시보드</h1>
          <p className="text-sm text-neutral-500 mt-1">전체 업무 현황을 한눈에 확인하세요.</p>
        </header>

        {editingTask && (
          <EditTaskModal
            task={editingTask}
            master={master}
            projects={projects}
            onCancel={() => setEditingTask(null)}
            onSubmit={saveEditedTask}
          />
        )}

        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">예정된 휴가 ({upcomingLeaves.length})</h2>
          {upcomingLeaves.length === 0 ? (
            <p className="text-sm text-neutral-400">예정된 휴가가 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {upcomingLeaves.map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-sm">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 shrink-0">{l.type}</span>
                  <span className="text-neutral-800">{formatLeaveRange(l.startDate, l.endDate)}</span>
                  {l.memo && <span className="text-neutral-400 text-xs truncate">{l.memo}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid grid-cols-5 gap-4 mb-6">
          <StatCard label="진행중" value={counts.in_progress} tone="blue" icon="calendar" />
          <StatCard label="검토" value={counts.review} tone="orange" icon="alert" />
          <StatCard label="완료" value={counts.done} tone="emerald" icon="check" />
          <StatCard label="이번달 완료" value={monthCompletedCount} tone="emerald" icon="check" />
          <StatCard label="이번달 전체 업무" value={monthTotalCount} tone="indigo" icon="calendar" />
        </section>

        {loading ? (
          <p className="text-neutral-500">불러오는 중...</p>
        ) : (
          <div className="grid grid-cols-2 gap-6 mb-6">
            <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-neutral-700 mb-3">오늘 업무 ({todayTasks.length})</h2>
              {todayTasks.length === 0 ? (
                <p className="text-sm text-neutral-400">오늘 요청된 업무가 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {todayTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      master={master}
                      showOverdueBadge={false}
                      onUpdateStatus={updateTaskStatus}
                      onOpenFolder={openFolder}
                      onUpdateDate={updateDate}
                      onUpdateContent={updateContent}
                      onEdit={setEditingTask}
                      onDelete={deleteTask}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-neutral-700 mb-3">검토 대기 업무 ({reviewTasks.length})</h2>
              {reviewTasks.length === 0 ? (
                <p className="text-sm text-neutral-400">검토 대기 중인 업무가 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {reviewTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      master={master}
                      showOverdueBadge={false}
                      onUpdateStatus={updateTaskStatus}
                      onOpenFolder={openFolder}
                      onUpdateDate={updateDate}
                      onUpdateContent={updateContent}
                      onEdit={setEditingTask}
                      onDelete={deleteTask}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 mb-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">부서 × 프로젝트 현황</h2>
          {deptProjectTable.length === 0 ? (
            <p className="text-sm text-neutral-400">등록된 업무가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 border-b border-neutral-200">
                    <th className="py-2 pr-4 font-medium">부서</th>
                    <th className="py-2 pr-4 font-medium">프로젝트별 건수</th>
                  </tr>
                </thead>
                <tbody>
                  {deptProjectTable.map(([dept, projectMap]) => (
                    <tr key={dept} className="border-b border-neutral-100 last:border-0">
                      <td className="py-2 pr-4 font-medium text-neutral-800 whitespace-nowrap">{dept}</td>
                      <td className="py-2 pr-4 text-neutral-600">
                        {Array.from(projectMap.entries())
                          .map(([project, count]) => `${project} ${count}건`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-neutral-700">진행 기록</h2>
            {activityLog.length > LOG_PREVIEW_COUNT && (
              <button
                onClick={() => setShowAllLogs((v) => !v)}
                className="text-xs px-2.5 py-1 rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
              >
                {showAllLogs ? "접기" : `더보기 (전체 ${activityLog.length}건)`}
              </button>
            )}
          </div>
          {activityLog.length === 0 ? (
            <p className="text-sm text-neutral-400">아직 기록이 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {(showAllLogs ? activityLog : activityLog.slice(0, LOG_PREVIEW_COUNT)).map((a) => (
                <li key={a.id} className="text-sm text-neutral-600 flex items-baseline gap-2">
                  <span className="text-xs text-neutral-400 shrink-0">
                    {new Date(a.createdAt).toLocaleString("ko-KR")}
                  </span>
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
