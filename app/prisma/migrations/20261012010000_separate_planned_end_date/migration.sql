-- Preserve existing schedule dates and make endDate the actual completion date.
ALTER TABLE "Task" ADD COLUMN "plannedEndDate" DATETIME;
UPDATE "Task" SET "plannedEndDate" = "endDate";
UPDATE "Task" SET "endDate" = NULL, "completedAt" = NULL WHERE "status" <> 'done';
UPDATE "Task" SET "endDate" = COALESCE("completedAt", "endDate"),
  "completedAt" = COALESCE("completedAt", "endDate") WHERE "status" = 'done';
