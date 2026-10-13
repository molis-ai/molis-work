import type { ArtifactOrigin, ArtifactReference, ArtifactVersionRecord, RegisterArtifactVersionInput } from "@molis-ai/molis-work-contracts/modules/artifacts";

import { normalizeArtifactMetadata } from "./content.js";
import type { ArtifactsErrorFactory } from "./errors.js";

/** Input checks shared by both stores, and the fields only the 成果库 records (artifact-positioning A1). */
export function normalizedMetadata(value: unknown, error: ArtifactsErrorFactory): ArtifactVersionRecord["metadata"] {
  try {
    return normalizeArtifactMetadata(value);
  } catch (cause) {
    throw error("artifact.metadata_invalid", "成果 metadata 必须是可往返的 JSON 对象", {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

export function requiredText(
  value: unknown,
  path: string,
  error: ArtifactsErrorFactory,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw error("artifact.input_invalid", `${path} 不能为空`, { path });
  return normalized;
}

export function libraryFields(value: unknown, error: ArtifactsErrorFactory): Pick<ArtifactVersionRecord, "origin" | "title" | "media_type" | "trace"> {
  const input = value as Partial<RegisterArtifactVersionInput>;
  return { origin: originOf(input.origin, error), title: boundedText(input.title, "title", 200, error),
    media_type: mediaType(input.media_type, error), trace: traceOf(input.trace, error) };
}

export function originOf(value: unknown, error: ArtifactsErrorFactory): ArtifactOrigin {
  const origin = value as Partial<ArtifactOrigin> | null | undefined;
  if (origin?.kind === "pinned") {
    const subject = (origin as { subject?: { kind?: unknown; id?: unknown } }).subject;
    return { kind: "pinned", subject: { kind: requiredText(subject?.kind, "origin.subject.kind", error),
      id: requiredText(subject?.id, "origin.subject.id", error) },
      revision: boundedText((origin as { revision?: unknown }).revision, "origin.revision", 200, error) };
  }
  if (origin?.kind === "imported") {
    return { kind: "imported", file_name: boundedText((origin as { file_name?: unknown }).file_name, "origin.file_name", 255, error) };
  }
  throw error("artifact.origin_invalid", "成果必须写明来源：固定下来的工作对象，或导入的文件");
}

export function traceOf(value: unknown, error: ArtifactsErrorFactory): ArtifactReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw error("artifact.input_invalid", "trace 必须是过程项引用的列表", { path: "trace" });
  return value.map((item: { artifact_id?: unknown; version?: unknown } | null, index) => ({
    artifact_id: requiredText(item?.artifact_id, `trace[${index}].artifact_id`, error),
    version: positiveInteger(item?.version, `trace[${index}].version`, error),
  }));
}

export function boundedText(value: unknown, path: string, limit: number, error: ArtifactsErrorFactory): string {
  const text = requiredText(value, path, error);
  if (text.length > limit) throw error("artifact.input_invalid", `${path} 不能超过 ${limit} 个字符`, { path });
  return text;
}

/** A real media type such as `text/markdown`; parameters are not part of what a 成果 records. */
export function mediaType(value: unknown, error: ArtifactsErrorFactory): string {
  const text = requiredText(value, "media_type", error).toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(text)) {
    throw error("artifact.input_invalid", "media_type 必须是 类型/子类型，例如 text/markdown", { path: "media_type" });
  }
  return text;
}

export function positiveInteger(value: unknown, path: string, error: ArtifactsErrorFactory): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw error("artifact.input_invalid", `${path} 必须是正整数`, { path });
  }
  return Number(value);
}

export function nonNegativeInteger(value: unknown, path: string, error: ArtifactsErrorFactory): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw error("artifact.input_invalid", `${path} 必须是非负整数`, { path });
  }
  return Number(value);
}

export function normalizedDigest(value: unknown, path: string, error: ArtifactsErrorFactory): string {
  const digest = requiredText(value, path, error).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw error("artifact.digest_invalid", `${path} 必须是 sha256 digest`, { path });
  }
  return digest;
}
