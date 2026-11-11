ALTER TABLE "Task" ADD COLUMN "referenceMemo" TEXT;

-- Manual notices have a separately preserved source; move only an unchanged source copy.
UPDATE "Task" SET "referenceMemo" = "rawExtractedText",
  "memo" = CASE WHEN "memo" = "rawExtractedText" THEN NULL ELSE "memo" END
WHERE "source" = 'manual' AND "rawExtractedText" <> '';
