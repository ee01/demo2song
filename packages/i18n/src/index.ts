import errorMessages from "../errors.json";
import { flatCopy, zhHans } from "./generated/copy.js";

export { flatCopy, zhHans };

const errors: Record<string, string> = errorMessages;

export function copyText(key: string): string {
  const value = flatCopy[key];
  if (!value) {
    throw new Error(`Missing copy: ${key}`);
  }
  return value;
}

export function errorText(code: string): string {
  const value = errors[code];
  if (!value) {
    throw new Error(`Missing error copy: ${code}`);
  }
  return value;
}

export const errorCodes = Object.keys(errors);
