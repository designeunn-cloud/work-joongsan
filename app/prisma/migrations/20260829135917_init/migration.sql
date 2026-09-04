-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceFileName" TEXT NOT NULL,
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
    "rawExtractedText" TEXT NOT NULL,
    "aiConfidenceNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UnprocessedLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceFileName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "rawExtractedText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "AssigneeCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "notionUrl" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProductCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "brand" TEXT,
    "category1" TEXT,
    "category2" TEXT,
    "notionUrl" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "target" TEXT NOT NULL,
    "lastSyncedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_target_key" ON "SyncState"("target");
