import { z } from "../zod.js";
export const uploadUrlSchema = z.object({ mimeType: z.enum(["audio/mp4", "audio/mpeg", "audio/wav"]), byteSize: z.number().int().positive().max(20 * 1024 * 1024), durationSeconds: z.number().min(6).max(60) }).openapi("UploadUrlRequest");
export const uploadTicketSchema = z.object({ recordingId: z.string(), putUrl: z.string().url(), headers: z.record(z.string()), expiresAt: z.string() }).openapi("UploadTicket");
export const subscriptionSchema = z.object({ channel: z.enum(["wechat_subscribe", "apns", "apns_live_activity"]), token: z.string().regex(/^[a-fA-F0-9]{32,256}$/).optional() }).superRefine((data, ctx) => { if (data.channel !== "wechat_subscribe" && !data.token) ctx.addIssue({ code: "custom", message: "Push token required" }); }).openapi("SubscriptionRequest");
export const deviceSchema = z.object({ apnsToken: z.string().regex(/^[a-fA-F0-9]{32,256}$/), env: z.enum(["sandbox", "production"]) }).openapi("DeviceRequest");
