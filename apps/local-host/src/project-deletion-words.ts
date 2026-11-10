import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { projectDirectoryWords, type PluginTextReader } from "@molis-ai/molis-work-app-workbench";
import { say, t, tryOwnedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";
import { directoryWordResolver } from "./ui-text-provider.js";
import type { ProjectDeletedOwner } from "./project-deleted-hooks.js";

type Label = string | TextRef;

/** Platform words and original author text need no plugin reader. A plugin label uses its exact registration below. */
export function ownerLabel(owner: Pick<ProjectDeletedOwner, "label" | "readLabel">): string {
  if (owner.readLabel) return owner.readLabel();
  if (typeof owner.label === "string" || owner.label === null) return owner.label ?? "";
  const ref = tryOwnedTextRef(owner.label, "workbench");
  return ref ? say.text(ref) : "";
}

function pluginLabel(label: Label, manifest: PluginManifest, reader: PluginTextReader | null): string {
  if (typeof label === "string") return label;
  const ref = tryOwnedTextRef(label, manifest.plugin_id);
  if (ref && "literal" in ref) return ref.literal;
  const fallback = t.text("workbench.project-deletion.data");
  return ref && "key" in ref ? directoryWordResolver(reader)(ref, fallback) : fallback;
}

/** Closing this deletion owner's registration releases the reader that came with it. */
export function projectDataLabel(label: Label, manifest: PluginManifest, reader: PluginTextReader | null) {
  return { label, readLabel: () => pluginLabel(label, manifest, reader) };
}

/** The wrapping sentence is the platform's; the name and detail each come from this exact declaration. */
export function namedProjectDataLabel(key: string, manifest: PluginManifest, reader: PluginTextReader | null, detail?: Label) {
  return {
    label: { key },
    readLabel: () => t.text(key, { name: projectDirectoryWords(manifest, directoryWordResolver(reader)).name,
      ...(detail === undefined ? {} : { detail: pluginLabel(detail, manifest, reader) }) }),
  };
}
