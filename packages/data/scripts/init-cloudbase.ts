import path from "node:path";
import { config } from "dotenv";
import cloudbase from "@cloudbase/node-sdk";

const collections = ["users", "recordings", "songs", "song_jobs", "usage_quotas", "provider_events"] as const;

config({ path: path.resolve(process.env.INIT_CWD ?? process.cwd(), ".env") });

const envId = process.env.CLOUDBASE_ENV_ID;

if (!envId) {
  throw new Error("CLOUDBASE_ENV_ID is required");
}

const app = cloudbase.init({
  env: envId,
  secretId: process.env.CLOUDBASE_SECRET_ID || undefined,
  secretKey: process.env.CLOUDBASE_SECRET_KEY || undefined
});

const db = app.database();

function isCollectionMissing(error: unknown) {
  const next = error as { code?: string; message?: string };
  return next.code === "DATABASE_COLLECTION_NOT_EXIST" || next.message?.includes("Db or Table not exist");
}

async function collectionExists(name: string) {
  try {
    await db.collection(name).limit(1).get();
    return true;
  } catch (error) {
    if (isCollectionMissing(error)) {
      return false;
    }
    throw error;
  }
}

for (const name of collections) {
  if (await collectionExists(name)) {
    console.log(`exists ${name}`);
    continue;
  }
  await db.createCollection(name);
  console.log(`created ${name}`);
}

console.log(`CloudBase init complete: ${envId}`);
