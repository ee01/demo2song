import Taro from "@tarojs/taro";

export const API_BASE = __API_BASE__;

type ApiRequestOptions = Omit<Taro.request.Option, "url">;

export async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await Taro.request<T>({
    url: `${API_BASE}${path}`,
    ...options,
    header: {
      "content-type": "application/json",
      ...(options.header || {})
    }
  });
  if (response.statusCode >= 400) {
    throw new Error(typeof response.data === "string" ? response.data : JSON.stringify(response.data));
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
