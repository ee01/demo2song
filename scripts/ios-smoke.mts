// Foreground, provider-independent HTTP E2E. No credentials or paid provider calls.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.DATA_BACKEND = "memory";
process.env.WECHAT_LOGIN_STRICT = "false";
const { buildApp } = await import("../apps/api/src/app.js");
const { repository } = await import("../apps/api/src/db.js");
const { setObjectStorageForTest } = await import("../apps/api/src/storage/index.js");
const { loadValidatedConfig } = await import("@demo2song/config");
const { createJobProcessor } = await import("../apps/worker/src/processor.js");
const objects = new Map<string, { body: Buffer; mime: string }>();
let base = "";
const url = (key: string) => `${base}/__storage/${encodeURIComponent(key)}`;
const storage = {
 async putObject(input: { key: string; body: Buffer; contentType: string }) { objects.set(input.key, { body: input.body, mime: input.contentType }); return { key: input.key }; },
 async headObject(key: string) { const object = objects.get(key); assert.ok(object); return { byteSize: object.body.length, contentType: object.mime }; },
 async getUploadUrl(key: string) { return url(key); }, async getSignedUrl(key: string) { return url(key); }, async getPublicOrSignedUrl(key: string) { return url(key); }
};
setObjectStorageForTest(storage);
const app = await buildApp();
app.addContentTypeParser("audio/mp4", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
app.put("/__storage/*", async (request, reply) => { const key=decodeURIComponent((request.params as {"*":string})["*"]); objects.set(key,{body:request.body as Buffer,mime:String(request.headers["content-type"])}); return reply.code(200).send(); });
app.get("/__storage/*", async (request, reply) => {const object=objects.get(decodeURIComponent((request.params as {"*":string})["*"]));if(!object)return reply.code(404).send(); return reply.type(object.mime).send(object.body)});
const dir=await mkdtemp(path.join(tmpdir(),"suiheng-ios-e2e-"));
try {
 base = await app.listen({host:"127.0.0.1",port:0});
 const request = async (endpoint: string, method="GET", body?: unknown, token?: string) => {
  const response=await fetch(`${base}/v1/${endpoint}`,{method,headers:{...(body===undefined?{}:{"content-type":"application/json"}),...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  assert.ok(response.ok,`${endpoint}: ${response.status} ${await response.clone().text()}`);return response.status===204?null:response.json();
 };
 const auth=await request("auth/wechat-mp","POST",{code:"local-smoke-code"});
 const file=path.join(dir,"humming.m4a");execFileSync("ffmpeg",["-v","error","-f","lavfi","-i","sine=frequency=330:duration=7","-c:a","aac","-b:a","128k",file]);const audio=await readFile(file);
 const ticket=await request("recordings/upload-url","POST",{mimeType:"audio/mp4",byteSize:audio.length,durationSeconds:7},auth.accessToken);
 const put=await fetch(ticket.putUrl,{method:"PUT",headers:ticket.headers,body:audio});assert.equal(put.status,200);
 const recording=await request(`recordings/${ticket.recordingId}/complete`,"POST",undefined,auth.accessToken);
 const job=await request("songs/demo-jobs","POST",{recordingId:recording.id,prompt:{style:"流行",language:"zh",vocalGender:"auto"}},auth.accessToken);
 const processor=createJobProcessor({repository,config:loadValidatedConfig(),storage:{getSignedUrl:storage.getSignedUrl,getObject:async key=>objects.get(key)!.body,putObject:async(key,body,mime)=>{objects.set(key,{body,mime})}},notifyJob:async()=>{},createProvider:()=>({
  getCapabilities:()=>({name:"minimax",supportsHummingMelody:true,supportsSongExtend:false,extendIsApproximate:false,supportsCommercialUse:"unknown",maxReferenceAudioSeconds:60,minReferenceAudioSeconds:6}),
  createDemoSong:async input=>({provider:"minimax",audioBase64:input.recording.audioBase64!,mimeType:"audio/mpeg",durationSeconds:7,title:"真机测试旋律",raw:{mock:true}}),
  createFullSong:async()=>{throw new Error("Not exercised")},
  normalizeError:error=>({code:"SMOKE_FAILED",message:String(error),retryable:false})
 })});
 const streamResponse = await fetch(`${base}/v1/jobs/${job.jobId}/events`, { headers: { authorization: `Bearer ${auth.accessToken}` }, signal: AbortSignal.timeout(10000) });
 assert.equal(streamResponse.headers.get("content-type"), "text/event-stream");
 const stream = streamResponse.body!.getReader(); let events = ""; const decoder = new TextDecoder();
 events += decoder.decode((await stream.read()).value); assert.ok(events.includes('"status":"queued"'));
 const finishedAt = Date.now(); assert.equal(await processor(),true);
 for (;;) { const next = await stream.read(); if (next.done) break; events += decoder.decode(next.value); }
 assert.ok(events.includes('"status":"succeeded"')); assert.ok(Date.now() - finishedAt < 3000, "SSE terminal status should arrive within 3 seconds");
 const status=await request(`jobs/${job.jobId}`,"GET",undefined,auth.accessToken);assert.equal(status.status,"succeeded");
 const song=await request(`songs/${job.songId}`,"GET",undefined,auth.accessToken);assert.equal(song.status,"ready");
 const playback=await fetch(song.playbackUrl);const generated=Buffer.from(await playback.arrayBuffer());assert.ok(generated.includes(Buffer.from("AIGC\0true")));
 const publicSong=await request(`public/songs/${song.id}`);assert.equal(publicSong.id,song.id);
 const library=await request("songs","GET",undefined,auth.accessToken);assert.equal(library.demos.length,1);
 const refreshed=await request("auth/refresh","POST",{refreshToken:auth.refreshToken});assert.equal(refreshed.user.id,auth.user.id);
 console.log("PASS: real HTTP login → m4a direct PUT → HEAD/complete → demo → SSE transition (<3s) → worker normalization → tagged playback → public share → library → refresh");
} finally { await app.close(); await rm(dir,{recursive:true,force:true}); setObjectStorageForTest(undefined); }
