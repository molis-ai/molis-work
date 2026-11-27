import { LOCAL_PERSON_ACTOR_ID, type ActionClient, type ActionDefinition, type ActionProviderRegistration, type ArtifactLinkSubjectsResult, type FileContent } from "@molis-ai/molis-work-contracts/platform/actions";
import { logLinkSubjectsFailure, logPreviewFailure } from "./host-log.js";
import { ARTIFACTS_PLUGIN_ID, ARTIFACTS_PROVIDER_ID, ARTIFACTS_PROVIDER_TITLE, ARTIFACT_ACTIONS, createArtifactActionHandlers, openArtifactProjectReference, type ArtifactActionPorts, type ArtifactLinkKinds } from "@molis-ai/molis-work-module-artifacts";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { artifactLinkKinds, artifactLinkSubjectActions, artifactProducerSources } from "./artifact-type-registry.js";
import { projectArtifactDeclaration } from "./declared-types.js";
import { readProjectReference } from "./project-file-reference.js";
import { hostErrors } from "./host-errors.js";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { resolveConfiguredHome } from "./product-home.js";
import { documentImportConnections, documentImportConnectionStatus, documentImportOffers, importLocalArtifactDocument } from "./artifact-document-import.js";
import { artifactPluginInputs, bindArtifactPluginInput } from "./artifact-plugin-inputs.js";
import { runningProjectPlatform } from "./project-plugins.js";
import type { MolisWorkProjectRuntime, MolisWorkLocalHostOptions } from "./project-host.js";

/**
 * 「被谁引用」's names (BL-646): the declaring plugin names its own linking objects, asked as the caller and pinned to that plugin as
 * provider; only the ids asked are kept. A plugin that cannot answer leaves its objects shown by id: a refusal (the caller may not read
 * them) is that answer, anything else is written to the Host log first.
 */
export function artifactLinkSubjectsPort(client: ActionClient | undefined, declarers: () => ReadonlyMap<string, Pick<ActionDefinition, "capability_id" | "version">> = artifactLinkSubjectActions): NonNullable<ArtifactActionPorts["linkSubjects"]> {
  return async (pluginId, ids, caller) => {
    const action = declarers().get(pluginId);
    if (!client || !action) return new Map();
    try {
      const answer = await client.invoke(caller, { capability_id: action.capability_id, version: action.version, provider_id: pluginId }, { ids: [...ids] }) as ArtifactLinkSubjectsResult;
      const asked = new Set(ids);
      return new Map(answer.objects.filter(item => asked.has(item.id)).map(item => [item.id, { title: item.title, open: item.open }]));
    } catch (error) { logLinkSubjectsFailure(error, pluginId); return new Map(); }
  };
}

function dynamicArtifactLinkKinds(projectId: string): ArtifactLinkKinds {
  const current = () => artifactLinkKinds(artifactProducerSources(projectId));
  return {
    get size() { return current().size; },
    get: key => current().get(key),
    has: key => current().has(key),
    entries: () => current().entries(),
    keys: () => current().keys(),
    values: () => current().values(),
    forEach: (callback, thisArg) => { current().forEach(callback, thisArg); },
    [Symbol.iterator]: () => current()[Symbol.iterator](),
  };
}

export function artifactActionProvider(runtime: MolisWorkProjectRuntime, options: Pick<MolisWorkLocalHostOptions, "homeDirectory" | "workspaceFor" | "prepareDirectory">, client?: ActionClient): ActionProviderRegistration {
  const home = options.homeDirectory ?? resolveConfiguredHome();
  const sources = () => artifactProducerSources(runtime.project_id);
  // The platform's own provider (PG-077): no plugin id, so no plugin's enablement gates it; the id is the one it was called by as a plugin.
  const provider: ActionProviderRegistration["provider"] = { provider_id: ARTIFACTS_PROVIDER_ID, title: ARTIFACTS_PROVIDER_TITLE, kind: "system", project_id: runtime.project_id };
  return {
    provider,
    definitions: ARTIFACT_ACTIONS,
    handlers: createArtifactActionHandlers({
      projectId: runtime.project_id, artifacts: runtime.artifacts,
      ledger: createContextLedger(runtime.store.db, { authorize: (access, operation) => operation === "read" && access.scope.kind === "personal" && access.scope.id === runtime.project_id }).query,
      linkKinds: dynamicArtifactLinkKinds(runtime.project_id),
      linkSubjects: artifactLinkSubjectsPort(client, () => artifactLinkSubjectActions(sources())),
      typeTitle: (_, record) => projectArtifactDeclaration(runtime.store.db, record)?.title ?? null,
      searchableFields: (_, record) => projectArtifactDeclaration(runtime.store.db, record)?.searchable_fields,
      // The owner's preview, with the caller's own authority; a version the caller may not read through it has no text here.
      previewText: async (artifact, caller) => {
        const declaration = projectArtifactDeclaration(runtime.store.db, artifact);
        const preview = declaration?.preview;
        if (!preview || !client) return null;
        try {
          const content = await client.invoke(caller, { ...preview, provider_id: declaration.provider_id }, { artifact }) as FileContent;
          return content.encoding === "utf8" ? content.data : null;
        } catch (error) { logPreviewFailure(error, artifact.artifact_type_id); return null; }
      },
      // Plugin input ports that take a version's type (artifact-positioning, 2026-10-04); only a project whose plugins run has them.
      pluginInputs: async artifact => artifactPluginInputs(await runningProjectPlatform(runtime.store, runtime.project_id), artifact),
      bindPluginInput: async (artifact, input, caller) => {
        const platform = await runningProjectPlatform(runtime.store, runtime.project_id);
        await caller.beforeEffect();
        return bindArtifactPluginInput(platform, artifact, input, caller.actor_id, runtime.project_id);
      },
      importSources: () => runWithMolisWorkHome(home, documentImportConnectionStatus),
      importOffered: () => runWithMolisWorkHome(home, documentImportOffers),
      importConnections: () => documentImportConnections(home),
      importDocument: (input, caller) => runWithMolisWorkHome(home, () => importLocalArtifactDocument({ ...input }, {
        projectId: runtime.project_id, actorId: caller.actor_id, ownerActorId: LOCAL_PERSON_ACTOR_ID, routePrefix: `/projects/${encodeURIComponent(runtime.project_id)}`,
        artifacts: runtime.artifacts, signal: caller.signal,
        // A file the Host was given for this import: only on the person's own call, and only one offered to the 成果库 itself.
        ...input.source === "file" && caller.audience === "user" && caller.original_file?.install_id === ARTIFACTS_PLUGIN_ID ? { offeredPath: caller.original_file.path } : {},
        beforeDispatch: () => caller.beforeEffect(),
        beforeSave: () => caller.beforeEffect(),
      })),
      openProjectReference: async input => {
        const workspace = await options.workspaceFor?.(runtime.project_id);
        // A default output directory not made yet holds no file to open; nothing makes it (§3 「碰磁盘的调用方」).
        if (workspace && options.prepareDirectory && !(await options.prepareDirectory(runtime.project_id, workspace.workspace_id, "read")).exists) {
          throw hostErrors.project_reference_not_found("项目内引用文件不存在");
        }
        const opened = openArtifactProjectReference({ readProjectReference }, { reference: input.reference, projectRoot: workspace?.canonical_path });
        return { filename: opened.fileName, content_base64: Buffer.from(opened.content).toString("base64") };
      },
    }),
  };
}
