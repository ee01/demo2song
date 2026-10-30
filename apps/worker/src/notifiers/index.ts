import type { SongJobRecord, SongRecord } from "@demo2song/data";
import { repository } from "../db.js";
import { env } from "../env.js";
import { sendGenerationNotice } from "../wechat-notification.js";
import { sendApns } from "./apns.js";
export async function notifyJob(job: SongJobRecord, song: SongRecord, status: string) {
 // Fetch latest subscriptions, which may arrive while the provider is running.
 const latest = await repository.findJobForUser(job.id, job.userId); if (!latest) return;
 if (status === "succeeded") await sendGenerationNotice(latest, song).catch(() => {});
 const subscriptions = [...(latest.subscriptions ?? [])];
 const user = await repository.getUserById(job.userId);
 for (const device of status === "running" ? [] : user?.devices ?? []) {
  await sendApns({ token: device.apnsToken, live: false, sandbox: device.env === "sandbox", status, title: status === "succeeded" ? "你的歌曲已完成" : "生成失败，请打开随哼查看", songId: song.id }).catch(() => {});
 }
 for (const item of subscriptions) {
  if (item.channel === "wechat_subscribe" || !item.token || item.sentAt) continue;
  try { await sendApns({ token: item.token, live: item.channel === "apns_live_activity", sandbox: env.APNS_ENV === "sandbox", status, title: status === "succeeded" ? "歌曲已完成" : status === "failed" ? "生成失败" : "AI 正在编曲", songId: song.id }); if (status !== "running") item.sentAt = new Date().toISOString(); delete item.error; }
  catch (error) { item.error = error instanceof Error ? error.message : "PUSH_FAILED"; }
 }
 await repository.updateJob(job.id, { subscriptions });
}
