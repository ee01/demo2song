import COS from "cos-nodejs-sdk-v5";
import { env } from "./env.js";

export class WorkerCosStorage {
  private readonly cos: COS;

  constructor() {
    if (!env.COS_SECRET_ID || !env.COS_SECRET_KEY || !env.COS_BUCKET) {
      throw new Error("COS credentials are required for worker storage");
    }
    this.cos = new COS({
      SecretId: env.COS_SECRET_ID,
      SecretKey: env.COS_SECRET_KEY
    });
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

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.cos.putObject(
        {
          Bucket: env.COS_BUCKET!,
          Region: env.COS_REGION,
          Key: key,
          Body: body,
          ContentType: contentType
        },
        (error) => (error ? reject(error) : resolve())
      );
    });
  }

  async getObject(key: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.cos.getObject(
        {
          Bucket: env.COS_BUCKET!,
          Region: env.COS_REGION,
          Key: key
        },
        (error, data) => {
          if (error) {
            reject(error);
            return;
          }
          const body = data.Body;
          if (Buffer.isBuffer(body)) {
            resolve(body);
            return;
          }
          if (typeof body === "string") {
            resolve(Buffer.from(body));
            return;
          }
          reject(new Error(`COS object body is not a buffer: ${key}`));
        }
      );
    });
  }
}
