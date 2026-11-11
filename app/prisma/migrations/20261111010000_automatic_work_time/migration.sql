CREATE TABLE "WorkTimeAuto" (
  "dateISO" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  CONSTRAINT "WorkTimeAuto_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WorkTimeAuto_taskId_idx" ON "WorkTimeAuto"("taskId");
