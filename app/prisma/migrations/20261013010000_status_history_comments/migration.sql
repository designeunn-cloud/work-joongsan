ALTER TABLE "ActivityLog" ADD COLUMN "fromStatus" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "toStatus" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "comment" TEXT;

-- Recover only transitions explicitly recorded in existing messages.
UPDATE "ActivityLog" SET
  "fromStatus" = CASE
    WHEN "message" LIKE '% 상태를 진행중 → %' THEN 'in_progress'
    WHEN "message" LIKE '% 상태를 검토 → %' THEN 'review'
    WHEN "message" LIKE '% 상태를 완료 → %' THEN 'done' END,
  "toStatus" = CASE
    WHEN "message" LIKE '% → 진행중(으)로 변경했습니다.' THEN 'in_progress'
    WHEN "message" LIKE '% → 검토(으)로 변경했습니다.' THEN 'review'
    WHEN "message" LIKE '% → 완료(으)로 변경했습니다.' THEN 'done' END
WHERE "field" = 'status';

-- Preserve endDate history while also exposing automatic reopen events.
UPDATE "ActivityLog" SET "fromStatus" = 'done', "toStatus" = 'in_progress'
WHERE "field" = 'endDate' AND "message" LIKE '%으로 업무를 다시 진행중으로 변경했습니다. 이전 종료일:%';
