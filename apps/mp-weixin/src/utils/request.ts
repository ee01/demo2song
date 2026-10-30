import { fixtureRequest } from "./fixture";
import Taro from "@tarojs/taro";

export const API_BASE = `${__API_BASE__.replace(/\/$/, "")}/v1`;

type ApiRequestOptions = Omit<Taro.request.Option, "url">;

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === "string") {
    return error || fallback;
  }
  if (error && typeof error === "object") {
    const { errMsg, error: apiError, message } = error as {
      errMsg?: unknown;
      error?: unknown;
      message?: unknown;
    };
    const candidate = errMsg ?? apiError ?? message;
    if (typeof candidate === "string" && candidate) {
      return candidate;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

type AuthResult = { accessToken: string; refreshToken: string; expiresIn: number; user: { id: string } };
const TOKEN_KEY = "d2s.auth.v1";
let session: AuthResult | undefined = Taro.getStorageSync(TOKEN_KEY) || undefined;
let loginPromise: Promise<string> | undefined;
let refreshPromise: Promise<void> | undefined;
function save(value: AuthResult) { session = value; Taro.setStorageSync(TOKEN_KEY, value); }
function clear() { session = undefined; loginPromise = undefined; Taro.removeStorageSync(TOKEN_KEY); }
export async function refresh() {
  if (!refreshPromise) refreshPromise = (async () => {
    if (!session) throw new Error("请重新登录");
    const result = await Taro.request<AuthResult>({ url: `${API_BASE}/auth/refresh`, method: "POST", data: { refreshToken: session.refreshToken } });
    if (result.statusCode !== 200) { clear(); throw new Error("登录已过期，请重试"); }
    save(result.data);
  })().finally(() => { refreshPromise = undefined; });
  return refreshPromise;
}
export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (__HARNESS__) return fixtureRequest(path) as T;
  const send = () => Taro.request<T>({ url: `${API_BASE}${path}`, ...options,
    header: { "content-type": "application/json", ...options.header, ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}) } });
  let response = await send();
  if (response.statusCode === 401 && session && !path.startsWith("/auth/")) { await refresh(); response = await send(); }
  if (response.statusCode >= 400) {
    const data = response.data as { error?: { code?: string } | string };
    const code = typeof data?.error === "object" ? data.error.code : data?.error;
    throw new Error(code || `请求失败 ${response.statusCode}`);
  }
  return response.data;
}
export async function ensureLogin(): Promise<string> {
  if (__HARNESS__) { const fixture = fixtureRequest("/auth/wechat-mp") as AuthResult; session = fixture; return fixture.user.id; }
  if (session) return session.user.id;
  if (!loginPromise) loginPromise = (async () => {
    const { code } = await Taro.login();
    save(await request<AuthResult>("/auth/wechat-mp", { method: "POST", data: { code } }));
    return session!.user.id;
  })().finally(() => { loginPromise = undefined; });
  return loginPromise;
}
export function authHeader(_userId: string): Record<string, string> {
  return session ? { Authorization: `Bearer ${session.accessToken}` } : {};
}
