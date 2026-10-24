import { createHash } from "node:crypto";
import type { ShelfItemRecord, ShelfMaterialPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { PluginOwnerFilesReader } from "@molis-ai/molis-work-contracts/platform/plugin";
import { readShelfCopy, shelfErrors } from "./errors.js";

/** The platform's answers for an original with nothing to compare: never registered, or no longer there. */
const ORIGINAL_GONE = new Set(["material.original.not_registered", "material.original.missing"]);

/** A file hashes its bytes; a folder hashes every path and file under it. */
export function contentHash(files: PluginOwnerFilesReader, item: Pick<ShelfItemRecord, "kind" | "relative_path">, relative = item.relative_path): string {
  if (item.kind !== "folder") return sha256(readShelfCopy(files, relative));
  const digest = createHash("sha256");
  const walk = (directory: string, prefix: string): void => {
    for (const entry of files.list(directory)) {
      const full = `${directory}/${entry.name}`;
      const nested = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") walk(full, nested);
      else digest.update(`${nested}:${sha256(readShelfCopy(files, full))}\n`);
    }
  };
  walk(relative, "");
  return digest.digest("hex");
}

/**
 * The original the person handed in is the platform's to read, under the item's id: a copy that has none registered, or whose
 * file is gone, has nothing to compare. Any other refusal stops the job, as a changed file does.
 */
export async function assertOriginsUntouched(
  materials: ShelfMaterialPorts,
  items: readonly Pick<ShelfItemRecord, "kind" | "group" | "item_id" | "origin_hash">[],
  signal?: AbortSignal,
): Promise<void> {
  const read = materials.readOriginal;
  if (!read) return;
  for (const item of items) {
    if (item.kind === "folder" || item.group !== "material") continue;
    const original = await read(item.item_id, { signal }).catch((error: unknown) => {
      if (ORIGINAL_GONE.has((error as { code?: unknown } | null)?.code as string)) return null;
      throw error;
    });
    if (original && sha256(Buffer.from(original.bytes)) !== item.origin_hash) throw shelfErrors.origin_changed("原件 Hash 已变化，已停止这次任务");
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
