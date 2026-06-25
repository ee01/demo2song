export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<{ key: string }>;
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
  getPublicOrSignedUrl(key: string, ttlSeconds: number): Promise<string>;
}
