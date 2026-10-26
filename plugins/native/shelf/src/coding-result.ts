import { createHash } from "node:crypto";
import type { FixedVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { CodingResultDocument } from "@molis-ai/molis-work-contracts/modules/coding";
import type { ShelfArtifactPreview } from "@molis-ai/molis-work-module-shelf/contract";
import { shelfErrors } from "@molis-ai/molis-work-module-shelf";

/** The answer must be the document's four fields; anything else is Coding's fault, not text to put on the shelf. */
export function checkedDocument(value: unknown): CodingResultDocument {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const ref = row.reference && typeof row.reference === "object" ? row.reference as Record<string, unknown> : {};
  if (typeof ref.artifact_id !== "string" || !ref.artifact_id || !Number.isSafeInteger(ref.version) || (ref.version as number) < 1
    || typeof row.title !== "string" || typeof row.saved_at !== "string" || typeof row.markdown !== "string") throw shelfErrors.invalid("Coding 返回的成果正文格式无效");
  return { reference: { artifact_id: ref.artifact_id, version: ref.version as number }, title: row.title, saved_at: row.saved_at, markdown: row.markdown };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * The copy Shelf would take: its own heading and disclaimer over the document's body, where it came from, and a fingerprint of all of
 * it, so receiving can tell the version the person looked at from one that changed since.
 */
export function shelfCopyOf(record: Pick<FixedVersionRecord, "producer_plugin_id" | "payload">, document: CodingResultDocument,
  project: { project_id: string; project_path: string }): ShelfArtifactPreview {
  const source = { project_id: project.project_id, project_path: project.project_path, reference: document.reference,
    producer_plugin_id: record.producer_plugin_id, content_hash: sha256(JSON.stringify(record.payload)) };
  const heading = `# ${document.title}\n\n这是 Coding 固定成果的 Shelf 副本，不代表当前工作区状态或目标验收。编辑副本不改变原成果。\n来源：${source.reference.artifact_id} v${source.reference.version}\n保存时间：${document.saved_at}\n\n`;
  const text = heading + document.markdown;
  return { title: document.title, text, source, fingerprint: sha256(JSON.stringify({ title: document.title, text, source })) };
}
