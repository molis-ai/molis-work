/** Image generation is personal configuration with project-scoped local jobs. */
export const IMAGES_PLUGIN_ID = "io.molis.work.images";
export const IMAGES_PROJECT_PLUGIN_ID = "images";
export type ImageApiFormat = "openai-images" | "gemini";
export interface ImageConnection {
  id: string;
  name: string;
  api_format: ImageApiFormat;
  base_url: string;
  model: string;
  has_key: boolean;
  available?: boolean;
  unavailable_reason?: string;
  auth_connection_id?: string;
  created_at: string;
  updated_at: string;
}
export interface ImageConnectionInput {
  id?: string;
  name: string;
  api_format: ImageApiFormat;
  base_url: string;
  model: string;
  /** Write-only. Omission or empty keeps the existing credential. */
  api_key?: string;
  auth_connection_id?: string;
}
export interface ImageGenerateInput {
  request_id: string;
  connection_id: string;
  prompt: string;
  /** OpenAI/compatible only. Empty omits it and uses the provider default. */
  size?: string;
  /** Gemini only. Empty omits it. */
  aspect_ratio?: string;
}
export type ImageJobStatus = "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
export interface GeneratedImage {
  id: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  byte_length: number;
  /** Server-owned filename, never a provider URL. */
  filename: string;
}
export interface ImageJob {
  id: string;
  project_id: string;
  request_id: string;
  connection_id: string;
  connection_name: string;
  api_format: ImageApiFormat;
  model: string;
  prompt: string;
  size: string;
  aspect_ratio: string;
  status: ImageJobStatus;
  images: GeneratedImage[];
  error: string;
  created_at: string;
  finished_at: string | null;
}
