import { SKIP_REASON, UPLOAD_LIMITS } from "./wire.js";

/** One file of an uploaded folder, as the preview route takes it: its data, or the reason it is left out. */
export interface UploadedFile { path: string; data?: string; reason?: string }

const TEXT = /\.(md|markdown|txt)$/i;
const ATTACHMENT = /\.(png|jpe?g|gif|webp|avif|svg|pdf|mp3|wav|mp4|webm)$/i;
const CACHE_DIRECTORIES = ["node_modules", "__pycache__", "cache"];

function skipReason(path: string, size: number, total: number): string {
  const text = TEXT.test(path);
  if (path.split("/").some((part) => part.startsWith(".") || CACHE_DIRECTORIES.includes(part))) return SKIP_REASON.hidden;
  if (!text && !ATTACHMENT.test(path)) return SKIP_REASON.unsupported;
  if (size > (text ? UPLOAD_LIMITS.textBytes : UPLOAD_LIMITS.attachmentBytes) || total + size > UPLOAD_LIMITS.batchBytes) return SKIP_REASON.tooLarge;
  return "";
}

async function encode(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}

/** Reads a chosen folder for the preview: files beyond the limits are left out with a reason, never cut. `tooMany` is the words for a folder with more files than a batch takes. */
export async function uploadFiles(files: readonly File[], tooMany: string): Promise<UploadedFile[]> {
  if (files.length > UPLOAD_LIMITS.files) throw new Error(tooMany);
  let total = 0;
  const result: UploadedFile[] = [];
  for (const file of files) {
    const path = file.webkitRelativePath.split("/").slice(1).join("/") || file.name;
    const reason = skipReason(path, file.size, total);
    if (reason) { result.push({ path, reason }); continue; }
    total += file.size;
    try { result.push({ path, data: await encode(file) }); } catch { result.push({ path, reason: SKIP_REASON.unreadable }); }
  }
  return result;
}
