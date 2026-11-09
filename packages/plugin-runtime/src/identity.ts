import { createHash } from "node:crypto";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { isFrozenRegisteredManifest } from "./platform-definitions.js";

const manifestDigests = new WeakMap<PluginManifest, string>();

/** Canonical identity of the Manifest stored with a Runtime installation. */
export function pluginManifestDigest(manifest: PluginManifest): string {
  const frozen = isFrozenRegisteredManifest(manifest);
  const known = frozen ? manifestDigests.get(manifest) : undefined;
  if (known !== undefined) return known;
  const digest = createHash("sha256").update(canonicalJson(manifest)).digest("hex");
  if (frozen) manifestDigests.set(manifest, digest);
  return digest;
}

/** Shared by Manifest identity and the Runtime's sync declaration comparison. */
export function canonicalJson(value: unknown): string {
  return canonicalJsonText(value, "null");
}
