import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@prisma/client";
import { journalToday } from "./journalMemoSync";

export type JournalChange = { dateISO: string; taskId?: string; deletedTaskId?: string };
const shared = globalThis as unknown as {
  journalChangeContext?: AsyncLocalStorage<JournalChange[]>;
  journalChangePublisher?: (changes: JournalChange[]) => Promise<void>;
};
const changes = shared.journalChangeContext ??= new AsyncLocalStorage<JournalChange[]>();

export async function recordJournalChange(change: JournalChange) {
  const pending = changes.getStore();
  if (pending) pending.push(change); else await shared.journalChangePublisher?.([change]);
}

/** Collect mutations inside a transaction, and publish only after its commit. */
export function installJournalChangeTracker(client: PrismaClient, publish: (changes: JournalChange[]) => Promise<void>) {
  shared.journalChangePublisher = publish;
  const send = async (changes: JournalChange[]) => {
    if (!changes.length) return;
    try { await publish(changes); }
    catch (error) { console.error("[journal] 자동 동기화 예약 실패", error); }
  };
  const transaction = client.$transaction.bind(client);
  client.$transaction = (async (...args: unknown[]) => {
    const pendingChanges: JournalChange[] = [];
    const result = await changes.run(pendingChanges, () => Reflect.apply(transaction, client, args));
    await send(pendingChanges);
    return result;
  }) as typeof client.$transaction;
  client.$use(async (params, next) => {
    const result = await next(params);
    if (!["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"].includes(params.action)) return result;
    if (!["Task", "Project", "Subtask", "DailyJournalDetail", "JournalTaskSelection"].includes(params.model ?? "")) return result;
    // Linkage, automatic folder maintenance, and priority ordering do not represent work.
    if (params.model === "Task" && ["update", "updateMany"].includes(params.action)) {
      const data = params.args.data;
      const metadataOnly = Object.keys(data ?? {}).every(field => ["notionPageId", "updatedAt", "folderPath", "folderName", "manualPriority"].includes(field));
      if (metadataOnly) return result;
    }
    // Historical memo freezing is not a new edit to that day's journal.
    if (params.model === "DailyJournalDetail" && params.action === "upsert" && !Object.keys(params.args.update ?? {}).length) return result;
    const explicitDate = params.args?.where?.dateISO_taskId?.dateISO ?? params.args?.where?.dateISO
      ?? params.args?.create?.dateISO ?? params.args?.data?.dateISO;
    const change: JournalChange = {
      dateISO: typeof explicitDate === "string" ? explicitDate : journalToday(),
      ...(params.model === "Task" && !params.action.startsWith("delete") && typeof result?.id === "string" ? { taskId: result.id }
        : params.model === "Subtask" && typeof result?.taskId === "string" ? { taskId: result.taskId }
        : params.model === "DailyJournalDetail" && typeof result?.taskId === "string" ? { taskId: result.taskId } : {}),
      ...(params.model === "Task" && params.action === "delete" && typeof params.args?.where?.id === "string" ? { deletedTaskId: params.args.where.id } : {}),
    };
    const pending = changes.getStore();
    if (pending) pending.push(change); else await send([change]);
    return result;
  });
}
