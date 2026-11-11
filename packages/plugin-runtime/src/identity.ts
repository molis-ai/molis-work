import { createHash } from "node:crypto";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";

/** Canonical identity of the Manifest stored with a Runtime installation. */
export function pluginManifestDigest(manifest: PluginManifest): string {
  return createHash("sha256").update(canonicalJson(manifest)).digest("hex");
}

/** Shared by Manifest identity and the Runtime's sync declaration comparison. */
export function canonicalJson(value: unknown): string {
  return canonicalJsonText(value, "null");
}
