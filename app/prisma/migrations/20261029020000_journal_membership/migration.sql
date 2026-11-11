CREATE TABLE "JournalTaskSelection" (
  "dateISO" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "included" INTEGER NOT NULL,
  PRIMARY KEY ("dateISO", "taskId"),
  CONSTRAINT "JournalTaskSelection_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
