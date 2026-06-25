import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ConfigProviderName = "minimax" | "mureka";

export interface ProviderModelConfig {
  demoModel: string;
  fullModel: string;
  allowPaidModels: boolean;
}

export interface Demo2SongConfig {
  $schema?: string;
  defaultProvider: ConfigProviderName;
  models: Record<ConfigProviderName, ProviderModelConfig>;
  limits: {
    minRecordingSeconds: number;
    maxRecordingSeconds: number;
    demoTargetSeconds: number;
    fullSongMinSeconds: number;
    fullSongMaxSeconds: number;
    dailyDemoJobsPerUser: number;
    dailyExtendJobsPerUser: number;
    refundQuotaOnProviderFailure: boolean;
  };
  storage: {
    provider: "cos";
    recordingRetention: "permanent";
    songRetention: "permanent";
    signedUrlTtlSeconds: number;
  };
  features: {
    enableExtendSong: boolean;
    enableApproximateMinimaxExtend: boolean;
    enableCommercialUseGate: boolean;
  };
}

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const defaultConfigPath = resolve(packageDir, "config/demo2song.config.json");
export const defaultSchemaPath = resolve(packageDir, "config/config.schema.json");

export function loadConfig(configPath = defaultConfigPath): Demo2SongConfig {
  return JSON.parse(readFileSync(configPath, "utf8")) as Demo2SongConfig;
}

export function validateConfig(config: unknown, schemaPath = defaultSchemaPath): string[] {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true });
  const validate = ajv.compile(schema);
  if (validate(config)) {
    return [];
  }

  return (validate.errors ?? []).map((error) => {
    const path = error.instancePath || "/";
    return `${path} ${error.message ?? "is invalid"}`;
  });
}

export function loadValidatedConfig(configPath = defaultConfigPath): Demo2SongConfig {
  const config = loadConfig(configPath);
  const errors = validateConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid demo2song config:\n${errors.join("\n")}`);
  }
  if (config.limits.minRecordingSeconds > config.limits.maxRecordingSeconds) {
    throw new Error("minRecordingSeconds must be <= maxRecordingSeconds");
  }
  if (config.limits.fullSongMinSeconds > config.limits.fullSongMaxSeconds) {
    throw new Error("fullSongMinSeconds must be <= fullSongMaxSeconds");
  }
  return config;
}
