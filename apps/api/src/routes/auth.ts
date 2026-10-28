import type { FastifyInstance } from "fastify";
import { wechatCodeSchema } from "@demo2song/contract";
import { repository } from "../db.js";
import { env } from "../env.js";
import { bindRoute } from "./bind.js";

function createDevSession(code: string): { openid: string; session_key?: string } {
  return { openid: `dev_${code.slice(0, 64)}` };
}

async function exchangeWechatCode(code: string): Promise<{ openid: string; session_key?: string }> {
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) {
    return createDevSession(code);
  }

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", env.WECHAT_APP_ID);
  url.searchParams.set("secret", env.WECHAT_APP_SECRET);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Wechat login failed: ${response.status}`);
    }
    const data = (await response.json()) as { openid?: string; session_key?: string; errmsg?: string; errcode?: number };
    if (!data.openid) {
      throw new Error(data.errmsg || `Wechat login did not return openid: ${data.errcode ?? "unknown"}`);
    }
    return { openid: data.openid, session_key: data.session_key };
  } catch (error) {
    if (!env.WECHAT_LOGIN_STRICT) {
      return createDevSession(code);
    }
    throw error;
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  bindRoute(app, "post", "/auth/wechat-login", async (request, reply) => {
    const body = wechatCodeSchema.parse(request.body);
    const session = await exchangeWechatCode(body.code);
    const user = await repository.upsertUserByOpenId(session.openid, session.session_key);

    return reply.send({ userId: user.id });
  }, { body: wechatCodeSchema });
}
