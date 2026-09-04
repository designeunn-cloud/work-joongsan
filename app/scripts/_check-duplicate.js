const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const tasks = await p.task.findMany({
    where: { OR: [{ requestContent: { contains: "쇼핑스토리" } }, { folderName: { contains: "쇼핑스토리" } }] },
    orderBy: { createdAt: "asc" },
  });
  for (const t of tasks) {
    console.log(JSON.stringify({ id: t.id, folderName: t.folderName, folderPath: t.folderPath, createdAt: t.createdAt, requestContent: t.requestContent }));
  }
  await p.$disconnect();
})();
