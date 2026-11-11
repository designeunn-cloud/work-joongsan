/** These projects can be added as a journal-only row on any day the user selects them. */
export const STANDING_JOURNAL_PROJECT_NAME = "파일 관리 및 업무 관리";

export function standingJournalTaskId(projectId: string): string {
  return `journal-project-${projectId}`;
}
