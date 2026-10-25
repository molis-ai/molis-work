import { LOCAL_PERSON_ACTOR_ID, type ActionClient, type ActionProviderRegistration, type FileContent } from "@molis-ai/molis-work-contracts/platform/actions";
import { logPreviewFailure } from "./host-log.js";
import { ARTIFACTS_PLUGIN_ID, ARTIFACTS_PROVIDER, ARTIFACT_ACTIONS, createArtifactActionHandlers, openArtifactProjectReference } from "@molis-ai/molis-work-module-artifacts";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { artifactTypeDeclarations } from "./artifact-type-registry.js";
import { readProjectReference } from "./project-file-reference.js";
import { runWithMolisWorkHome, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { documentImportConnections, documentImportConnectionStatus, importLocalArtifactDocument } from "./artifact-document-import.js";
import { artifactPluginInputs, bindArtifactPluginInput } from "./artifact-plugin-inputs.js";
import { runningProjectPlatform } from "./project-plugins.js";
import type { MolisWorkProjectRuntime, MolisWorkLocalHostOptions } from "./project-host.js";

export function artifactActionProvider(runtime: MolisWorkProjectRuntime, options: Pick<MolisWorkLocalHostOptions, "homeDirectory" | "workspaceFor">, client?: ActionClient): ActionProviderRegistration {
  const home = options.homeDirectory ?? resolveMolisWorkHome();
  const provider: ActionProviderRegistration["provider"] = { provider_id: ARTIFACTS_PROVIDER.plugin_id, plugin_id: ARTIFACTS_PROVIDER.plugin_id, title: ARTIFACTS_PROVIDER.name, kind: "plugin", project_id: runtime.project_id };
  return {
    provider,
    definitions: ARTIFACT_ACTIONS,
    handlers: createArtifactActionHandlers({
      projectId: runtime.project_id, artifacts: runtime.artifacts,
      ledger: createContextLedger(runtime.store.db, { authorize: (access, operation) => operation === "read" && access.scope.kind === "personal" && access.scope.id === runtime.project_id }).query,
      goalTitle: goalId => runtime.coordinator.goalQueries.getGoal(runtime.project_id, goalId)?.title ?? null,
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
