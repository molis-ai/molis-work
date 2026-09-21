import { createHash } from "node:crypto";
import type { ShelfItemRecord, ShelfTextMaterial } from "@molis-ai/molis-work-contracts/modules/shelf";
import { isEditableShelfItem } from "@molis-ai/molis-work-module-shelf";
import { agentTextMaterialContent } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Read full current bytes, never the shortened preview or original import hash. */
export function shelfTextMaterial(file: { item: ShelfItemRecord; bytes: Buffer }) {
  const { item, bytes } = file;
  if (item.hidden || item.status !== "done" || !item.relative_path) throw new Error("这份 Shelf 材料已移除或没有可读取的正文");
  if (!isEditableShelfItem(item)) throw new Error("请先在 Shelf 提取为文字，再保存到项目材料");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error("这份材料不是 UTF-8 文字，请先转换为文字"); }
  if (text.includes("\0")) throw new Error("这份材料包含二进制内容，请先提取为文字");
  const payload: ShelfTextMaterial = { title: item.name, text,
    content_hash: createHash("sha256").update(bytes).digest("hex"),
    source: { item_id: item.item_id, kind: item.kind, group: item.group, source_item_ids: [...item.source_item_ids], job_id: item.job_id } };
  // Use the same bound as Coding; do not silently truncate the confirmed body.
  agentTextMaterialContent({ material_id: item.item_id, title: item.name, text, source_artifact_id: item.item_id, source_version: 1 });
  const fingerprint = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { payload, fingerprint };
}
