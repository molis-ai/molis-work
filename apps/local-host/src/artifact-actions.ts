import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionClient, type ActionProviderRegistration, type FileContent } from "@molis-ai/molis-work-contracts/platform/actions";
import { listProjectRoots } from "@molis-ai/molis-work-module-projects";
import { logPreviewFailure } from "./host-log.js";
import { ARTIFACTS_PLUGIN_ID, ARTIFACTS_PROVIDER_ID, ARTIFACTS_PROVIDER_TITLE, ARTIFACT_ACTIONS, createArtifactActionHandlers, artifactGoalRelations, openArtifactProjectReference } from "@molis-ai/molis-work-module-artifacts";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { artifactLinkKinds, artifactTypeDeclarations } from "./artifact-type-registry.js";
import { readProjectReference } from "./project-file-reference.js";
import { runWithMolisWorkHome, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { documentImportConnections, documentImportConnectionStatus, importLocalArtifactDocument } from "./artifact-document-import.js";
import { artifactPluginInputs, bindArtifactPluginInput } from "./artifact-plugin-inputs.js";
import { runningProjectPlatform } from "./project-plugins.js";
import type { MolisWorkProjectRuntime, MolisWorkLocalHostOptions } from "./project-host.js";

/** Goals' read of one Goal's headline, asked as the caller: a Goal the caller cannot read, or a project without Goals, has no title here. */
const GOAL_DIRECTORY_READ = { capability_id: "goals.directory.read", version: 1 } as const;

function artifactProjectInstance(runtime: MolisWorkProjectRuntime): string | null {
  const roots = listProjectRoots(runtime.store.db);
  // The existing unnamed MCP scope may observe the library, but cannot identify its Artifact source.
  if (roots.length === 1 && roots[0]!.project_id !== runtime.project_id && runtime.project_id === `database:${runtime.store.path}`) return null;
  if (roots.length > 1 || roots.length === 1 && roots[0]!.project_id !== runtime.project_id)
    throw new ActionError("artifacts.project_storage_invalid", "当前项目的数据实例身份不完整");
  return roots[0]?.data_instance_id ?? null;
}

export function artifactActionProvider(runtime: MolisWorkProjectRuntime, options: Pick<MolisWorkLocalHostOptions, "homeDirectory" | "workspaceFor">, client?: ActionClient): ActionProviderRegistration {
  const home = options.homeDirectory ?? resolveMolisWorkHome();
  const instance = artifactProjectInstance(runtime);
  // The platform's own provider (PG-077): no plugin id, so no plugin's enablement gates it; the id is the one it was called by as a plugin.
  const provider: ActionProviderRegistration["provider"] = { provider_id: ARTIFACTS_PROVIDER_ID, title: ARTIFACTS_PROVIDER_TITLE, kind: "system", project_id: runtime.project_id,
    ...(instance ? { project_data_instance_id: instance } : {}),
    // The English of its action text is still in the 成果 plugin's words, until that shell goes (PG-077 step 2).
    words_of: ARTIFACTS_PLUGIN_ID };
  const source = { projectId: runtime.project_id,
    ledger: createContextLedger(runtime.store.db, { authorize: (access, operation) => operation === "read" && access.scope.kind === "personal" && access.scope.id === runtime.project_id }).query,
    linkKinds: artifactLinkKinds() };
  return {
    provider,
    availability: () => instance && artifactProjectInstance(runtime) === instance ? { available: true }
      : { available: false, code: "artifacts.project_storage_invalid", reason: "当前项目尚无可用的数据实例身份" },
    sourceRevision: caller => {
      if (!instance || artifactProjectInstance(runtime) !== instance) throw new ActionError("artifacts.project_storage_invalid", "当前项目的数据实例身份已变化");
      return JSON.stringify([instance, runtime.store.eventCursor(runtime.project_id, "artifact"), artifactGoalRelations(source, caller)]);
    },
    definitions: ARTIFACT_ACTIONS,
    handlers: createArtifactActionHandlers({
      ...source, artifacts: runtime.artifacts,
      goalTitle: async (goalId, caller) => {
        if (!client) return null;
        try {
          const item = await client.invoke(caller, GOAL_DIRECTORY_READ, { goal_id: goalId }) as { title?: unknown };
          return typeof item.title === "string" ? item.title : null;
        } catch { return null; }
      },
      typeTitle: typeId => artifactTypeDeclarations().get(typeId)?.title ?? null,
      // The owner's preview, with the caller's own authority; a version the caller may not read through it has no text here.
      previewText: async (artifact, caller) => {
        const preview = artifactTypeDeclarations().get(artifact.artifact_type_id)?.preview;
        if (!preview || !client) return null;
        try {
          const content = await client.invoke(caller, preview, { artifact }) as FileContent;
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
      importConnections: () => documentImportConnections(home),
      importDocument: (input, caller) => runWithMolisWorkHome(home, () => importLocalArtifactDocument({ ...input }, {
        projectId: runtime.project_id, actorId: caller.actor_id, ownerActorId: LOCAL_PERSON_ACTOR_ID, routePrefix: `/projects/${encodeURIComponent(runtime.project_id)}`,
        artifacts: runtime.artifacts, signal: caller.signal,
        // A file the Host was given for this import: only on the person's own call, and only one offered to the 成果库 itself.
        ...input.source === "file" && caller.audience === "user" && caller.original_file?.install_id === ARTIFACTS_PLUGIN_ID ? { offeredPath: caller.original_file.path } : {},
        // Downloading the speech model is the person's own yes: an Agent, MCP client, workflow or plugin passing true downloads nothing (S-39, PMAT-48).
        allowModelDownload: caller.audience === "user" && input.source === "file" && input.allow_model_download === true,
        ...caller.on_progress ? { onProgress: caller.on_progress } : {},
        beforeDispatch: () => caller.beforeEffect(),
        beforeSave: () => caller.beforeEffect(),
      })),
      openProjectReference: async input => {
        const workspace = await options.workspaceFor?.(runtime.project_id);
        const opened = openArtifactProjectReference({ readProjectReference }, { reference: input.reference, projectRoot: workspace?.canonical_path });
        return { filename: opened.fileName, content_base64: Buffer.from(opened.content).toString("base64") };
      },
    }),
  };
}
