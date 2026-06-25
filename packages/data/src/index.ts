export * from "./types.js";
export * from "./memory.js";
export * from "./cloudbase.js";

import fs from "node:fs";
import path from "node:path";
import { CloudBaseRepository } from "./cloudbase.js";
import { config as loadDotenv } from "dotenv";
import { InMemoryRepository } from "./memory.js";
import type { Demo2SongRepository } from "./types.js";

let repository: Demo2SongRepository | undefined;
let dotenvLoaded = false;

function loadNearestDotenv(): void {
  if (dotenvLoaded || process.env.CLOUDBASE_ENV_ID) {
    dotenvLoaded = true;
    return;
  }

  let directory = process.env.INIT_CWD ?? process.cwd();
  for (;;) {
    const candidate = path.join(directory, ".env");
    if (fs.existsSync(candidate)) {
      loadDotenv({ path: candidate });
      dotenvLoaded = true;
      return;
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      dotenvLoaded = true;
      return;
    }
    directory = parent;
  }
}

export function createRepositoryFromEnv(env = process.env): Demo2SongRepository {
  loadNearestDotenv();

  if (env.DATA_BACKEND === "memory" || env.NODE_ENV === "test") {
    return new InMemoryRepository();
  }

  if (!env.CLOUDBASE_ENV_ID) {
    throw new Error("CLOUDBASE_ENV_ID is required for CloudBase database access");
  }

  return new CloudBaseRepository(env.CLOUDBASE_ENV_ID, {
    secretId: env.CLOUDBASE_SECRET_ID,
    secretKey: env.CLOUDBASE_SECRET_KEY
  });
}

export function getRepository(): Demo2SongRepository {
  repository ??= createRepositoryFromEnv();
  return repository;
}

export function setRepositoryForTest(next: Demo2SongRepository | undefined): void {
  repository = next;
}
