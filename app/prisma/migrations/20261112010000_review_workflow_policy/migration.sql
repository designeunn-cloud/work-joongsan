-- Deployment explicitly inserts the activation time after validation.
-- No historical task or journal rows are changed by this migration.
CREATE TABLE "TaskWorkflowPolicy" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "activatedAt" TEXT NOT NULL
);
