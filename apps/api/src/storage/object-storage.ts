export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface ObjectStorage {
  getUploadUrl(key: string, contentType: string, byteSize: number): Promise<string>;
  headObject(key: string): Promise<{ byteSize: number; contentType: string }>;
  putObject(input: PutObjectInput): Promise<{ key: string }>;
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
  getPublicOrSignedUrl(key: string, ttlSeconds: number): Promise<string>;
}
