import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { copyText, errorCodes, errorText } from "./index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (entry.endsWith(".ts")) files.push(full);
  }
  return files;
}

function codesIn(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const found = new Set<string>();
  const pattern = /(?:error|code|errorCode):\s*"([A-Z][A-Z0-9_]*)"/g;
  for (const match of source.matchAll(pattern)) {
    const code = match[1];
    if (code) found.add(code);
  }
  return [...found];
}

describe("i18n", () => {
  it("covers every backend error code", () => {
    const roots = [path.join(repoRoot, "apps/api/src"), path.join(repoRoot, "apps/worker/src")];
    const used = new Set<string>();
    for (const root of roots) {
      for (const file of walk(root)) {
        for (const code of codesIn(file)) used.add(code);
      }
    }

    const missing = [...used].filter((code) => !errorCodes.includes(code)).sort();
    expect(missing).toEqual([]);
    expect(used.has("MISSING_USER")).toBe(true);
    expect(used.has("MINIMAX_ERROR")).toBe(true);
    expect(used.has("MUREKA_ERROR")).toBe(true);
    expect(errorText("DAILY_FULL_QUOTA_EXHAUSTED").length).toBeGreaterThan(0);
  });

  it("returns mini program copy and writes xcstrings keys", () => {
    expect(copyText("record.title")).toBe("哼一段，变成歌");
    const xcstrings = readFileSync(path.join(repoRoot, "packages/i18n/generated/Localizable.xcstrings"), "utf8");
    expect(xcstrings).toContain("record.title");
    expect(xcstrings).toContain("errors.MISSING_USER");
    expect(xcstrings).toContain("请先登录");
  });
});
