<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git 작업 흐름

- 사용자 요청에 따른 수정은 검증 후 관련 변경을 커밋하고 GitHub 원격 저장소에 푸시하는 것까지 함께 진행한다. 매번 별도로 요청받을 필요는 없다.
- 기존 미커밋·스테이징 변경을 확인하고, 현재 요청과 관련 없는 변경은 커밋에 섞지 않는다.
- 푸시 전 원격 변경을 확인하고 충돌을 해결한다. 강제 푸시나 기존 커밋 재작성은 별도 요청 없이 하지 않는다.
- 완료 보고에는 검증 결과와 커밋·푸시 여부를 간단히 포함한다. 실패한 경우 반영되지 않은 내용을 명확히 알린다.
