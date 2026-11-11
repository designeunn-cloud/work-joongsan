import { Client } from "@notionhq/client";
import type { Task } from "@prisma/client";
import { prisma } from "./prisma";
import { toISODate } from "./dateHelpers";
import { STATUS_LABELS, type TaskStatus } from "./statusConfig";

function getClient(): Client {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN이 설정되지 않았습니다 (.env 확인)");
  return new Client({ auth: token });
}

function titleText(prop: unknown): string {
  const p = prop as { title?: Array<{ plain_text?: string }> } | undefined;
  return (p?.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

function selectName(prop: unknown): string | null {
  const p = prop as { select?: { name?: string } | null } | undefined;
  return p?.select?.name ?? null;
}

function relationIds(prop: unknown): string[] {
  const p = prop as { relation?: Array<{ id: string }> } | undefined;
  return (p?.relation ?? []).map((r) => r.id);
}

/**
 * "부서" DB는 담당자 DB와 별개 데이터소스다. 각 부서 행이 "담당자" relation으로
 * 소속 담당자 페이지를 역참조하는 구조라, 담당자 페이지 ID -> 부서명 맵을 먼저 만든다.
 */
async function fetchDepartmentByAssigneeId(notion: Client): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const dataSourceId = process.env.NOTION_DEPARTMENT_DB_ID;
  if (!dataSourceId) return map;

  let cursor: string | undefined = undefined;
  do {
    const res = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of res.results) {
      const p = page as { properties: Record<string, unknown> };
      const departmentName = titleText(p.properties["이름"]);
      if (!departmentName) continue;
      for (const assigneeId of relationIds(p.properties["담당자"])) {
        map.set(assigneeId, departmentName);
      }
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return map;
}

export async function syncAssignees(): Promise<number> {
  const notion = getClient();
  const dataSourceId = process.env.NOTION_ASSIGNEE_DB_ID;
  if (!dataSourceId) throw new Error("NOTION_ASSIGNEE_DB_ID가 설정되지 않았습니다");

  const departmentByAssigneeId = await fetchDepartmentByAssigneeId(notion);

  const rows: Array<{ name: string; department: string | null; url: string }> = [];
  let cursor: string | undefined = undefined;

  do {
    const res = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of res.results) {
      const p = page as { id: string; url?: string; properties: Record<string, unknown> };
      const name = titleText(p.properties["담당자"]);
      const department = departmentByAssigneeId.get(p.id) ?? null;
      if (name) rows.push({ name, department, url: p.url ?? `https://notion.so/${p.id.replace(/-/g, "")}` });
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  await prisma.$transaction([
    prisma.assigneeCache.deleteMany({}),
    prisma.assigneeCache.createMany({
      data: rows.map((r) => ({ name: r.name, department: r.department, notionUrl: r.url })),
    }),
    prisma.syncState.upsert({
      where: { target: "assignee" },
      update: { lastSyncedAt: new Date() },
      create: { target: "assignee", lastSyncedAt: new Date() },
    }),
  ]);

  return rows.length;
}

export async function syncProducts(): Promise<number> {
  const notion = getClient();
  const dataSourceId = process.env.NOTION_PRODUCT_DB_ID;
  if (!dataSourceId) throw new Error("NOTION_PRODUCT_DB_ID가 설정되지 않았습니다");

  const rows: Array<{
    code: string;
    brand: string | null;
    category1: string | null;
    category2: string | null;
    url: string;
  }> = [];
  let cursor: string | undefined = undefined;

  do {
    const res = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of res.results) {
      const p = page as { id: string; url?: string; properties: Record<string, unknown> };
      const code = titleText(p.properties["파일위치"]);
      if (!code) continue;
      rows.push({
        code,
        brand: selectName(p.properties["브랜드"]),
        category1: selectName(p.properties["1.카테고리"]),
        category2: selectName(p.properties["2.카테고리"]),
        url: p.url ?? `https://notion.so/${p.id.replace(/-/g, "")}`,
      });
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  await prisma.$transaction([
    prisma.productCache.deleteMany({}),
    prisma.productCache.createMany({
      data: rows.map((r) => ({
        code: r.code,
        brand: r.brand,
        category1: r.category1,
        category2: r.category2,
        notionUrl: r.url,
      })),
    }),
    prisma.syncState.upsert({
      where: { target: "product" },
      update: { lastSyncedAt: new Date() },
      create: { target: "product", lastSyncedAt: new Date() },
    }),
  ]);

  return rows.length;
}

export async function syncPlatforms(): Promise<number> {
  const notion = getClient();
  const dataSourceId = process.env.NOTION_PLATFORM_DB_ID;
  if (!dataSourceId) throw new Error("NOTION_PLATFORM_DB_ID가 설정되지 않았습니다");

  const rows: Array<{ name: string; url: string }> = [];
  let cursor: string | undefined = undefined;

  do {
    const res = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of res.results) {
      const p = page as { id: string; url?: string; properties: Record<string, unknown> };
      const name = titleText(p.properties["이름"]);
      if (!name) continue;
      rows.push({ name, url: p.url ?? `https://notion.so/${p.id.replace(/-/g, "")}` });
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  await prisma.$transaction([
    prisma.platformCache.deleteMany({}),
    prisma.platformCache.createMany({
      data: rows.map((r) => ({ name: r.name, notionUrl: r.url })),
    }),
    prisma.syncState.upsert({
      where: { target: "platform" },
      update: { lastSyncedAt: new Date() },
      create: { target: "platform", lastSyncedAt: new Date() },
    }),
  ]);

  return rows.length;
}

/**
 * 엑셀에서 새로 발견된 제품 코드(품명 DB에 아직 없는)를 노션 품명 DB에 새 페이지로 등록하고,
 * 로컬 캐시(ProductCache)에도 즉시 반영한다. 브랜드/카테고리는 알 수 없으므로 비워두고,
 * 담당자가 나중에 노션에서 직접 채우면 된다.
 */
export async function createProductInNotion(code: string): Promise<string> {
  const notion = getClient();
  const dataSourceId = process.env.NOTION_PRODUCT_DB_ID;
  if (!dataSourceId) throw new Error("NOTION_PRODUCT_DB_ID가 설정되지 않았습니다");

  const page = (await notion.pages.create({
    parent: { data_source_id: dataSourceId, type: "data_source_id" },
    properties: {
      파일위치: { title: [{ text: { content: code } }] },
    },
  })) as { id: string; url?: string };

  const url = page.url ?? `https://notion.so/${page.id.replace(/-/g, "")}`;

  await prisma.productCache.create({
    data: { code, brand: null, category1: null, category2: null, notionUrl: url },
  });

  return url;
}

export async function syncAll(): Promise<{ assignees: number; products: number; platforms: number }> {
  // 동시에 여러 개를 돌리면 노션 API 속도제한에 걸려 관계(relation) 조회 결과가 일부 누락되는
  // 현상이 관찰되어(부서 관계가 비정상적으로 비는 등), 순차 실행으로 바꿨다.
  const assignees = await syncAssignees();
  const products = await syncProducts();
  const platforms = await syncPlatforms();
  return { assignees, products, platforms };
}

/** 노션 페이지 URL(또는 "https://notion.so/{32자리 hex}")에서 페이지 ID를 하이픈 포함 UUID 형식으로 뽑아낸다. */
function extractPageId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/([0-9a-f]{32})(?:[?#]|$)/i);
  if (!match) return null;
  const hex = match[1];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function richText(value: string | null | undefined) {
  return { rich_text: value ? [{ text: { content: value.slice(0, 2000) } }] : [] };
}

function dateProp(value: Date | null | undefined) {
  return { date: value ? { start: toISODate(value) } : null };
}

/**
 * 업무 하나를 노션 "업무" DB에 생성 또는 갱신한다.
 * task.notionPageId가 있으면 update, 없으면 create 후 페이지 ID를 저장한다(다음부터는 update).
 * 담당자/품명은 relation이라 각각 AssigneeCache/ProductCache의 notionUrl에서 페이지 ID를 찾아
 * 연결한다(캐시에서 못 찾으면 해당 relation은 비워둔 채로 둔다 — 속성 자체를 생략).
 * 업무카테고리/플랫폼/태그 속성은 노션에서 제거되어 더 이상 보내지 않는다.
 */
export async function syncTaskToNotion(task: Task): Promise<string> {
  const notion = getClient();
  const dataSourceId = process.env.NOTION_TASK_DB_ID;
  if (!dataSourceId) throw new Error("NOTION_TASK_DB_ID가 설정되지 않았습니다");

  const assigneeCache = await prisma.assigneeCache.findFirst({ where: { name: task.assignee } });
  const assigneePageId = extractPageId(assigneeCache?.notionUrl);

  const productCache = task.productName
    ? await prisma.productCache.findFirst({ where: { code: task.productName } })
    : null;
  const productPageId = extractPageId(productCache?.notionUrl);

  const properties: Record<string, unknown> = {
    이름: { title: [{ text: { content: task.requestContent } }] },
    상태: { select: { name: STATUS_LABELS[task.status as TaskStatus] ?? task.status } },
    부서: richText(task.department),
    브랜드: richText(task.brand),
    메모: richText(task.memo),
    요청일: dateProp(task.requestDate),
    마감일: dateProp(task.dueDate),
    작업: {
      date: task.startDate
        ? { start: toISODate(task.startDate), end: task.endDate ? toISODate(task.endDate) : null }
        : null,
    },
  };
  if (assigneePageId) {
    properties["담당자"] = { relation: [{ id: assigneePageId }] };
  }
  if (productPageId) {
    properties["품명"] = { relation: [{ id: productPageId }] };
  }

  if (task.notionPageId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 노션 SDK 프로퍼티 유니온 타입이 너무 커서 동적 구성과 안 맞음
    await notion.pages.update({ page_id: task.notionPageId, properties: properties as any });
    return task.notionPageId;
  }

  const page = (await notion.pages.create({
    parent: { data_source_id: dataSourceId, type: "data_source_id" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 위와 동일
    properties: properties as any,
  })) as { id: string };

  await prisma.task.update({ where: { id: task.id }, data: { notionPageId: page.id } });
  return page.id;
}

/** 전체 업무를 순회하며 노션에 동기화한다. 개별 실패는 건너뛰고 개수만 집계한다. */
export async function syncAllTasksToNotion(): Promise<{ created: number; updated: number; failed: number }> {
  const tasks = await prisma.task.findMany({ where: { source: { not: "journal" } } });
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const task of tasks) {
    const hadPageId = !!task.notionPageId;
    try {
      await syncTaskToNotion(task);
      if (hadPageId) updated += 1;
      else created += 1;
    } catch (err) {
      failed += 1;
      console.error(`[notion-sync] 업무 동기화 실패 (${task.id}):`, err);
    }
  }

  return { created, updated, failed };
}
