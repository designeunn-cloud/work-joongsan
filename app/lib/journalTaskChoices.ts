export type JournalTaskFilter = "unfinished" | "in_progress" | "planned" | "submitted" | "review" | "done" | "all";

type Choice = {
  id: string;
  status: string;
  included: boolean;
  dueDate: string | null;
  createdAt: string;
  requestContent: string;
  assignee: string;
  productName: string | null;
  projectName?: string | null;
};

const statusRank: Record<string, number> = { in_progress: 0, planned: 1, submitted: 2, review: 3, done: 4 };

export function journalTaskChoices<T extends Choice>(tasks: T[], filter: JournalTaskFilter, query: string): T[] {
  const search = query.trim().toLowerCase();
  return tasks.filter(task => {
    const matchesStatus = filter === "all" || (filter === "unfinished" ? task.status !== "done" : task.status === filter);
    return matchesStatus && [task.requestContent, task.assignee, task.productName, task.projectName].filter(Boolean).join(" ").toLowerCase().includes(search);
  }).sort((a, b) => {
    // Already included tasks remain visible, after tasks that can still be added.
    const group = Number(a.included) - Number(b.included)
      || (statusRank[a.status] ?? 5) - (statusRank[b.status] ?? 5);
    if (group) return group;
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      const deadline = Date.parse(a.dueDate) - Date.parse(b.dueDate);
      if (deadline) return deadline;
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id);
  });
}
