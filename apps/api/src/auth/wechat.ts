import { env } from "../env.js";

export interface WechatIdentity {
  openid: string;
  unionid?: string;
  sessionKey?: string;
}

export function devMpIdentity(code: string): WechatIdentity {
  const marker = code.indexOf("::");
  if (marker === -1) return { openid: `dev_${code.slice(0, 64)}` };
  const subject = code.slice(0, marker).slice(0, 64);
  const unionid = code.slice(marker + 2);
  return { openid: `dev_${subject}`, ...(unionid ? { unionid } : {}) };
}

export function devAppIdentity(code: string): WechatIdentity {
  const parsed = devMpIdentity(code);
  const subject = parsed.openid.startsWith("dev_") ? parsed.openid.slice(4) : parsed.openid;
  return { openid: `app_${subject}`, ...(parsed.unionid ? { unionid: parsed.unionid } : {}) };
}

function allowDevCode(code: string): boolean {
  return !env.WECHAT_LOGIN_STRICT && code.includes("::");
}

async function readWechatJson(url: URL): Promise<{ openid?: string; unionid?: string; session_key?: string; errmsg?: string; errcode?: number }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Wechat login failed: ${response.status}`);
  }
  return (await response.json()) as { openid?: string; unionid?: string; session_key?: string; errmsg?: string; errcode?: number };
}

export async function exchangeWechatMpCode(code: string): Promise<WechatIdentity> {
  if (allowDevCode(code) || !env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET) {
    return devMpIdentity(code);
  }

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", env.WECHAT_APP_ID);
  url.searchParams.set("secret", env.WECHAT_APP_SECRET);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  try {
    const data = await readWechatJson(url);
    if (!data.openid) {
      throw new Error(data.errmsg || `Wechat login did not return openid: ${data.errcode ?? "unknown"}`);
    }
    return { openid: data.openid, unionid: data.unionid, sessionKey: data.session_key };
  } catch (error) {
    if (!env.WECHAT_LOGIN_STRICT) return devMpIdentity(code);
    throw error;
  }
}

export async function exchangeWechatAppCode(code: string): Promise<WechatIdentity> {
  if (allowDevCode(code) || !env.WECHAT_OPEN_APP_ID || !env.WECHAT_OPEN_APP_SECRET) {
    return devAppIdentity(code);
  }

  const url = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  url.searchParams.set("appid", env.WECHAT_OPEN_APP_ID);
  url.searchParams.set("secret", env.WECHAT_OPEN_APP_SECRET);
  url.searchParams.set("code", code);
  url.searchParams.set("grant_type", "authorization_code");

  try {
    const data = await readWechatJson(url);
    if (!data.openid) {
      throw new Error(data.errmsg || `Wechat app login did not return openid: ${data.errcode ?? "unknown"}`);
    }
    return { openid: data.openid, unionid: data.unionid };
  } catch (error) {
    if (!env.WECHAT_LOGIN_STRICT) return devAppIdentity(code);
    throw error;
  }
}
