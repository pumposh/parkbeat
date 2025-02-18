
// Cloudflare R2 types
interface R2Bucket {
  put(key: string, value: ArrayBuffer | ReadableStream, options?: {
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
  }): Promise<R2Object>;
  get(key: string): Promise<R2Object | null>;
}

interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
  httpEtag: string;
  body: ReadableStream;
  writeHttpMetadata(headers: Headers): void;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

// Environment type
export type Env = Record<string, string> & {
  GOOGLE_AI_API_KEY: string;
  GOOGLE_MAPS_API_KEY: string;
  GCP_PROJECT_ID: string;
  GCP_CLIENT_EMAIL: string;
  GCP_PRIVATE_KEY: string;
  OPENAI_API_KEY: string;
  R2_BUCKET_NAME: string;
}
