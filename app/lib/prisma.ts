import { PrismaClient } from "@prisma/client";
import { installJournalChangeTracker } from "./journalChangeTracker";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  journalTrackerInstalled?: boolean;
  journalTrackerVersion?: number;
  prismaSchemaVersion?: number;
};

const schemaVersion = 2;
const clientChanged = !globalForPrisma.prisma || globalForPrisma.prismaSchemaVersion !== schemaVersion;
export const prisma = clientChanged ? new PrismaClient() : globalForPrisma.prisma!;

if (globalForPrisma.journalTrackerVersion !== 3 || clientChanged) {
  installJournalChangeTracker(prisma, async changes => {
    const { queueJournalChanges } = await import("./journalAutoSync");
    await queueJournalChanges(changes);
  });
  globalForPrisma.journalTrackerInstalled = true;
  globalForPrisma.journalTrackerVersion = 3;
  // Resume durable pending changes after a server restart, without creating edits.
  void import("./journalAutoSync").then(module => module.scheduleJournalAutoSync(2000))
    .catch(error => console.error("[journal] 자동 동기화 재개 실패", error));
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaVersion = schemaVersion;
}
