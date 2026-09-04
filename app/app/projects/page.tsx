"use client";

import { useEffect, useState, useCallback } from "react";
import type { TaskStatus } from "@/lib/statusConfig";
import type { Task, MasterData } from "@/lib/clientTypes";
import TaskCard, { type DateField } from "@/components/TaskCard";
import EditTaskModal, { type EditTaskInput } from "@/components/EditTaskModal";
import TaskDetailModal from "@/components/TaskDetailModal";

interface ProjectWithCount {
  id: string;
  name: string;
  department: string | null;
  createdAt: string;
  updatedAt: string;
  taskCount: number;
}

const DEPARTMENTS = ["마케팅팀", "영업부", "무역부", "기타"];

function TrashIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
    </svg>
  );
}

const DATE_FIELD_BODY_KEY: Record<DateField, string> = {
  startDate: "startDateISO",
  reviewDate: "reviewDateISO",
  endDate: "endDateISO",
  dueDate: "dueDateISO",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [master, setMaster] = useState<MasterData>({ assignees: [], products: [], platforms: [] });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);

  const load = useCallback(async () => {
    const [projectsRes, tasksRes, masterRes] = await Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/tasks").then((r) => r.json()),
      fetch("/api/master").then((r) => r.json()),
    ]);
    setProjects(projectsRes);
    setTasks(tasksRes);
    setMaster(masterRes);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 마운트 시 서버 데이터 로드
    load();
  }, [load]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), department: newDepartment }),
      });
      if (res.ok) {
        setNewName("");
        setNewDepartment("");
        load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function updateProjectDepartment(id: string, department: string) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department }),
    });
    load();
  }

  function startEditingProject(p: ProjectWithCount) {
    setEditingId(p.id);
    setEditName(p.name);
  }

  async function commitProjectRename(id: string) {
    const trimmed = editName.trim();
    setEditingId(null);
    const original = projects.find((p) => p.id === id);
    if (!trimmed || trimmed === original?.name) return;
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    load();
  }

  async function deleteProject(p: ProjectWithCount) {
    const message =
      p.taskCount > 0
        ? `"${p.name}" 프로젝트를 삭제할까요? 연결된 업무 ${p.taskCount}건은 프로젝트 미지정 상태로 남습니다.`
        : `"${p.name}" 프로젝트를 삭제할까요?`;
    if (!confirm(message)) return;
    const res = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
    if (res.ok) {
      if (selectedId === p.id) setSelectedId(null);
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

  const filteredTasks = selectedId ? tasks.filter((t) => t.projectId === selectedId) : [];
  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-10 w-full">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">프로젝트</h1>
          <p className="text-sm text-neutral-500 mt-1">관련 업무를 가볍게 묶어 관리하세요.</p>
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

        <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 mb-6">
          <form onSubmit={createProject} className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="새 프로젝트 이름"
              className="flex-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
            />
            <select
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
              className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm text-neutral-600"
            >
              <option value="">부서 미지정</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              추가
            </button>
          </form>
        </section>

        {loading ? (
          <p className="text-neutral-500">불러오는 중...</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-neutral-400">등록된 프로젝트가 없습니다.</p>
        ) : (
          <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <ul className="divide-y divide-neutral-100">
              {projects.map((p) =>
                editingId === p.id ? (
                  <li key={p.id} className="px-2 py-3">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => commitProjectRename(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitProjectRename(p.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full font-medium text-neutral-800 border border-indigo-300 rounded-lg px-2 py-1 outline-none"
                    />
                  </li>
                ) : (
                  <li key={p.id}>
                    <div
                      className={`flex items-center gap-1 rounded-lg transition-colors ${
                        selectedId === p.id ? "bg-indigo-50" : "hover:bg-neutral-50"
                      }`}
                    >
                      <button
                        onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                        onDoubleClick={() => startEditingProject(p)}
                        title="더블클릭해서 이름 수정"
                        className="flex-1 min-w-0 flex items-center justify-between gap-4 px-2 py-3 text-left"
                      >
                        <span className="font-medium text-neutral-800 truncate">{p.name}</span>
                        <span className="text-xs text-neutral-400 shrink-0">업무 {p.taskCount}건</span>
                      </button>
                      <select
                        value={p.department ?? ""}
                        onChange={(e) => updateProjectDepartment(p.id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs border border-neutral-200 rounded-lg px-1.5 py-1 text-neutral-500 shrink-0"
                      >
                        <option value="">부서 미지정</option>
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => deleteProject(p)}
                        title="삭제"
                        aria-label="삭제"
                        className="p-2 mr-1 rounded-lg text-neutral-600 hover:text-red-600 hover:bg-red-50 shrink-0"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </li>
                )
              )}
            </ul>
          </section>
        )}

        {selectedProject && (
          <section className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 mt-6">
            <h2 className="text-sm font-semibold text-neutral-700 mb-3">
              &quot;{selectedProject.name}&quot; 소속 업무 ({filteredTasks.length})
            </h2>
            {filteredTasks.length === 0 ? (
              <p className="text-sm text-neutral-400">
                이 프로젝트에 연결된 업무가 없습니다. 업무 등록 시 이 프로젝트를 선택하면 여기 표시됩니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredTasks.map((t) => (
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
                    onJumpToTask={(taskId) => {
                      const target = tasks.find((x) => x.id === taskId);
                      if (target) setViewingTask(target);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
