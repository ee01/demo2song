import type { SongJobKind } from "@demo2song/shared";
import type { Demo2SongRepository } from "@demo2song/data";

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export async function assertAndConsumeQuota(input: {
  repository: Demo2SongRepository;
  userId: string;
  kind: SongJobKind;
  limit: number;
}): Promise<void> {
  const ok = await input.repository.consumeQuota({
    userId: input.userId,
    kind: input.kind,
    limit: input.limit
  });
  if (!ok) {
    throw new Error("DAILY_QUOTA_EXHAUSTED");
  }
}

export async function refundQuota(input: {
  repository: Demo2SongRepository;
  userId: string;
  kind: SongJobKind;
}): Promise<void> {
  await input.repository.refundQuota({
    userId: input.userId,
    kind: input.kind,
    dateKey: todayKey()
  });
}
