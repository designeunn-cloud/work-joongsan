import type { TaskStatus } from "./statusConfig";

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
  if (to === "planned") return "업무 대기";
  if (to === "review") return "업무 보류";
  if ((from === "in_progress" || from === "review") && to === "done") return "최종 전달일";
  if (from === "review" && to === "in_progress") return "작업 재개";
  if (from === "done" && to === "in_progress") return "수정 요청";
  if (to === "in_progress") return "작업 시작";
  return "";
}

export function composeStatusComment(option: CommentOption | "", detail: string) {
  return !option || option === "기타" ? detail.trim() : [option, detail.trim()].filter(Boolean).join(" · ");
}
