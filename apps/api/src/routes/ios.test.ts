import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { repository } from "../db.js";
import { issueSession } from "../auth/session.js";
const storage = vi.hoisted(() => ({ getUploadUrl: vi.fn(async () => "https://storage.test/upload"), headObject: vi.fn(async () => ({ byteSize: 1024, contentType: "audio/mp4" })), getPublicOrSignedUrl: vi.fn(async () => "https://storage.test/audio") }));
vi.mock("../storage/index.js", () => ({ getObjectStorage: () => storage }));
vi.mock("../auth/apple.js", () => ({ exchangeAppleCode: vi.fn(async () => ({ subject: "apple-" + randomUUID(), meta: { encryptedRefreshToken: "encrypted" } })), revokeAppleToken: vi.fn(async () => {}) }));
vi.mock("../auth/wechat.js", () => ({ exchangeWechatAppCode: vi.fn(async (code: string) => ({ openid: code, unionid: code })) }));
describe("iOS preparation", () => {
 afterEach(() => vi.clearAllMocks());
 async function session() { const user = await repository.createUser(); const auth = await issueSession(user.id, "ios"); return { user, headers: { authorization: `Bearer ${auth.accessToken}` } }; }
 it("accepts m4a only after HEAD validation, and rejects another owner's completion", async () => {
  const app = await buildApp(); const { user, headers } = await session();
  const ticket = await app.inject({ method: "POST", url: "/v1/recordings/upload-url", headers, payload: { mimeType: "audio/mp4", byteSize: 1024, durationSeconds: 12 } });
  expect(ticket.statusCode).toBe(200); const id = ticket.json().recordingId;
  expect((await repository.findRecordingForUser(id, user.id))?.rawMeta?.uploadComplete).toBe(false);
  const outsider = await session(); expect((await app.inject({ method: "POST", url: `/v1/recordings/${id}/complete`, headers: outsider.headers })).statusCode).toBe(404);
  storage.headObject.mockResolvedValueOnce({ byteSize: 12, contentType: "audio/mp4" });
  expect((await app.inject({ method: "POST", url: `/v1/recordings/${id}/complete`, headers })).statusCode).toBe(400);
  expect((await app.inject({ method: "POST", url: `/v1/recordings/${id}/complete`, headers })).statusCode).toBe(200);
  expect((await repository.findRecordingForUser(id, user.id))?.rawMeta?.uploadComplete).toBe(true);
  await app.close();
 });
 it("rejects oversized uploads and stores subscriptions/devices without duplicates", async () => {
  const app = await buildApp(); const { user, headers } = await session();
  expect((await app.inject({ method: "POST", url: "/v1/recordings/upload-url", headers, payload: { mimeType: "audio/mp4", byteSize: 30e6, durationSeconds: 12 } })).statusCode).toBe(400);
  const job = await repository.createSongJob({ userId: user.id, kind: "demo", status: "queued", provider: "minimax", requestPayload: {} });
  for (let i = 0; i < 2; i++) {
   expect((await app.inject({ method: "POST", url: `/v1/jobs/${job.id}/subscriptions`, headers, payload: { channel: "apns_live_activity", token: "a".repeat(64) } })).statusCode).toBe(200);
   expect((await app.inject({ method: "POST", url: "/v1/me/devices", headers, payload: { apnsToken: "a".repeat(64), env: "sandbox" } })).statusCode).toBe(200);
  }
  expect((await repository.findJobForUser(job.id, user.id))?.subscriptions).toHaveLength(1);
  expect((await repository.getUserById(user.id))?.devices).toHaveLength(1);
  await app.close();
 });
 it("requires explicit merge confirmation and rejects active jobs", async () => {
  const app = await buildApp(); const current = await session(); const target = await session(); const subject = randomUUID();
  await repository.createIdentity({ userId: target.user.id, provider: "wechat_mp", subject, unionId: subject });
  const response = await app.inject({ method: "POST", url: "/v1/me/identities", headers: current.headers, payload: { provider: "wechat_app", code: subject } });
  expect(response.statusCode).toBe(409); const mergeToken = response.json().error.params.mergeToken;
  expect(await repository.listIdentitiesForUser(current.user.id)).toHaveLength(0);
  const job = await repository.createSongJob({ userId: current.user.id, kind: "demo", status: "queued", provider: "minimax", requestPayload: {} });
  expect((await app.inject({ method: "POST", url: "/v1/me/merge", headers: current.headers, payload: { mergeToken } })).statusCode).toBe(409);
  await repository.updateJob(job.id, { status: "succeeded" });
  const merged = await app.inject({ method: "POST", url: "/v1/me/merge", headers: current.headers, payload: { mergeToken } });
  expect(merged.statusCode).toBe(200); expect(merged.json().user.id).toBe(target.user.id);
  expect((await repository.getUserById(current.user.id))?.mergedInto).toBe(target.user.id);
  await app.close();
 });
 it("deletes identity links, revokes sessions, and prevents reuse of a deleted account", async () => {
  const app = await buildApp(); const { user, headers } = await session();
  await repository.createIdentity({ userId: user.id, provider: "apple", subject: randomUUID(), meta: { encryptedRefreshToken: "encrypted" } });
  expect((await app.inject({ method: "DELETE", url: "/v1/me", headers })).statusCode).toBe(204);
  expect(await repository.listIdentitiesForUser(user.id)).toHaveLength(0);
  expect((await repository.getUserById(user.id))?.deletedAt).toBeTruthy();
  expect((await app.inject({ method: "GET", url: "/v1/me", headers })).statusCode).toBe(401);
  await app.close();
 });
 it("returns terminal SSE and enforces owner authorization", async () => {
  const app = await buildApp(); const { user, headers } = await session(); const other = await session();
  const job = await repository.createSongJob({ userId: user.id, kind: "demo", status: "succeeded", provider: "minimax", requestPayload: {} });
  expect((await app.inject({ url: `/v1/jobs/${job.id}/events`, headers: other.headers })).statusCode).toBe(404);
  const response = await app.inject({ url: `/v1/jobs/${job.id}/events`, headers });
  expect(response.headers["content-type"]).toBe("text/event-stream"); expect(response.body).toContain('"status":"succeeded"');
  await app.close();
 });
});
