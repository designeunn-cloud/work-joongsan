# 신규 업무의 검토 단계

`TaskWorkflowPolicy`의 `review-v1`에 기록된 적용 시점 이후 생성된 업무에만 적용한다.
기존 업무를 편집하거나 다시 열어도 새 기준으로 전환하지 않는다.

| 업무 상태 | 일지 진행상태 | 실제 완료일 |
| --- | --- | --- |
| 대기 / 진행중 | 대기 / 진행중 | 최초 전달 전에는 비움 |
| 검토 (`submitted`) | 진행중 | 처음 검토로 변경한 날짜 |
| 보류 (`review`) | 보류 | 최초 검토일이 있으면 유지 |
| 완료 | 완료 | 최초 검토일 유지 |

최종 종료는 기존 `endDate`와 `completedAt`에 기록한다. 최초 검토 이후에는 최종 종료일까지 일지에 남으며 날짜별 제외 설정을 존중한다. 코멘트 항목은 변경하지 않는다.

## 배포 시 활성화

마이그레이션은 정책 테이블만 추가한다. 새 코드를 배포하고 데이터베이스를 백업한 뒤, 실제 운영 시작 시점에 아래 쿼리를 한 번 실행한다. ISO UTC 시각을 저장하며 재실행해도 기존 적용 시점은 덮어쓰지 않는다.

```sql
INSERT OR IGNORE INTO TaskWorkflowPolicy (name, activatedAt)
VALUES ('review-v1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
```

정책이 없으면 기존 동작을 유지한다. 활성화 후 `activatedAt`을 변경하거나 정책 행을 삭제하면 업무의 적용 범위가 달라지므로 유지한다. 업무나 기존 일지를 일괄 갱신하지 않는다.

현재 운영 데이터베이스에는 `2026-11-12T00:41:43.339Z`에 활성화했다. 적용 전후 업무·세부할일·일지·시간 기록은 동일함을 확인했다.

## 검증

다음 테스트는 별도 데이터베이스와 가짜 외부 연동을 사용하며 운영 업무와 시트를 변경하지 않는다.

```text
node --test scripts/review-workflow-backend.test.mjs scripts/review-workflow-ui.test.mjs scripts/journal-review-workflow.test.mjs scripts/review-carry-sync.test.mjs
```
