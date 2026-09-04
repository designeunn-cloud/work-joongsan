import { prisma } from "@/lib/prisma";

export async function logActivity(message: string, taskId?: string) {
  await prisma.activityLog.create({ data: { message, taskId } });
}
