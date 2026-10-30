import { connect } from "node:http2";
import { importPKCS8, SignJWT } from "jose";
import { env } from "../env.js";
export async function sendApns(input: { token: string; live: boolean; sandbox: boolean; status: string; title: string; songId?: string }) {
 if (!env.APNS_PRIVATE_KEY || !env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_BUNDLE_ID) throw new Error("APNS_NOT_CONFIGURED");
 const jwt = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: env.APNS_KEY_ID }).setIssuer(env.APNS_TEAM_ID).setIssuedAt().sign(await importPKCS8(env.APNS_PRIVATE_KEY.replace(/\\n/g, "\n"), "ES256"));
 const terminal = input.status === "succeeded" || input.status === "failed";
 const aps = input.live ? { timestamp: Math.floor(Date.now()/1000), event: terminal ? "end" : "update", "content-state": { status: input.status, title: input.title, songId: input.songId ?? null }, ...(terminal ? { "dismissal-date": Math.floor(Date.now()/1000) + 3600 } : {}) } : { alert: { title: "随哼", body: input.title }, sound: "default" };
 await new Promise<void>((resolve, reject) => {
  const client = connect(input.sandbox ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com");
  const timer = setTimeout(() => { client.destroy(); reject(new Error("APNS_TIMEOUT")); }, 15000);
  const finish = (error?: Error) => { clearTimeout(timer); client.close(); error ? reject(error) : resolve(); };
  client.on("error", finish);
  const req = client.request({ ":method": "POST", ":path": `/3/device/${input.token}`, authorization: `bearer ${jwt}`, "apns-topic": env.APNS_BUNDLE_ID + (input.live ? ".push-type.liveactivity" : ""), "apns-push-type": input.live ? "liveactivity" : "alert", "apns-priority": "10" });
  let status = 0; req.on("response", headers => { status = Number(headers[":status"]); }); req.on("data", () => {}); req.on("error", finish); req.on("end", () => finish(status === 200 ? undefined : new Error(`APNS_${status}`)));
  req.end(JSON.stringify({ aps, songId: input.songId }));
 });
}
