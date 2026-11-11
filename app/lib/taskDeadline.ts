type DeadlineTask = { requestDate?: string | null; dueDate?: string | null; rawExtractedText?: string | null; aiConfidenceNote?: string | null };

/** 요청완료일이 따로 명시된 기존 요청서는 그 날짜를 사용하고, 그 외에는 요청일이 마감일이다. */
export function getTaskDeadline(task: DeadlineTask): string | null {
  // 과거 가져오기에서 필수 DB 날짜를 오늘로 대체한 값은 실제 요청일이 아니다.
  if (task.aiConfidenceNote?.split(" / ").some((note) => note === "요청일 미설정" || note === "요청일을 찾지 못해 오늘 날짜로 대체했습니다")) return null;
  return task[getTaskDeadlineField(task)] || task.requestDate || task.dueDate || null;
}

export function getTaskDeadlineField(task: DeadlineTask): "dueDate" | "requestDate" {
  const explicitCompletion = /(?:^|\n)\s*(?:요청완료일자|요청완료일|완료요청일|마감일자|마감일)\s*[|:：]/.test(task.rawExtractedText ?? "");
  if (explicitCompletion && task.dueDate) return "dueDate";
  return task.requestDate || !task.dueDate ? "requestDate" : "dueDate";
}

/** 날짜가 없는 업무는 뒤로 보내고, 같은 마감일은 먼저 등록된 업무를 우선한다. */
export function compareByTaskDeadline(a: DeadlineTask & { createdAt?: string }, b: typeof a): number {
  const time = (value: string | null | undefined) => {
    const parsed = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : Infinity;
  };
  const difference = time(getTaskDeadline(a)) - time(getTaskDeadline(b));
  return (Number.isNaN(difference) ? 0 : difference) || time(a.createdAt) - time(b.createdAt) || 0;
}
