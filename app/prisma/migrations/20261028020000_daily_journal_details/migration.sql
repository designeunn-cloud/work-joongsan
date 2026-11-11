CREATE TABLE "DailyJournalDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dateISO" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "author" TEXT,
    "content" TEXT,
    "hours" REAL,
    "notes" TEXT,
    "outputLocation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyJournalDetail_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DailyJournalDetail_dateISO_taskId_key" ON "DailyJournalDetail"("dateISO", "taskId");
