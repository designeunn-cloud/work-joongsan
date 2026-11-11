CREATE TABLE "WorkTimer" ("id" TEXT NOT NULL PRIMARY KEY, "taskId" TEXT, "runningSince" TEXT);
CREATE TABLE "WorkTimeSegment" ("id" TEXT NOT NULL PRIMARY KEY, "taskId" TEXT NOT NULL, "startedAt" TEXT NOT NULL, "endedAt" TEXT NOT NULL);
CREATE TABLE "WorkTimeDay" ("taskId" TEXT NOT NULL, "dateISO" TEXT NOT NULL, "source" TEXT NOT NULL, "seconds" REAL NOT NULL, PRIMARY KEY ("taskId", "dateISO"));
