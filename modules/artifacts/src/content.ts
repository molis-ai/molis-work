import { createHash } from "node:crypto";

import type {
  ArtifactJsonValue,
  ArtifactMetadata,
} from "@molis-ai/molis-work-contracts/modules/artifacts";

function normalizedValue(value: unknown, path: string): ArtifactJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} 必须是有限数字`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizedValue(item, `${path}[${index}]`));
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} 必须是普通 JSON 对象`);
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizedValue(item, `${path}.${key}`)]),
    );
  }
  throw new TypeError(`${path} 不是可保存的 JSON 值`);
}

export function normalizeArtifactPayload(value: unknown): ArtifactJsonValue {
  return normalizedValue(value, "payload");
}

export function normalizeArtifactMetadata(value: unknown): ArtifactMetadata {
  const normalized = normalizedValue(value ?? {}, "metadata");
  if (!normalized || Array.isArray(normalized) || typeof normalized !== "object") {
    throw new TypeError("metadata 必须是 JSON 对象");
  }
  return normalized;
}

export function canonicalArtifactJson(value: ArtifactJsonValue): string {
  return JSON.stringify(normalizedValue(value, "payload"));
}

export function artifactContentDigest(serializedContent: string): string {
  return `sha256:${createHash("sha256").update(serializedContent).digest("hex")}`;
}

export function artifactContentSize(serializedContent: string): number {
  return Buffer.byteLength(serializedContent, "utf8");
}
