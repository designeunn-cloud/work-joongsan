import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { taskId } = await request.json();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });

  const escapedPath = task.folderPath.replace(/"/g, '\\"');
  const command =
    process.platform === "win32"
      ? `explorer "${escapedPath}"`
      : process.platform === "darwin"
      ? `open "${escapedPath}"`
      : `xdg-open "${escapedPath}"`;

  exec(command, (err) => {
    // Windows explorer.exe는 정상적으로 열려도 종종 0이 아닌 종료 코드를 반환하므로 무시한다.
    if (err && process.platform !== "win32") console.error("[open-folder]", err);
  });

  return NextResponse.json({ ok: true });
}
