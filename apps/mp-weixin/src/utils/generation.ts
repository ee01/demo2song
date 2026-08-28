import Taro from "@tarojs/taro";
import { authHeader, request } from "./request";

const ACTIVE_JOB_KEY = "demo2song_active_generation";

export interface ActiveGeneration {
  jobId: string;
  songId: string;
}

export function saveActiveGeneration(value: ActiveGeneration): void {
  Taro.setStorageSync(ACTIVE_JOB_KEY, value);
}

export function clearActiveGeneration(jobId: string): void {
  const current = Taro.getStorageSync(ACTIVE_JOB_KEY) as ActiveGeneration | undefined;
  if (current?.jobId === jobId) Taro.removeStorageSync(ACTIVE_JOB_KEY);
}

export async function requestGenerationNotice(templateId?: string): Promise<boolean> {
  if (!templateId) return false;
  try {
    const result = await (Taro.requestSubscribeMessage as unknown as (
      options: { tmplIds: string[] }
    ) => Promise<Record<string, string>>)({ tmplIds: [templateId] });
    return result[templateId] === "accept";
  } catch {
    return false;
  }
}

export async function registerGenerationNotice(jobId: string, userId: string): Promise<void> {
  await request(`/jobs/${jobId}/notification`, {
    method: "POST",
    header: authHeader(userId)
  });
}
