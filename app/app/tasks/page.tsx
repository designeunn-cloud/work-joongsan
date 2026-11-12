"use client";

import { useEffect, useState, useCallback } from "react";
import type { TaskStatus } from "@/lib/statusConfig";
import type { Task, MasterData, UnprocessedLog, Project, Leave } from "@/lib/clientTypes";
import { toISODate } from "@/lib/dateHelpers";
import { useVisiblePolling } from "@/lib/useVisiblePolling";
import { TabButton } from "@/components/Primitives";
import KanbanBoard from "@/components/KanbanBoard";
import TaskTable from "@/components/TaskTable";
import WeekCalendar from "@/components/WeekCalendar";
import DailyJournal from "@/components/DailyJournal";
import AddTaskModal, { type NewTaskInput } from "@/components/AddTaskModal";
import EditTaskModal, { type EditTaskInput } from "@/components/EditTaskModal";
import TaskDetailModal from "@/components/TaskDetailModal";
import EditLeaveModal, { type EditLeaveInput } from "@/components/EditLeaveModal";
import GanttChart from "@/components/GanttChart";
import type { DateField } from "@/components/TaskCard";

const DATE_FIELD_BODY_KEY: Record<DateField, string> = {
  requestDate: "requestDateISO",
  plannedEndDate: "plannedEndDateISO",
  startDate: "startDateISO",
  reviewDate: "reviewDateISO",
  endDate: "endDateISO",
  dueDate: "dueDateISO",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<UnprocessedLog[]>([]);
  const [master, setMaster] = useState<MasterData>({ assignees: [], products: [], platforms: [] });
  const [projects, setProjects] = useState<Project[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [editingLeave, setEditingLeave] = useState<Leave | null>(null);
  const [view, setView] = useState<"kanban" | "table" | "calendar" | "journal">("kanban");

  const load = useCallback(async () => {
    const [tasksRes, logsRes, masterRes, projectsRes, leavesRes] = await Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch("/api/unprocessed").then((r) => r.json()),
      fetch("/api/master").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/leaves").then((r) => r.json()),
    ]);
    setTasks(tasksRes);
    setLogs(logsRes);
    setMaster(masterRes);
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
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [bodyKey]: iso }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      alert(error.error || "날짜 저장에 실패했습니다.");
      return;
    }
    load();
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

  async function saveEditedLeave(data: EditLeaveInput) {
    if (!editingLeave) return;
    await fetch(`/api/leaves/${editingLeave.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditingLeave(null);
    load();
  }

  async function deleteEditingLeave() {
    if (!editingLeave) return;
    if (!confirm("이 휴가 기록을 삭제할까요?")) return;
    await fetch(`/api/leaves/${editingLeave.id}`, { method: "DELETE" });
    setEditingLeave(null);
    load();
  }

  async function updateDateRange(id: string, startISO: string, endISO: string) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDateISO: startISO, plannedEndDateISO: endISO }),
    });
    if (!res.ok) { alert("일정 저장에 실패했습니다."); return; }
    load();
  }

  async function toggleSubtask(subtaskId: string, done: boolean) {
    await fetch(`/api/subtasks/${subtaskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    load();
  }

  async function deleteTask(id: string) {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) {
      window.dispatchEvent(new Event("work-time-updated"));
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "삭제에 실패했습니다.");
    }
  }

  async function openFolder(taskId: string) {
    await fetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
  }

  async function dismissLog(id: string) {
    await fetch(`/api/unprocessed/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: true }),
    });
    load();
  }

  async function submitNewTask(data: NewTaskInput) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowAddForm(false);
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "등록에 실패했습니다.");
    }
  }

  function jumpToTask(taskId: string) {
    const target = tasks.find((t) => t.id === taskId);
    if (target) setViewingTask(target);
  }

  /** "후속작업" 버튼 — 모달 없이, 원본을 그대로 복제한 새 업무를 즉시 진행중 상태로 만든다. */
  async function createFollowUp(original: Task) {
    if (creatingFollowUp) return;
    setCreatingFollowUp(true);
    const today = toISODate(new Date());
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignee: original.assignee,
          department: original.department || "",
          brand: original.brand || "",
          productName: original.productName || "",
          platform: original.platform || "",
          tags: original.tags || "",
          memo: original.memo || "",
          projectId: original.projectId || "",
          requestContent: original.requestContent,
          requestDateISO: today,
          startDateISO: today,
          relatedTaskId: original.id,
        }),
      });
      if (res.ok) {
        load();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "후속작업 등록에 실패했습니다.");
      }
    } finally {
      setCreatingFollowUp(false);
    }
  }

  async function uploadExcelTask(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/tasks/upload", { method: "POST", body: formData });
    if (res.ok) {
      setShowAddForm(false);
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "업로드에 실패했습니다.");
    }
  }

  const wideView = view === "journal" || view === "table";
  return (
    <div className="min-h-screen">
      <div className={`${wideView ? "max-w-none px-3 sm:px-6 py-5" : "max-w-6xl px-3 sm:px-6 py-10"} mx-auto w-full`}>
        <header className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">업무</h1>
            <p className="text-sm text-neutral-500 mt-1">칸반으로 상태를 관리하거나 캘린더로 일정을 확인하세요.</p>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 shrink-0"
          >
            + 새 업무 등록
          </button>
        </header>

        {!loading && (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 mb-6">
            <GanttChart
              tasks={tasks}
              leaves={leaves}
              onUpdateRange={updateDateRange}
              onEditLeave={setEditingLeave}
              onToggleSubtask={toggleSubtask}
            />
          </div>
        )}

        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
          <div className="flex gap-5 border-b border-neutral-200 mb-5 pb-3">
            <TabButton active={view === "kanban"} onClick={() => setView("kanban")}>
              칸반
            </TabButton>
            <TabButton active={view === "table"} onClick={() => setView("table")}>
              테이블
            </TabButton>
            <TabButton active={view === "calendar"} onClick={() => setView("calendar")}>
              캘린더
            </TabButton>
            <TabButton active={view === "journal"} onClick={() => setView("journal")}>
              일지
            </TabButton>
          </div>

          {showAddForm && (
            <AddTaskModal
              master={master}
              projects={projects}
              onCancel={() => setShowAddForm(false)}
              onSubmit={submitNewTask}
              onUpload={uploadExcelTask}
            />
          )}

          {editingTask && (
            <EditTaskModal
              task={editingTask}
              master={master}
              projects={projects}
              onCancel={() => setEditingTask(null)}
              onSubmit={saveEditedTask}
            />
          )}

          {viewingTask && (
            <TaskDetailModal
              task={viewingTask}
              onClose={() => setViewingTask(null)}
              onEdit={() => {
                setEditingTask(viewingTask);
                setViewingTask(null);
              }}
            />
          )}

          {editingLeave && (
            <EditLeaveModal
              leave={editingLeave}
              onCancel={() => setEditingLeave(null)}
              onSubmit={saveEditedLeave}
              onDelete={deleteEditingLeave}
            />
          )}

          {logs.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-amber-700 mb-2">⚠️ 확인 필요 ({logs.length})</h2>
              <ul className="space-y-2">
                {logs.map((log) => (
                  <li
                    key={log.id}
                    className="border border-amber-300 bg-amber-50 rounded-lg px-4 py-3 flex items-start justify-between gap-4"
                  >
                    <div>
                      <div className="font-medium">{log.sourceFileName}</div>
                      <div className="text-sm text-neutral-600 mt-0.5">{log.reason}</div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {new Date(log.createdAt).toLocaleString("ko-KR")}
                      </div>
                    </div>
                    <button
                      onClick={() => dismissLog(log.id)}
                      className="text-xs px-2 py-1 rounded-lg border border-neutral-300 hover:bg-white shrink-0"
                    >
                      확인함
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {loading ? (
            <p className="text-neutral-500">불러오는 중...</p>
          ) : view === "kanban" ? (
            <KanbanBoard
              tasks={tasks}
              master={master}
              onUpdateStatus={updateTaskStatus}
              onOpenFolder={openFolder}
              onUpdateDate={updateDate}
              onUpdateContent={updateContent}
              onEdit={setEditingTask}
              onDelete={deleteTask}
              onCreateFollowUp={createFollowUp}
              onJumpToTask={jumpToTask}
              onSubtasksChanged={load}
            />
          ) : view === "table" ? (
            <TaskTable
              tasks={tasks}
              master={master}
              onTaskChanged={load}
              onUpdateStatus={updateTaskStatus}
              onOpenFolder={openFolder}
              onUpdateDate={updateDate}
              onOpenDetail={setViewingTask}
              onEdit={setEditingTask}
              onDelete={deleteTask}
              onCreateFollowUp={createFollowUp}
            />
          ) : view === "calendar" ? (
            <WeekCalendar
              tasks={tasks}
              master={master}
              onUpdateStatus={updateTaskStatus}
              onOpenFolder={openFolder}
              onUpdateDate={updateDate}
              onUpdateContent={updateContent}
              onEdit={setEditingTask}
              onDelete={deleteTask}
              onCreateFollowUp={createFollowUp}
              onJumpToTask={jumpToTask}
              onSubtasksChanged={load}
            />
          ) : (
            <DailyJournal />
          )}
        </div>
      </div>
    </div>
  );
}
