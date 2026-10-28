import { Buffer } from "node:buffer";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

export interface IssueImage { name: string; data_url: string }
export const ISSUE_IMAGE_LIMIT = 6;
export const ISSUE_IMAGE_BYTES = 2 * 1024 * 1024;
const ISSUE_IMAGES_BYTES = 8 * 1024 * 1024;

/** Images are owned by the issue, never external URLs or executable SVG/HTML. */
export function validateIssueImages(images: IssueImage[]): void {
  const invalid = (message: string): never => { throw new ActionError("actions.input_invalid", message); };
  if (!Array.isArray(images) || images.length > ISSUE_IMAGE_LIMIT) invalid("每条问题最多添加 6 张图片");
  let total = 0;
  for (const image of images) {
    if (!image || typeof image.name !== "string" || !image.name.trim() || [...image.name].length > 200
      || Object.keys(image).some(key => key !== "name" && key !== "data_url")
      || typeof image.data_url !== "string" || image.data_url.length > Math.ceil(ISSUE_IMAGE_BYTES / 3) * 4 + 32) invalid("图片名称或大小不正确，单张最多 2 MiB");
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(image.data_url);
    if (!match) invalid("只支持 PNG、JPEG 和 WebP 图片");
    const bytes = Buffer.from(match![2]!, "base64");
    const valid = match![1] === "png" ? bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      && bytes.toString("ascii", 12, 16) === "IHDR" && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
      : match![1] === "jpeg" ? bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        && bytes.at(-2) === 255 && bytes.at(-1) === 217
        : bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) === bytes.length - 8;
    if (!valid || bytes.toString("base64") !== match![2] || bytes.length > ISSUE_IMAGE_BYTES) invalid("图片内容或格式不正确");
    total += bytes.length;
  }
  if (total > ISSUE_IMAGES_BYTES) invalid("图片总大小不能超过 8 MiB");
}
