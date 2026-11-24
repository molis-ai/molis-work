import type { OwnedTextRef, TextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { tryOwnedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";

export {
  assertPluginLocales, inspectPluginLocales, refuseLocaleProblems, pluginLocaleFilePath, pluginLocaleFilePaths,
  pluginLocaleReader, type PluginLocaleManifest, type PluginLocaleRead, type PluginLocaleReader,
} from "@molis-ai/molis-work-plugin-sdk/ui";

export type ManifestTextResolver = (reference: Extract<OwnedTextRef, { key: string }>, original: string) => string;

/** Resolve a Manifest's optional localized `TextRef` (`reason_text`, `title_text`, `description_text`) in the active language, falling back to `original`. */
export function resolveManifestText(owner: string, original: string, ref: TextRef | undefined, resolve?: ManifestTextResolver): string {
  if (ref === undefined) return original;
  const bound = tryOwnedTextRef(ref, owner);
  if (bound === null) return original;
  return "literal" in bound ? bound.literal : resolve?.(bound, original) ?? original;
}
