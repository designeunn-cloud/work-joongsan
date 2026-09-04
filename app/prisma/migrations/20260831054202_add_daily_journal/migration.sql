-- CreateTable
CREATE TABLE "DailyJournal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dateISO" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DailyJournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dailyJournalId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    CONSTRAINT "DailyJournalEntry_dailyJournalId_fkey" FOREIGN KEY ("dailyJournalId") REFERENCES "DailyJournal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyJournalEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyJournal_dateISO_key" ON "DailyJournal"("dateISO");
