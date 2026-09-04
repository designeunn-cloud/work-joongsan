-- AlterTable
ALTER TABLE "Task" ADD COLUMN "notionPageId" TEXT;

-- CreateTable
CREATE TABLE "PlatformCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "notionUrl" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
