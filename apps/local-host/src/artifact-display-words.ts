import type { ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { CHARACTER_ARTIFACT_PRODUCER } from "@molis-ai/molis-work-contracts/modules/characters";
import { ARTIFACT_PRODUCER, ARTIFACTS_HOST_PRODUCER } from "@molis-ai/molis-work-module-artifacts";
import { t, tryOwnedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";
import { projectDirectoryWords } from "@molis-ai/molis-work-ui-host";
import type { LocalProjectDatabase } from "./project-database.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { directoryWordResolver } from "./ui-text-provider.js";
import { runningPluginTextIn, type RunningPluginText } from "./running-plugin-text.js";

type Identity = Pick<ArtifactVersionRecord, "producer_plugin_id" | "producer_binding_signature" | "artifact_type_id" | "schema_version">;
type Source = RunningPluginText;
type Words = { readonly title?: string; readonly pluginTitle?: string };
export type ReadArtifactDisplay = (versions: readonly Identity[]) => Promise<(version: Identity) => Words | undefined>;

const producerKey = (version: Identity) => JSON.stringify([version.producer_plugin_id, version.producer_binding_signature]);
const typeKey = (version: Identity) => JSON.stringify([producerKey(version), version.artifact_type_id, version.schema_version]);

function hostWords(version: Identity): Words | undefined {
  const host = [ARTIFACTS_HOST_PRODUCER, CHARACTER_ARTIFACT_PRODUCER].find(entry => entry.plugin_id === version.producer_plugin_id);
  const binding = host?.plugin_id === ARTIFACT_PRODUCER.plugin_id ? ARTIFACT_PRODUCER.binding_signature : CHARACTER_ARTIFACT_PRODUCER.binding_signature;
  if (!host || version.producer_binding_signature !== binding || !host.produces.some(type =>
    type.artifact_type_id === version.artifact_type_id && type.schema_version === version.schema_version)) return undefined;
  return { title: host.plugin_id === ARTIFACT_PRODUCER.plugin_id ? t.text("workbench.browser-ui.imported-file-type") : t.text("workbench.browser-ui.character-type"),
    pluginTitle: host.name };
}

function pluginWords(source: Source | null, version: Identity): Words | undefined {
  if (!source) return undefined;
  const { manifest, reader } = source;
  const type = manifest.artifacts.produces.find(row => row.artifact_type_id === version.artifact_type_id && row.schema_version === version.schema_version);
  if (!type?.title) return undefined;
  const ref = tryOwnedTextRef(type.title_text, manifest.plugin_id);
  const resolve = reader ? directoryWordResolver(reader) : undefined;
  return { title: ref && "key" in ref ? resolve?.(ref, type.title) ?? type.title : type.title,
    pluginTitle: projectDirectoryWords({ ...manifest, ui: {} }, resolve).name };
}

/** A request's type words are independent of the global type map used for actions. */
export function readArtifactDisplayFor({ store, localHost, hostReference }: {
  store: LocalProjectDatabase; localHost: MolisWorkLocalHost; hostReference: { project_id: string };
}): ReadArtifactDisplay {
  const projectId = hostReference.project_id;
  return async versions => {
    if (!versions.length) return () => undefined;
    const running = runningPluginTextIn({ store, localHost, projectId });
    const sourceFor = async (version: Identity): Promise<Source | null> => {
      const source = await running({ plugin_id: version.producer_plugin_id, signature: version.producer_binding_signature });
      if (source) return source;
      // A shipped declaration's original label remains public if its word source is no longer running.
      const manifest = PLATFORM_PLUGIN_REGISTRATIONS.find(row => row.manifest.plugin_id === version.producer_plugin_id
        && row.manifest.publisher.signature === version.producer_binding_signature)?.manifest;
      return manifest ? { manifest, reader: null } : null;
    };
    const sources = new Map<string, Promise<Source | null>>(), words = new Map<string, Words | undefined>();
    for (const version of versions) {
      const key = typeKey(version);
      if (words.has(key)) continue;
      const own = hostWords(version);
      if (own) { words.set(key, own); continue; }
      const producer = producerKey(version);
      let source = sources.get(producer);
      if (!source) { source = sourceFor(version); sources.set(producer, source); }
      words.set(key, pluginWords(await source, version));
    }
    return version => words.get(typeKey(version));
  };
}
