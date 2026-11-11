import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDailyJournal, isValidJournalDate } from "@/lib/dailyJournal";
import { journalSelections, setJournalSelection } from "@/lib/journalMembership";
import { koreaDate } from "@/lib/workTime";
import { STANDING_JOURNAL_PROJECT_NAME, standingJournalTaskId } from "@/lib/journalStandingTasks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ date: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { date } = await params;
  if (!isValidJournalDate(date)) return NextResponse.json({ error: "날짜를 확인해주세요." }, { status: 400 });
  try {
    const journal = await getDailyJournal(date);
    const included = new Set(journal.tasks.map(task => task.id));
    const selections = await journalSelections(date);
    const [tasks, projects] = await Promise.all([
      prisma.task.findMany({ where: { source: { not: "journal" } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, requestContent: true, assignee: true, productName: true, status: true, createdAt: true, dueDate: true, project: { select: { name: true } } } }),
      prisma.project.findMany({ where: { name: STANDING_JOURNAL_PROJECT_NAME }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    ]);
    return NextResponse.json({ dateISO: date,
      projects: projects.map(project => ({ ...project, taskId: standingJournalTaskId(project.id), included: included.has(standingJournalTaskId(project.id)) })),
      tasks: tasks.map(task => ({ ...task, projectName: task.project?.name ?? null, included: included.has(task.id), manual: selections.some(item => item.taskId === task.id && item.included === 1), excluded: selections.some(item => item.taskId === task.id && item.included === 0) })),
    });
  } catch { return NextResponse.json({ error: "업무 목록을 불러오지 못했습니다. 다시 열어주세요." }, { status: 500 }); }
}
async function change(request: Request, context: Context, included: boolean) {
  const { date } = await context.params;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "업무프로그램에서 변경해주세요." }, { status: 403 });
  if (!isValidJournalDate(date) || (included && date !== koreaDate())) return NextResponse.json({ error: "업무 추가는 오늘 일지에서 해주세요." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const validIds = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.length <= 100 && ids.every(id => typeof id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(id));
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "taskIds" && key !== "projectIds")
    || !validIds(body.taskIds ?? []) || !validIds(body.projectIds ?? [])
    || !(body.taskIds?.length || body.projectIds?.length) || (!included && body.projectIds?.length)) {
    return NextResponse.json({ error: "업무를 선택해주세요." }, { status: 400 });
  }
  const ids: string[] = [...new Set<string>(body.taskIds ?? [])];
  const projectIds: string[] = [...new Set<string>(body.projectIds ?? [])];
  try {
    const journal = await getDailyJournal(date);
    const current = new Set(journal.tasks.map(task => task.id));
    let changed = 0;
    await prisma.$transaction(async db => {
      await db.$executeRaw`INSERT OR IGNORE INTO WorkTimer (id) VALUES ('active')`;
      await db.$executeRaw`UPDATE WorkTimer SET id = id WHERE id = 'active'`;
      const tasks = await db.task.findMany({ where: { id: { in: ids } }, select: { id: true } });
      if (tasks.length !== ids.length) throw new Error("삭제된 업무가 있습니다. 목록을 다시 열어주세요.");
      if (projectIds.length) {
        const projects = await db.project.findMany({ where: { id: { in: projectIds }, name: STANDING_JOURNAL_PROJECT_NAME }, select: { id: true, name: true, department: true } });
        if (projects.length !== projectIds.length) throw new Error("항시 업무 프로젝트를 다시 확인해주세요.");
        for (const project of projects) {
          const taskId = standingJournalTaskId(project.id);
          await db.task.upsert({ where: { id: taskId },
            create: { id: taskId, source: "journal", projectId: project.id, requestContent: project.name, department: project.department,
              assignee: "", status: "in_progress", folderPath: "", folderName: "", requestDate: null, startDate: null, endDate: null, completedAt: null },
            update: {},
          });
          ids.push(taskId);
        }
      }
      const targets = included ? [...new Set(ids)].filter(id => !current.has(id)) : ids.filter(id => current.has(id));
      for (const id of targets) await setJournalSelection(date, id, included, db);
      changed = targets.length;
    });
    return NextResponse.json({ dateISO: date, changed });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "변경하지 못했습니다." }, { status: 409 }); }
}
export function POST(request: Request, context: Context) { return change(request, context, true); }
export function DELETE(request: Request, context: Context) { return change(request, context, false); }
