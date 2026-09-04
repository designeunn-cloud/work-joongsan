import { prisma } from "./prisma";

/** 이름으로 프로젝트를 찾고 없으면 새로 만든다. 이름이 비어있으면 "기타"로 묶는다. */
export async function findOrCreateProjectByName(name: string | null | undefined) {
  const trimmed = name?.trim() || "기타";
  const existing = await prisma.project.findFirst({ where: { name: trimmed } });
  if (existing) return existing;
  return prisma.project.create({ data: { name: trimmed } });
}
