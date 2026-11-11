-- Preserve notes previously inherited by historical journals before removing the fallback.
-- Explicit notes, including intentional blanks, are never replaced.
UPDATE "DailyJournalDetail"
SET "notes" = COALESCE((SELECT "memo" FROM "Task" WHERE "Task"."id" = "DailyJournalDetail"."taskId"), '')
WHERE "notes" IS NULL AND "dateISO" < date('now', '+9 hours');

INSERT INTO "DailyJournalDetail" ("id", "dateISO", "taskId", "notes", "updatedAt")
SELECT lower(hex(randomblob(16))), j."dateISO", t."id", COALESCE(t."memo", ''), CURRENT_TIMESTAMP
FROM "DailyJournalEntry" e
JOIN "DailyJournal" j ON j."id" = e."dailyJournalId"
JOIN "Task" t ON t."id" = e."taskId"
WHERE j."dateISO" < date('now', '+9 hours')
ON CONFLICT("dateISO", "taskId") DO NOTHING;
