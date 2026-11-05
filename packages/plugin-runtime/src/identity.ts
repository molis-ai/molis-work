import { createHash } from "node:crypto";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";

/** Canonical identity of the Manifest stored with a Runtime installation. */
export function pluginManifestDigest(manifest: PluginManifest): string {
  return createHash("sha256").update(canonicalJsonText(manifest, "null")).digest("hex");
}
