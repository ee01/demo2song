import type { ProviderSongResult } from "@demo2song/shared";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export async function providerResultToBuffer(result: ProviderSongResult): Promise<Buffer> {
  if (result.audioHex) {
    return Buffer.from(result.audioHex, "hex");
  }
  if (result.audioBase64) {
    return Buffer.from(result.audioBase64, "base64");
  }
  if (result.audioUrl) {
    const response = await fetch(result.audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to download provider audio: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error("Provider result did not include audio");
}

export async function normalizeReferenceAudioToMp3(input: Buffer): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(tmpdir(), "demo2song-audio-"));
  const id = createHash("sha1").update(input).digest("hex").slice(0, 12);
  const inputPath = path.join(workDir, `${id}.input`);
  const outputPath = path.join(workDir, `${id}.mp3`);

  try {
    await writeFile(inputPath, input);
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ar",
      "44100",
      "-ac",
      "1",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "192k",
      outputPath
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg failed with exit code ${code}: ${stderr.slice(-1000)}`));
    });
  });
}

// ID3v2.3 TXXX user-defined text frame: description=AIGC, value=true.
export function markAIGC(audio: Buffer): Buffer {
  const payload = Buffer.concat([Buffer.from([0]), Buffer.from("AIGC\0true", "latin1")]);
  const frame = Buffer.alloc(10); frame.write("TXXX"); frame.writeUInt32BE(payload.length, 4);
  const size = frame.length + payload.length; const header = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (size >> 21) & 127, (size >> 14) & 127, (size >> 7) & 127, size & 127]);
  // Replace an existing ID3v2 prefix instead of stacking tags.
  const oldSize = audio.subarray(0, 3).toString() === "ID3" && audio.length >= 10 ? 10 + ((audio[6] & 127) << 21 | (audio[7] & 127) << 14 | (audio[8] & 127) << 7 | audio[9] & 127) : 0;
  return Buffer.concat([header, frame, payload, audio.subarray(oldSize)]);
}
