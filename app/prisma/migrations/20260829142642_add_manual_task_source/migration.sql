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
    "requestContent" TEXT NOT NULL,
    "requestDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "completedAt" DATETIME,
    "rawExtractedText" TEXT NOT NULL DEFAULT '',
    "aiConfidenceNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Task" ("aiConfidenceNote", "assignee", "brand", "completedAt", "createdAt", "department", "folderName", "folderPath", "id", "productName", "rawExtractedText", "requestContent", "requestDate", "sourceFileName", "status", "updatedAt") SELECT "aiConfidenceNote", "assignee", "brand", "completedAt", "createdAt", "department", "folderName", "folderPath", "id", "productName", "rawExtractedText", "requestContent", "requestDate", "sourceFileName", "status", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
