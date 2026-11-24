import { createHash } from "node:crypto";
import type { ArtifactReference, FixedVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { FileContent } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ShelfArtifactPreview } from "../contract.js";
import { shelfErrors } from "../index.js";

/** What Shelf reads from an artifact producer: the fixed version, its title, when it was saved, and the body as Markdown. */
export interface ResultDocument { reference: ArtifactReference; title: string; saved_at: string; markdown: string }

/** Convert a standard artifact preview (`FileContent`) into a copyable Markdown document. */
export function documentFromPreview(record: Pick<FixedVersionRecord, "artifact_id" | "version" | "created_at" | "metadata">, preview: FileContent): ResultDocument {
  const markdown = preview.encoding === "utf8" ? preview.data : Buffer.from(preview.data, "base64").toString("utf8");
  const title = preview.title || (typeof record.metadata.title === "string" ? record.metadata.title : record.artifact_id);
  return { reference: { artifact_id: record.artifact_id, version: record.version }, title, saved_at: record.created_at, markdown };
}

/** The answer must be the document's four fields; anything else is the producer's fault, not text to put on the shelf. */
export function checkedDocument(value: unknown): ResultDocument {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const ref = row.reference && typeof row.reference === "object" ? row.reference as Record<string, unknown> : {};
  if (typeof ref.artifact_id !== "string" || !ref.artifact_id || !Number.isSafeInteger(ref.version) || (ref.version as number) < 1
    || typeof row.title !== "string" || typeof row.saved_at !== "string" || typeof row.markdown !== "string") throw shelfErrors.invalid("成果提供方返回的正文格式无效");
  return { reference: { artifact_id: ref.artifact_id, version: ref.version as number }, title: row.title, saved_at: row.saved_at, markdown: row.markdown };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * The copy Shelf would take: its own heading and disclaimer over the document's body, where it came from, and a fingerprint of all of
 * it, so receiving can tell the version the person looked at from one that changed since.
 */
export function shelfCopyOf(record: Pick<FixedVersionRecord, "producer_plugin_id" | "payload">, document: ResultDocument,
  project: { project_id: string; project_path: string }): ShelfArtifactPreview {
  const source = { project_id: project.project_id, project_path: project.project_path, reference: document.reference,
    producer_plugin_id: record.producer_plugin_id, content_hash: sha256(JSON.stringify(record.payload)) };
  const heading = `# ${document.title}\n\n这是固定成果的 Shelf 副本，不代表当前工作区状态或目标验收。编辑副本不改变原成果。\n来源：${source.reference.artifact_id} v${source.reference.version}\n保存时间：${document.saved_at}\n\n`;
  const text = heading + document.markdown;
  return { title: document.title, text, source, fingerprint: sha256(JSON.stringify({ title: document.title, text, source })) };
}
