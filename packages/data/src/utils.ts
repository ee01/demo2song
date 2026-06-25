import { randomUUID } from "node:crypto";

export function createId(): string {
  return randomUUID().replace(/-/g, "");
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
