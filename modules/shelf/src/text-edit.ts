import { createHash } from "node:crypto";
import type { PluginOwnerFilesReader } from "@molis-ai/molis-work-contracts/platform/plugin";
import { readShelfCopy, shelfErrors } from "./errors.js";

/** Check the exact bytes originally read, before touching either saved copy. */
export function prepareShelfTextEdit(files: PluginOwnerFilesReader, file: string, text: string, expectedContentHash: string): Buffer {
  if (text.includes("\0")) throw shelfErrors.not_text("这份材料不能编辑");
  const bytes = Buffer.from(text, "utf8");
  if (bytes.byteLength > 512 * 1024) throw shelfErrors.too_large("文件超过 512 KB");
  if (!/^[a-f0-9]{64}$/u.test(expectedContentHash)
    || createHash("sha256").update(readShelfCopy(files, file)).digest("hex") !== expectedContentHash) {
    throw shelfErrors.conflict("副本已变化，请保留输入并重新读取后编辑");
  }
  return bytes;
}
