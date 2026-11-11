-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'excel',
    "sourceFileName" TEXT NOT NULL DEFAULT '',
    "folderPath" TEXT NOT NULL,
    "folderName" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "department" TEXT,
    "brand" TEXT,
    "productName" TEXT,
    "platform" TEXT,
    "tags" TEXT,
    "memo" TEXT,
    "isPriority" BOOLEAN NOT NULL DEFAULT false,
    "manualPriority" INTEGER,
    "projectId" TEXT,
    "requestContent" TEXT NOT NULL,
    "requestDate" DATETIME,
    "dueDate" DATETIME,
    "startDate" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "reviewDate" DATETIME,
    "plannedEndDate" DATETIME,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "workType" TEXT,
    "statusChangedAt" DATETIME,
    "completedAt" DATETIME,
    "rawExtractedText" TEXT NOT NULL DEFAULT '',
    "aiConfidenceNote" TEXT,
    "notionPageId" TEXT,
    "relatedTaskId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_relatedTaskId_fkey" FOREIGN KEY ("relatedTaskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("aiConfidenceNote", "assignee", "brand", "completedAt", "createdAt", "department", "dueDate", "endDate", "folderName", "folderPath", "id", "isPriority", "memo", "notionPageId", "plannedEndDate", "platform", "productName", "projectId", "rawExtractedText", "relatedTaskId", "requestContent", "requestDate", "reviewDate", "source", "sourceFileName", "startDate", "status", "statusChangedAt", "tags", "updatedAt", "workType") SELECT "aiConfidenceNote", "assignee", "brand", "completedAt", "createdAt", "department", "dueDate", "endDate", "folderName", "folderPath", "id", "isPriority", "memo", "notionPageId", "plannedEndDate", "platform", "productName", "projectId", "rawExtractedText", "relatedTaskId", "requestContent", "requestDate", "reviewDate", "source", "sourceFileName", "startDate", "status", "statusChangedAt", "tags", "updatedAt", "workType" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
