import type { TaskStatus } from "@/lib/statusConfig";

export interface Task {
  id: string;
  source: "excel" | "manual";
  sourceFileName: string;
  rawExtractedText: string | null;
  folderPath: string;
  folderName: string;
  outputLocation?: string | null;
  assignee: string;
  department: string | null;
  brand: string | null;
  productName: string | null;
  platform: string | null;
  tags: string | null;
  memo: string | null;
  referenceMemo?: string | null;
  projectId: string | null;
  project: { name: string } | null;
  requestContent: string;
  requestDate: string;
  dueDate: string | null;
  startDate: string;
  reviewDate: string | null;
  endDate: string | null;
  status: TaskStatus;
  statusChangedAt: string | null;
  completedAt: string | null;
  aiConfidenceNote: string | null;
  relatedTaskId: string | null;
  relatedTask: { id: string; requestContent: string; status: TaskStatus } | null;
  followUps: { id: string; requestContent: string; status: TaskStatus }[];
  subtasks: Subtask[];
}

export interface UnprocessedLog {
  id: string;
  sourceFileName: string;
  reason: string;
  createdAt: string;
}

export interface ActivityLogItem {
  id: string;
  taskId: string | null;
  message: string;
  createdAt: string;
}

export interface SyncInfo {
  states: Array<{ target: string; lastSyncedAt: string }>;
  assigneeCount: number;
  productCount: number;
  platformCount: number;
}

export interface MasterData {
  assignees: Array<{ name: string; department: string | null }>;
  products: Array<{ code: string; brand: string | null }>;
  platforms: string[];
}

export interface Subtask {
  id: string;
  taskId: string;
  content: string;
  assignee: string | null;
  dueDate: string | null;
  done: boolean;
  completedAt: string | null;
}

export interface Project {
  id: string;
  name: string;
  department: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LeaveType = "연차" | "오전반차" | "오후반차" | "오전반반차" | "오후반반차" | "외부일정" | "반반차";

export interface Leave {
  id: string;
  startDate: string;
  endDate: string;
  type: LeaveType;
  days: number;
  memo: string | null;
  createdAt: string;
}
