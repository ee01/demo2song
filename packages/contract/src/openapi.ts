import { uploadUrlSchema, uploadTicketSchema, subscriptionSchema, deviceSchema } from "./schemas/ios.js";
import { OpenApiGeneratorV3, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { stringify } from "yaml";
import type { ZodTypeAny } from "zod";
import {
  apiErrorSchema,
  idParamsSchema
} from "./schemas/common.js";
import {
  appleLoginSchema,
  authResultSchema,
  linkIdentitySchema,
  meSchema,
  mergeRequestSchema,
  mergeRequiredSchema,
  refreshRequestSchema,
  wechatCodeSchema
} from "./schemas/auth.js";
import {
  createDemoJobResponseSchema,
  createFullJobResponseSchema,
  demoJobSchema,
  fullDraftSchema,
  fullJobSchema,
  generateFullDraftResponseSchema,
  hummingRecordingSchema,
  jobDetailSchema,
  legacyLoginResponseSchema,
  mySongsResponseSchema,
  okResponseSchema,
  publicAppConfigSchema,
  publicSongSchema,
  recordingUploadSchema,
  songDetailSchema
} from "./schemas/songs.js";

const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "/v1 访问令牌。旧路由在 LEGACY_HEADER_AUTH 开启时仍接受 x-user-id。"
});

const secured = [{ bearerAuth: [] }];

function jsonBody(schema: ZodTypeAny) {
  return {
    body: {
      required: true,
      content: {
        "application/json": { schema }
      }
    }
  };
}

function json(description: string, schema: ZodTypeAny) {
  return {
    description,
    content: {
      "application/json": { schema }
    }
  };
}

const errorResponse = json("错误", apiErrorSchema);

