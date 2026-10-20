import { createHash } from "node:crypto";
import type { ActionDefinition, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference, FixedVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ShelfArtifactPreview } from "@molis-ai/molis-work-contracts/modules/shelf";
import { shelfErrors } from "@molis-ai/molis-work-module-shelf";

/** What Coding answers when asked for one of its fixed results as text (its own `coding.results.document`, the plugin audience only). */
export interface CodingResultDocument { reference: ArtifactReference; title: string; saved_at: string; markdown: string }

const reference: ActionSchema = { type: "object", properties: { artifact_id: { type: "string", minLength: 1, maxLength: 200 }, version: { type: "integer", minimum: 1 } },
  required: ["artifact_id", "version"], additionalProperties: false };

/**
 * The action Shelf consumes, as Coding declares it; tests/shelf-coding-results.test.ts holds the two to the same shape. Shelf names it
 * in its Manifest `capabilities.consumes`, and the platform calls it as this plugin with this plugin's own grants.
 */
export const codingResultDocument: ActionDefinition<{ reference: ArtifactReference }, CodingResultDocument> = {
  capability_id: "coding.results.document", version: 1, operation: "query",
  action: {
    title: "读取 Coding 固定成果的正文", description: "把本项目一份固定的 Coding 执行报告或固定变更转成可复制的 Markdown 正文；已归档、不属于本项目或不是 Coding 固定成果的拒绝；只读",
    kind: "query", scope: "project", audiences: ["plugin"], permissions: ["artifact:read"], subject_kinds: [],
    input_schema: { type: "object", properties: { reference }, required: ["reference"], additionalProperties: false },
    output_schema: { type: "object", properties: { reference, title: { type: "string" }, saved_at: { type: "string" }, markdown: { type: "string" } },
      required: ["reference", "title", "saved_at", "markdown"], additionalProperties: false },
  },
};

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
