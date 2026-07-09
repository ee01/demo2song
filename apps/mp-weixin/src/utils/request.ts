import Taro from "@tarojs/taro";

export const API_BASE = __API_BASE__;

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

export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await Taro.request<T>({
    url: `${API_BASE}${path}`,
    ...options,
    header: {
      "content-type": "application/json",
      ...(options.header || {})
    }
  }).catch((error) => {
    throw new Error(errorMessage(error, "请求失败"));
  });
  if (response.statusCode >= 400) {
    throw new Error(errorMessage(response.data, `请求失败 ${response.statusCode}`));
  }
  return response.data;
}

let cachedUserId: string | undefined;
let loginPromise: Promise<string> | undefined;

export async function ensureLogin(): Promise<string> {
  if (cachedUserId) {
    return cachedUserId;
  }
  if (!loginPromise) {
    loginPromise = (async () => {
      const { code } = await Taro.login();
      const res = await request<{ userId: string }>("/auth/wechat-login", {
        method: "POST",
        data: { code }
      });
      cachedUserId = res.userId;
      return res.userId;
    })().catch((error) => {
      loginPromise = undefined;
      throw error;
    });
  }
  return loginPromise;
}

export function authHeader(userId: string): Record<string, string> {
  return { "x-user-id": userId };
}
