import COS from "cos-nodejs-sdk-v5";
import { env } from "../env.js";
import type { ObjectStorage, PutObjectInput } from "./object-storage.js";

export class CosObjectStorage implements ObjectStorage {
  private readonly cos: COS;

  constructor() {
    if (!env.COS_SECRET_ID || !env.COS_SECRET_KEY || !env.COS_BUCKET) {
      throw new Error("COS_SECRET_ID, COS_SECRET_KEY and COS_BUCKET are required");
    }
    this.cos = new COS({
      SecretId: env.COS_SECRET_ID,
      SecretKey: env.COS_SECRET_KEY
    });
  }

  async getUploadUrl(key: string, contentType: string, byteSize: number): Promise<string> {
    return new Promise((resolve, reject) => this.cos.getObjectUrl({ Bucket: env.COS_BUCKET!, Region: env.COS_REGION, Key: key, Method: "PUT", Sign: true, Expires: 600, Headers: { "content-type": contentType, "content-length": String(byteSize) } }, (error, data) => error ? reject(error) : resolve(data.Url)));
  }
  async headObject(key: string): Promise<{ byteSize: number; contentType: string }> {
    return new Promise((resolve, reject) => this.cos.headObject({ Bucket: env.COS_BUCKET!, Region: env.COS_REGION, Key: key }, (error, data) => error ? reject(error) : resolve({ byteSize: Number(data.headers?.["content-length"]), contentType: String(data.headers?.["content-type"]) })));
  }
  async putObject(input: PutObjectInput): Promise<{ key: string }> {
    await new Promise<void>((resolve, reject) => {
      this.cos.putObject(
        {
          Bucket: env.COS_BUCKET!,
          Region: env.COS_REGION,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType
        },
        (error) => (error ? reject(error) : resolve())
      );
    });

    return { key: input.key };
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    return new Promise((resolve, reject) => {
      this.cos.getObjectUrl(
        {
          Bucket: env.COS_BUCKET!,
          Region: env.COS_REGION,
          Key: key,
          Sign: true,
          Expires: ttlSeconds
        },
        (error, data) => (error ? reject(error) : resolve(data.Url))
      );
    });
  }

  async getPublicOrSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    if (env.COS_CDN_BASE_URL) {
      return `${env.COS_CDN_BASE_URL.replace(/\/$/, "")}/${key}`;
    }
    return this.getSignedUrl(key, ttlSeconds);
  }
}
