import "dotenv/config";
import { syncAll } from "../lib/notionSync";

syncAll()
  .then(({ assignees, products, platforms }) => {
    console.log(`[sync] 담당자 ${assignees}명, 제품명 ${products}개, 플랫폼 ${platforms}개 동기화 완료`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("[sync] 실패:", err);
    process.exit(1);
  });