registry.registerPath({
  method: "get",
  path: "/health",
  operationId: "health",
  tags: ["meta"],
  summary: "健康检查",
  security: [],
  responses: {
    200: json("服务可用", okResponseSchema),
    400: errorResponse,
    500: errorResponse
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/config/public",
  operationId: "getPublicConfig",
  tags: ["config"],
  summary: "公开配置",
  security: [],
  responses: {
    200: json("公开配置", publicAppConfigSchema),
    400: errorResponse,
    500: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/auth/wechat-login",
  operationId: "loginWechatLegacy",
  tags: ["auth"],
  summary: "微信小程序登录（过渡接口，返回 userId）",
  security: [],
  request: jsonBody(wechatCodeSchema),
  responses: {
    200: json("登录成功", legacyLoginResponseSchema),
    400: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/auth/wechat-mp",
  operationId: "loginWechatMp",
  tags: ["auth"],
  summary: "微信小程序登录",
  security: [],
  request: jsonBody(wechatCodeSchema),
  responses: {
    200: json("登录成功", authResultSchema),
    400: errorResponse,
    401: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/auth/wechat-app",
  operationId: "loginWechatApp",
  tags: ["auth"],
  summary: "微信移动应用登录",
  security: [],
  request: jsonBody(wechatCodeSchema),
  responses: {
    200: json("登录成功", authResultSchema),
    400: errorResponse,
    401: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/auth/apple",
  operationId: "loginApple",
  tags: ["auth"],
  summary: "Sign in with Apple",
  security: [],
  request: jsonBody(appleLoginSchema),
  responses: {
    200: json("登录成功", authResultSchema),
    400: errorResponse,
    401: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/auth/refresh",
  operationId: "refreshSession",
  tags: ["auth"],
  summary: "刷新访问令牌",
  security: [],
  request: jsonBody(refreshRequestSchema),
  responses: {
    200: json("新的令牌", authResultSchema),
    401: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/auth/logout",
  operationId: "logout",
  tags: ["auth"],
  summary: "退出登录",
  security: secured,
  responses: {
    204: { description: "已退出" },
    401: errorResponse
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/me",
  operationId: "getMe",
  tags: ["auth"],
  summary: "当前用户",
  security: secured,
  responses: {
    200: json("当前用户", meSchema),
    401: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/me/identities",
  operationId: "linkIdentity",
  tags: ["auth"],
  summary: "绑定微信或 Apple",
  security: secured,
  request: jsonBody(linkIdentitySchema),
  responses: {
    200: json("绑定成功", meSchema),
    401: errorResponse,
    409: json("需要合并账号", mergeRequiredSchema)
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/me/merge",
  operationId: "mergeAccounts",
  tags: ["auth"],
  summary: "确认合并账号",
  security: secured,
  request: jsonBody(mergeRequestSchema),
  responses: {
    200: json("合并完成，令牌属于存活用户", authResultSchema),
    401: errorResponse,
    409: errorResponse
  }
});

registry.registerPath({
  method: "delete",
  path: "/v1/me",
  operationId: "deleteMe",
  tags: ["auth"],
  summary: "注销账号",
  security: secured,
  responses: {
    204: { description: "已注销" },
    401: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/recordings",
  operationId: "createRecording",
  tags: ["recordings"],
  summary: "上传哼唱录音",
  security: secured,
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: recordingUploadSchema
        }
      }
    }
  },
  responses: {
    201: json("录音已保存", hummingRecordingSchema),
    400: errorResponse,
    401: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/songs/demo-jobs",
  operationId: "createDemoJob",
  tags: ["songs"],
  summary: "提交 demo 生成",
  security: secured,
  request: jsonBody(demoJobSchema),
  responses: {
    201: json("任务已创建", createDemoJobResponseSchema),
    401: errorResponse,
    404: errorResponse,
    429: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/songs/{id}/full-draft",
  operationId: "createFullDraft",
  tags: ["songs"],
  summary: "生成完整版歌词草稿",
  security: secured,
  request: {
    params: idParamsSchema,
    ...jsonBody(fullDraftSchema)
  },
  responses: {
    200: json("歌词草稿", generateFullDraftResponseSchema),
    401: errorResponse,
    404: errorResponse,
    502: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/songs/{id}/full-jobs",
  operationId: "createFullJob",
  tags: ["songs"],
  summary: "提交完整版生成",
  security: secured,
  request: {
    params: idParamsSchema,
    body: {
      required: false,
      content: {
        "application/json": { schema: fullJobSchema }
      }
    }
  },
  responses: {
    201: json("任务已创建", createFullJobResponseSchema),
    401: errorResponse,
    404: errorResponse,
    409: errorResponse,
    429: errorResponse
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/songs",
  operationId: "listSongs",
  tags: ["songs"],
  summary: "我的歌曲",
  security: secured,
  responses: {
    200: json("歌曲列表", mySongsResponseSchema),
    401: errorResponse
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/songs/{id}",
  operationId: "getSong",
  tags: ["songs"],
  summary: "歌曲详情",
  security: secured,
  request: { params: idParamsSchema },
  responses: {
    200: json("歌曲详情", songDetailSchema),
    401: errorResponse,
    404: errorResponse
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/jobs/{id}/notification",
  operationId: "acceptJobNotification",
  tags: ["jobs"],
  summary: "登记完成通知",
  security: secured,
  request: { params: idParamsSchema },
  responses: {
    200: json("已登记", okResponseSchema),
    401: errorResponse,
    404: errorResponse
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/jobs/{id}",
  operationId: "getJob",
  tags: ["jobs"],
  summary: "任务状态",
  security: secured,
  request: { params: idParamsSchema },
  responses: {
    200: json("任务", jobDetailSchema),
    401: errorResponse,
    404: errorResponse
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/public/songs/{id}",
  operationId: "getPublicSong",
  tags: ["public"],
  summary: "公开试听",
  security: [],
  request: { params: idParamsSchema },
  responses: {
    200: json("公开歌曲", publicSongSchema),
    404: errorResponse
  }
});

registry.registerPath({ method: "post", path: "/v1/recordings/upload-url", operationId: "createUploadTicket", tags: ["recordings"], summary: "获取录音直传地址", security: secured, request: jsonBody(uploadUrlSchema), responses: { 200: json("直传凭据", uploadTicketSchema), 400: errorResponse, 401: errorResponse } });
registry.registerPath({ method: "post", path: "/v1/recordings/{id}/complete", operationId: "completeRecording", tags: ["recordings"], summary: "确认上传", security: secured, request: { params: idParamsSchema }, responses: { 200: json("录音", hummingRecordingSchema), 400: errorResponse, 401: errorResponse } });
registry.registerPath({ method: "post", path: "/v1/jobs/{id}/subscriptions", operationId: "subscribeToJob", tags: ["jobs"], summary: "订阅任务", security: secured, request: { params: idParamsSchema, ...jsonBody(subscriptionSchema) }, responses: { 200: json("完成", okResponseSchema), 401: errorResponse } });
registry.registerPath({ method: "post", path: "/v1/me/devices", operationId: "registerDevice", tags: ["auth"], summary: "注册推送设备", security: secured, request: jsonBody(deviceSchema), responses: { 200: json("完成", okResponseSchema), 401: errorResponse } });
registry.registerPath({ method: "get", path: "/v1/jobs/{id}/events", operationId: "jobEvents", tags: ["jobs"], summary: "任务状态 SSE", security: secured, request: { params: idParamsSchema }, responses: { 200: { description: "状态事件", content: { "text/event-stream": { schema: { type: "string" } } } }, 401: errorResponse } });

function normalizeOpenApi(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeOpenApi);
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (
      key === "additionalProperties" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { nullable?: boolean; type?: unknown }).nullable === true &&
      (value as { type?: unknown }).type === undefined
    ) {
      next[key] = true;
      continue;
    }
    next[key] = normalizeOpenApi(value);
  }
  return next;
}

export function createOpenApiDocument(): Record<string, unknown> {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  const document = generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: "随哼 API",
      version: "1.0.0",
      description:
        "随哼 /v1 契约。微信小程序登录、微信移动应用登录、刷新、退出和 /v1/me 已实现，两端登录命中同一个用户。支持 Apple 登录、绑定合并和注销。过渡登录 POST /v1/auth/wechat-login 仍返回 userId。"
    },
    servers: [{ url: "https://api.demo2song.eexx.me" }],
    tags: [
      { name: "meta", description: "运维" },
      { name: "config", description: "配置" },
      { name: "auth", description: "登录与账号" },
      { name: "recordings", description: "录音" },
      { name: "songs", description: "歌曲与生成" },
      { name: "jobs", description: "任务" },
      { name: "public", description: "无需登录" }
    ]
  });
  return normalizeOpenApi(JSON.parse(JSON.stringify(document))) as Record<string, unknown>;
}

export function renderOpenApiYaml(): string {
  const yamlText = stringify(createOpenApiDocument(), { lineWidth: 0 });
  return yamlText.endsWith("\n") ? yamlText : `${yamlText}\n`;
}
