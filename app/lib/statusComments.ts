import type { TaskStatus } from "./statusConfig";

export const REVIEW_PENDING = "담당자 확인중";
const pendingPrefix = /^담당자 확인중(?=$|[\s·(])/;

export function isReviewPendingLine(line: string) {
  return pendingPrefix.test(line.trim());
}

/** Remove the status label and keep any accompanying hand-written explanation. */
export function withoutReviewPending(notes: string) {
  return notes.split(/\r?\n/).flatMap(line => {
    if (!isReviewPendingLine(line)) return [line];
    const detail = line.trim().replace(pendingPrefix, "").trim().replace(/^·\s*/, "");
    return detail && !/^\(\d{1,2}\/\d{1,2}\)$/.test(detail) ? [detail] : [];
  }).join("\n");
}

export function addStatusNote(notes: string | null | undefined, comment: string) {
  const current = notes?.trim() ?? "";
  if (!isReviewPendingLine(comment)) return [current, comment].filter(Boolean).join("\n");
  const lines = current ? current.split(/\r?\n/) : [];
  if (lines.some(line => line.trim() === comment) || (comment === REVIEW_PENDING && lines.some(isReviewPendingLine))) return current;
  // A new explanation replaces the bare marker without dropping earlier explanations.
  const previous = withoutReviewPending(current);
  return [previous, comment].filter(Boolean).join("\n");
}

export function dailyNoteText(notes: string | null | undefined, carryReviewNote = false) {
  if (!carryReviewNote || notes === "") return notes ?? "";
  return addStatusNote(notes, REVIEW_PENDING);
}

export const COMMENT_OPTIONS = ["업무 대기", "작업 시작", "업무 보류", "작업 재개", "작업 완료", "수정 요청", "수정 완료", "전달 완료", "담당자 확인중", "상세 1차 확인", "상세 2차 확인", "최종 전달일", "기타"] as const;
export type CommentOption = typeof COMMENT_OPTIONS[number];

export function recordsStatusComments(task: { project?: { name?: string | null } | null; requestContent?: string | null }) {
  const source = task.project?.name?.trim() || task.requestContent || "";
  return /상세\s*페이지/.test(source);
}

/** 기존 표준 상태 코멘트만 제외하고 직접 작성한 비고는 유지한다. */
export function visibleStatusNotes(notes: string | null | undefined, enabled: boolean): string {
  if (enabled) return notes ?? "";
  return (notes ?? "").split(/\r?\n/).filter(line => !/^(?:업무 대기|작업 시작|업무 보류|작업 재개|작업 완료|수정 요청|수정 완료|전달 완료|담당자 확인중|상세 1차 확인|상세 2차 확인|최종 확인 완료|최종 전달일)(?=\s|[·+\-–—:]|$)/.test(line.trim())).join("\n");
}

export function getDefaultStatusCommentOption(from: TaskStatus, to: TaskStatus): CommentOption | "" {
  if (from === "in_progress" && to === "in_progress") return "작업 완료";
  if (to === "submitted") return REVIEW_PENDING;
  if (to === "planned") return "업무 대기";
  if (to === "review") return "업무 보류";
  if ((from === "in_progress" || from === "review") && to === "done") return "최종 전달일";
  if (from === "review" && to === "in_progress") return "작업 재개";
  if (from === "done" && to === "in_progress") return "수정 요청";
  if (to === "in_progress") return "작업 시작";
  return "";
}

export function composeStatusComment(option: CommentOption | "", detail: string, dateISO = "") {
  const text = !option || option === "기타" ? detail.trim() : [option, detail.trim()].filter(Boolean).join(" · ");
  if (!text || !dateISO) return text;
  const [, month, day] = dateISO.split("-");
  return text.replace(/\s*\(\d{1,2}\/\d{1,2}\)$/, "") + ` (${Number(month)}/${Number(day)})`;
}
