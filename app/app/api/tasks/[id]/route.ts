import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activityLog";
import { computeDefaultEndDate, toISODate } from "@/lib/dateHelpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const before = await prisma.task.findUnique({ where: { id } });

  const data: Record<string, unknown> = {};

  const STATUS_VALUES = new Set(["in_progress", "review", "done"]);
  if (typeof body.status === "string" && STATUS_VALUES.has(body.status)) {
    data.status = body.status;
    data.statusChangedAt = new Date();
    data.completedAt = body.status === "done" ? new Date() : null;
    // 완료 버튼을 누른 시점을 종료일로 확정한다.
    if (body.status === "done") data.endDate = new Date();
    // 검토 버튼을 누른 날짜(시간 제외)를 검토일로 기록한다. 다른 날짜(시작일/종료일 등)는 건드리지 않는다.
    if (body.status === "review") data.reviewDate = new Date(toISODate(new Date()));
  }

  for (const field of [
    "assignee",
    "department",
    "brand",
    "productName",
    "platform",
    "tags",
    "memo",
    "requestContent",
  ] as const) {
    if (typeof body[field] === "string") data[field] = body[field];
  }
  if (typeof body.projectId === "string") {
    data.projectId = body.projectId || null;
  }
  if (typeof body.requestDateISO === "string") {
    data.requestDate = new Date(body.requestDateISO);
  }
  if (typeof body.startDateISO === "string") {
    const newStartDate = new Date(body.startDateISO);
    data.startDate = newStartDate;
    // 시작일이 바뀌면 종료일도 부서 기본값(시작일 기준)으로 다시 계산한다.
    const department = typeof body.department === "string" ? body.department : before?.department ?? null;
    data.endDate = computeDefaultEndDate(newStartDate, department);
  }
  if (typeof body.endDateISO === "string") {
    data.endDate = new Date(body.endDateISO);
  }
  if (typeof body.dueDateISO === "string") {
    data.dueDate = new Date(body.dueDateISO);
  }
  if (typeof body.reviewDateISO === "string") {
    data.reviewDate = new Date(body.reviewDateISO);
  }

  const task = await prisma.task.update({ where: { id }, data });

  if (before) {
    if (typeof body.status === "string" && STATUS_VALUES.has(body.status) && body.status !== before.status) {
      const STATUS_LABELS: Record<string, string> = { in_progress: "진행중", review: "검토", done: "완료" };
      await logActivity(
        `"${before.requestContent}" 상태를 ${STATUS_LABELS[before.status] ?? before.status} → ${STATUS_LABELS[body.status]}(으)로 변경했습니다.`,
        id
      );
    }
    if (typeof body.startDateISO === "string" && body.startDateISO !== before.startDate.toISOString()) {
      const oldLabel = before.startDate.toLocaleDateString("ko-KR");
      const newLabel = new Date(body.startDateISO).toLocaleDateString("ko-KR");
      await logActivity(`"${before.requestContent}" 시작일을 ${oldLabel} → ${newLabel}로 변경했습니다.`, id);
    }
  }

  return NextResponse.json(task);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json({ error: "존재하지 않는 업무입니다." }, { status: 404 });
  }
  await prisma.task.delete({ where: { id } });
  await logActivity(`"${task.requestContent}" 업무를 삭제했습니다.`);
  return NextResponse.json({ ok: true });
}
