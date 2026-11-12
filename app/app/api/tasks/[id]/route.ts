import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activityLog";
import { computeDefaultEndDate, toISODate } from "@/lib/dateHelpers";
import { STATUS_ORDER, STATUS_LABELS, type TaskStatus } from "@/lib/statusConfig";
import { getDefaultStatusCommentOption, recordsStatusComments } from "@/lib/statusComments";
import { getDefaultWorkType, isWorkType } from "@/lib/workTypes";
import { isProductionType } from "@/lib/productionTypes";
import { syncMemoToToday, journalToday, appendCommentToJournal } from "@/lib/journalMemoSync";
import { saveDay, settle, timerState } from "@/lib/workTimeServer";
import { recalculateAutomaticTime } from "@/lib/autoWorkTime";
import { getReviewWorkflowFirstDate, getReviewWorkflowPolicy, getReviewWorkflowStart, usesReviewWorkflow } from "@/lib/reviewWorkflowServer";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "수정할 업무 내용을 확인해주세요." }, { status: 400 });
  }
  if (body.outputLocation !== undefined && body.outputLocation !== null
    && (typeof body.outputLocation !== "string" || body.outputLocation.length > 4000)) {
    return NextResponse.json({ error: "결과물 위치는 4,000자 이내로 입력해주세요." }, { status: 400 });
  }
  if (body.referenceMemo !== undefined && body.referenceMemo !== null
    && (typeof body.referenceMemo !== "string" || body.referenceMemo.length > 40000)) {
    return NextResponse.json({ error: "메모는 40,000자 이내로 입력해주세요." }, { status: 400 });
  }
  if (body.productionType !== undefined && body.productionType !== null && body.productionType !== "" && !isProductionType(body.productionType)) {
    return NextResponse.json({ error: "작업구분을 목록에서 선택해주세요." }, { status: 400 });
  }
  if (body.workType !== undefined && !isWorkType(body.workType)) {
    return NextResponse.json({ error: "작업 구분을 확인해주세요." }, { status: 400 });
  }
  if (body.resetWorkStart !== undefined && typeof body.resetWorkStart !== "boolean") {
    return NextResponse.json({ error: "작업 날짜 갱신 요청을 확인해주세요." }, { status: 400 });
  }
  if (body.completionHours !== undefined && (typeof body.completionHours !== "number" || !Number.isFinite(body.completionHours) || body.completionHours < 0 || body.completionHours > 24)) {
    return NextResponse.json({ error: "소요시간은 0~24시간으로 입력해주세요." }, { status: 400 });
  }
  if (body.statusComment !== undefined && (typeof body.statusComment !== "string" || body.statusComment.length > 200 || /[\r\n]/.test(body.statusComment))) {
    return NextResponse.json({ error: "코멘트는 200자 이내의 한 줄로 입력해 주세요." }, { status: 400 });
  }
  for (const field of ["startDateISO", "plannedEndDateISO", "endDateISO", "requestDateISO", "dueDateISO", "reviewDateISO"]) {
    if (typeof body[field] === "string" && body[field] && !Number.isFinite(new Date(body[field]).getTime())) {
      return NextResponse.json({ error: "올바른 날짜를 입력해 주세요." }, { status: 400 });
    }
  }

  try {
    // Task fields, dated journal values, time settlement and logs commit together.
    // The journal change tracker publishes these mutations only after this transaction commits.
    return await prisma.$transaction(async tx => {
      const before = await tx.task.findUnique({ where: { id } });
      if (!before) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
      const reviewPolicy = await getReviewWorkflowPolicy(tx);
      const reviewStart = getReviewWorkflowStart(before, reviewPolicy);
      const reviewWorkflow = !!reviewStart && reviewStart.getTime() <= Date.now();
      const firstReviewDate = getReviewWorkflowFirstDate(before, reviewPolicy);
      const enrolledLegacyTask = reviewWorkflow && !usesReviewWorkflow(before, reviewPolicy.cutoff);
      const data: Record<string, unknown> = {};
      if (body.referenceMemo !== undefined) data.referenceMemo = body.referenceMemo || null;
      if (body.outputLocation !== undefined) {
        data.outputLocation = typeof body.outputLocation === "string" && body.outputLocation.trim() ? body.outputLocation : null;
      }
      if (body.productionType !== undefined) data.productionType = isProductionType(body.productionType) ? body.productionType : null;

      const STATUS_VALUES = new Set<string>(STATUS_ORDER);
      const nextStatus = typeof body.status === "string" && STATUS_VALUES.has(body.status) ? body.status : before.status;
      if (nextStatus === "submitted" && !reviewWorkflow) {
        return NextResponse.json({ error: "검토 단계는 새 기준이 적용된 업무에서만 사용할 수 있습니다." }, { status: 400 });
      }
      if (reviewWorkflow && nextStatus === "done" && !firstReviewDate) {
        return NextResponse.json({ error: "1차 전달 후 먼저 ‘검토’를 선택해 실제 완료일을 기록해주세요." }, { status: 400 });
      }
      if (reviewWorkflow && body.reviewDateISO === "" && (firstReviewDate || nextStatus === "submitted" || nextStatus === "done")) {
        return NextResponse.json({ error: "최초 검토일은 유지됩니다. 잘못 기록한 날짜는 올바른 날짜로 수정해주세요." }, { status: 400 });
      }
      let correctedReviewDate: Date | undefined;
      if (enrolledLegacyTask && typeof body.reviewDateISO === "string") {
        if (!firstReviewDate && nextStatus !== "submitted") {
          return NextResponse.json({ error: "먼저 ‘검토’를 선택해 1차 전달을 기록한 뒤 날짜를 수정해주세요." }, { status: 400 });
        }
        if (body.reviewDateISO && reviewStart) {
          correctedReviewDate = new Date(body.reviewDateISO);
          if (correctedReviewDate.getTime() < reviewStart.getTime()) {
            // A date-only selection on activation day must not turn into a legacy hold date.
            const activationDate = new Date(reviewStart.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
            if (body.reviewDateISO === activationDate) correctedReviewDate = reviewStart;
            else return NextResponse.json({ error: "검토일은 이 업무에 검토 단계가 적용된 날짜부터 선택해주세요." }, { status: 400 });
          }
        }
      }
      const commentProjectId = typeof body.projectId === "string" ? body.projectId : before.projectId;
      const commentProject = commentProjectId ? await tx.project.findUnique({ where: { id: commentProjectId }, select: { name: true } }) : null;
      const commentsEnabled = recordsStatusComments({ project: commentProject, requestContent: body.requestContent ?? before.requestContent });
      const resetWorkStart = body.resetWorkStart === true;
      if (resetWorkStart && (before.status !== "in_progress" || nextStatus !== "in_progress"
        || ["workType", "startDateISO", "endDateISO", "plannedEndDateISO"].some(field => body[field] !== undefined))) {
        return NextResponse.json({ error: "작업 날짜 갱신은 진행중 상태에서 단독으로 실행해주세요." }, { status: 400 });
      }
      const commentOnly = commentsEnabled && !resetWorkStart && before.status === "in_progress" && body.status === "in_progress" && Boolean(body.statusComment?.trim());
      if (commentOnly) data.updatedAt = new Date();
      if (body.workType !== undefined && (nextStatus !== "in_progress" || nextStatus === before.status)) {
        return NextResponse.json({ error: "작업 구분은 진행중으로 변경할 때 선택해주세요." }, { status: 400 });
      }
      if (nextStatus === "done" && before.status !== "done" && await tx.subtask.count({ where: { taskId: id, done: false } }) > 0) {
        return NextResponse.json({ error: "남은 세부할일을 완료한 뒤 업무를 완료해 주세요." }, { status: 400 });
      }
      if (body.completionHours !== undefined && nextStatus !== "done") {
        return NextResponse.json({ error: "완료할 업무의 소요시간을 확인해주세요." }, { status: 400 });
      }
      const stopsWork = body.status === "done" || (reviewWorkflow && nextStatus !== before.status && (nextStatus === "submitted" || nextStatus === "review"));
      if (stopsWork) {
        await tx.$executeRaw`INSERT OR IGNORE INTO WorkTimer (id) VALUES ('active')`;
        await tx.$executeRaw`UPDATE WorkTimer SET id = id WHERE id = 'active'`;
        const timer = await timerState(tx);
        if (timer.taskId === id) {
          if (body.completionHours !== undefined) return NextResponse.json({ error: "측정 중인 시간은 완료 시 자동 저장됩니다. 직접 입력한 시간을 비워주세요." }, { status: 409 });
          await settle(tx, timer, new Date());
          await tx.$executeRaw`UPDATE WorkTimer SET taskId = NULL, runningSince = NULL WHERE id = 'active'`;
        }
      }
      if (nextStatus !== before.status) {
        const now = new Date();
        data.status = nextStatus;
        data.statusChangedAt = now;
        data.completedAt = nextStatus === "done" ? now : null;
        data.endDate = nextStatus === "done" ? now : null;
        if (nextStatus === "in_progress") {
          data.workType = reviewWorkflow && firstReviewDate ? "revision" : body.workType ?? getDefaultWorkType(before.status as TaskStatus, before.workType);
          if (!before.startDate) {
            data.startDate = now;
            if (!before.plannedEndDate) data.plannedEndDate = computeDefaultEndDate(now, before.department);
          }
        } else if (before.status === "done" && nextStatus === "planned") data.workType = "revision";
        if (reviewWorkflow) {
          if (nextStatus === "submitted" && !firstReviewDate) data.reviewDate = now;
        } else if (nextStatus === "review") data.reviewDate = new Date(toISODate(now));
      }

      for (const field of ["assignee", "department", "brand", "productName", "platform", "tags", "memo", "requestContent"] as const) {
        if (typeof body[field] === "string") data[field] = body[field];
      }
      if (typeof body.projectId === "string") data.projectId = body.projectId || null;
      if (typeof body.requestDateISO === "string") data.requestDate = body.requestDateISO ? new Date(body.requestDateISO) : null;
      if ((typeof body.requestDateISO === "string" && body.requestDateISO) || (typeof body.dueDateISO === "string" && body.dueDateISO)) {
        data.aiConfidenceNote = before.aiConfidenceNote?.split(" / ")
          .filter(note => note !== "요청일 미설정" && note !== "요청일을 찾지 못해 오늘 날짜로 대체했습니다").join(" / ") || null;
      }
      if (typeof body.startDateISO === "string") {
        const newStartDate = body.startDateISO ? new Date(body.startDateISO) : null;
        data.startDate = newStartDate;
        if (newStartDate) data.plannedEndDate = computeDefaultEndDate(newStartDate, typeof body.department === "string" ? body.department : before.department);
      }
      if (typeof body.plannedEndDateISO === "string") data.plannedEndDate = body.plannedEndDateISO ? new Date(body.plannedEndDateISO) : null;
      if (typeof body.endDateISO === "string") {
        data.endDate = body.endDateISO ? new Date(body.endDateISO) : null;
        data.completedAt = nextStatus === "done" ? data.endDate : null;
      }
      if (typeof body.dueDateISO === "string") data.dueDate = body.dueDateISO ? new Date(body.dueDateISO) : null;
      if (typeof body.reviewDateISO === "string") data.reviewDate = body.reviewDateISO ? correctedReviewDate ?? new Date(body.reviewDateISO) : null;
      if (body.requestDateISO === "") {
        data.requestDate = null;
        data.dueDate = null;
      }
      if (resetWorkStart) {
        const now = new Date();
        data.startDate = now;
        data.statusChangedAt = now;
        await tx.activityLog.create({ data: {
          taskId: id, field: "workStartReset", fromStatus: "in_progress", toStatus: "in_progress", createdAt: now,
          workType: before.workType, comment: commentsEnabled ? body.statusComment?.trim() || "작업 날짜 갱신" : null,
          message: `"${before.requestContent}" 작업 날짜 갱신: ${before.startDate?.toISOString() ?? "미기록"} → ${now.toISOString()}.`,
        } });
      }
      const commentDate = journalToday();
      const statusMemo = commentsEnabled ? body.statusComment?.trim() : undefined;
      const recordedComment = statusMemo && (nextStatus !== before.status || commentOnly || resetWorkStart) ? statusMemo : null;
      if (recordedComment) data.memo = [typeof data.memo === "string" ? data.memo.trim() : before.memo?.trim(), recordedComment].filter(Boolean).join("\n");
      if (recordedComment) {
        if (typeof body.memo === "string") await syncMemoToToday(tx, id, body.memo, commentDate);
        await appendCommentToJournal(tx, id, recordedComment, commentDate);
      } else if (typeof data.memo === "string" && data.memo !== before.memo) await syncMemoToToday(tx, id, data.memo, commentDate);
      const task = await tx.task.update({ where: { id }, data });
      if (body.completionHours !== undefined) await saveDay(tx, id, commentDate, body.completionHours * 3600, "manual");
      if (body.outputLocation !== undefined) {
        await tx.dailyJournalDetail.upsert({
          where: { dateISO_taskId: { dateISO: commentDate, taskId: id } },
          create: { dateISO: commentDate, taskId: id, outputLocation: task.outputLocation },
          update: { outputLocation: task.outputLocation },
        });
      }

      if (nextStatus !== before.status) {
        const defaultComment = nextStatus === "in_progress" || (before.status === "in_progress" && nextStatus === "done")
          ? getDefaultStatusCommentOption(before.status as TaskStatus, nextStatus as TaskStatus) : null;
        await tx.activityLog.create({ data: {
          taskId: id, field: "status", fromStatus: before.status, toStatus: nextStatus,
          createdAt: task.statusChangedAt ?? new Date(),
          comment: commentsEnabled ? body.statusComment === undefined ? defaultComment : body.statusComment.trim() || null : null,
          workType: isWorkType(task.workType) ? task.workType : null,
          message: `"${before.requestContent}" 상태를 ${STATUS_LABELS[before.status as TaskStatus] ?? before.status} → ${STATUS_LABELS[nextStatus as TaskStatus]}(으)로 변경했습니다.`,
        } });
      } else if (commentOnly) {
        await tx.activityLog.create({ data: {
          taskId: id, field: "statusComment", fromStatus: "in_progress", toStatus: "in_progress",
          comment: body.statusComment.trim(), workType: task.workType, message: `"${before.requestContent}" 진행중 코멘트를 기록했습니다.`,
        } });
      }
      const dates = { requestDate: "요청일", startDate: "시작일", reviewDate: "검토일", plannedEndDate: "예정 종료일", endDate: "종료일", dueDate: "마감일" } as const;
      for (const field of Object.keys(dates) as (keyof typeof dates)[]) {
        if (before[field]?.getTime() === task[field]?.getTime()) continue;
        await tx.activityLog.create({ data: {
          taskId: id, field,
          message: `"${before.requestContent}" ${dates[field]}을 ${before[field]?.toISOString() ?? "미기록"} → ${task[field]?.toISOString() ?? "미기록"}로 변경했습니다.`,
        } });
      }
      const responseReviewDate = reviewWorkflow ? getReviewWorkflowFirstDate(task, reviewPolicy) : task.reviewDate;
      return NextResponse.json({ ...task, reviewDate: responseReviewDate, reviewWorkflow });
    }, { timeout: 25000 });
  } catch (error) {
    console.error("[tasks] 업무 저장 실패", error);
    return NextResponse.json({ error: "업무를 저장하지 못했습니다. 잠시 후 다시 시도해주세요. 상태와 기존 기록은 유지됩니다." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "존재하지 않는 업무입니다." }, { status: 404 });
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`INSERT OR IGNORE INTO WorkTimer (id) VALUES ('active')`;
    await tx.$executeRaw`UPDATE WorkTimer SET id = id WHERE id = 'active'`;
    const days = await tx.dailyJournalDetail.findMany({ where: { taskId: id }, select: { dateISO: true } });
    await tx.task.delete({ where: { id } });
    for (const date of new Set(days.map(day => day.dateISO))) await recalculateAutomaticTime(tx, date);
  });
  await logActivity(`"${task.requestContent}" 업무를 삭제했습니다.`);
  return NextResponse.json({ ok: true });
}
