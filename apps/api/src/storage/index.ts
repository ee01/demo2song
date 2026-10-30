import { CosObjectStorage } from "./cos-storage.js";
import type { ObjectStorage } from "./object-storage.js";

let storage: ObjectStorage | undefined;

export function setObjectStorageForTest(next: ObjectStorage | undefined): void { storage = next; }

export function getObjectStorage(): ObjectStorage {
  storage ??= new CosObjectStorage();
  return storage;
}

export type { ObjectStorage } from "./object-storage.js";
