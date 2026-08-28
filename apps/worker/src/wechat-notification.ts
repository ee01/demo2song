import type { SongJobRecord, SongRecord } from "@demo2song/data";
import { repository } from "./db.js";
import { env } from "./env.js";

let cachedToken: { value: string; expiresAt: number } | undefined;

function formatWechatTime(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", env.WECHAT_APP_ID!);
  url.searchParams.set("secret", env.WECHAT_APP_SECRET!);
  const response = await fetch(url);
  const body = await response.json() as { access_token?: string; expires_in?: number; errmsg?: string };
  if (!response.ok || !body.access_token) throw new Error(body.errmsg || `WeChat token ${response.status}`);
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 7200) * 1000 };
  return body.access_token;
}

export async function sendGenerationNotice(job: SongJobRecord, song: SongRecord): Promise<void> {
  if (!job.notificationAccepted || job.notificationSentAt) return;
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET || !env.WECHAT_SUBSCRIBE_TEMPLATE_ID) return;
  try {
    const user = await repository.getUserById(job.userId);
    if (!user) throw new Error("User not found");
    const token = await accessToken();
    const response = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        touser: user.openId,
        template_id: env.WECHAT_SUBSCRIBE_TEMPLATE_ID,
        page: `pages/song/index?id=${song.id}`,
        miniprogram_state: "formal",
        lang: "zh_CN",
        data: {
          time3: { value: formatWechatTime(new Date()) },
          thing5: { value: (song.title || (song.stage === "demo" ? "Demo 歌曲生成" : "完整歌曲生成")).slice(0, 20) },
          thing4: { value: "歌曲已生成，点击查看" }
        }
      })
    });
    const body = await response.json() as { errcode?: number; errmsg?: string };
    if (!response.ok || body.errcode) throw new Error(body.errmsg || `WeChat send ${response.status}`);
    await repository.updateJob(job.id, { notificationSentAt: new Date().toISOString(), notificationError: undefined });
  } catch (error) {
    await repository.updateJob(job.id, {
      notificationError: error instanceof Error ? error.message : String(error)
    });
  }
}
