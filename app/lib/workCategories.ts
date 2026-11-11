/** 업무분류는 요청자의 부서와 구분하며, 프로젝트에서 지정한 값을 우선한다. */
export const WORK_CATEGORIES = [
  "마케팅팀", "영업팀", "무역팀", "관리팀", "운영·개선", "회의·업무 협의",
] as const;

export type WorkCategory = typeof WORK_CATEGORIES[number];

const categoryAliases = new Map<string, WorkCategory>([
  ["마케팅팀", "마케팅팀"], ["마케팅부", "마케팅팀"],
  ["영업팀", "영업팀"], ["영업부", "영업팀"],
  ["무역팀", "무역팀"], ["무역부", "무역팀"],
  ["관리팀", "관리팀"], ["관리부", "관리팀"],
  ["운영개선", "운영·개선"], ["회의업무협의", "회의·업무 협의"],
]);

export function normalizeWorkCategory(value: unknown): WorkCategory | null {
  if (typeof value !== "string") return null;
  const key = value.trim().replace(/[\s.·ㆍ•∙⋅/／・]/g, "");
  return categoryAliases.get(key) ?? null;
}

export function getTaskWorkCategory(task: {
  department?: string | null;
  project?: { department?: string | null } | null;
}): WorkCategory | null {
  return normalizeWorkCategory(task.project?.department) ?? normalizeWorkCategory(task.department);
}
