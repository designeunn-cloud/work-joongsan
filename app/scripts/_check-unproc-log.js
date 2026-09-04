const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const logs = await p.unprocessedLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
  for (const l of logs) {
    console.log(JSON.stringify({ sourceFileName: l.sourceFileName, reason: l.reason, resolved: l.resolved, createdAt: l.createdAt }));
  }
  await p.$disconnect();
})();
