-- Opted-in existing tasks keep their pre-activation journal display.
-- No task or journal rows are rewritten.
ALTER TABLE "TaskWorkflowPolicy" ADD COLUMN "legacySnapshot" TEXT;
