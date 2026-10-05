import { createHash } from "node:crypto";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Canonical identity of the Manifest stored with a Runtime installation. */
export function pluginManifestDigest(manifest: PluginManifest): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
