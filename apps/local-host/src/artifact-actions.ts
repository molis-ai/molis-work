import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { artifactsManifest, createArtifactActionHandlers, openArtifactProjectReference } from "@molis-ai/molis-work-plugin-artifacts";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { readProjectReference } from "@molis-ai/molis-work-module-evidence-verification";
import { runWithMolisWorkHome, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { documentImportConnections, documentImportConnectionStatus, importLocalArtifactDocument } from "./artifact-document-import.js";
import type { MolisWorkProjectRuntime, MolisWorkLocalHostOptions } from "./project-host.js";

export function artifactActionProvider(runtime: MolisWorkProjectRuntime, options: Pick<MolisWorkLocalHostOptions, "homeDirectory" | "workspaceFor">): ActionProviderRegistration {
  const home = options.homeDirectory ?? resolveMolisWorkHome();
  const provider: ActionProviderRegistration["provider"] = { provider_id: artifactsManifest.plugin_id, plugin_id: artifactsManifest.plugin_id, title: artifactsManifest.name, kind: "plugin", project_id: runtime.project_id };
  return {
    provider,
    definitions: artifactsManifest.actions!,
    handlers: createArtifactActionHandlers({
      boardId: runtime.board_id, artifacts: runtime.coordinator.artifacts,
      ledger: createContextLedger(runtime.store.db, { authorize: (access, operation) => operation === "read" && access.scope.kind === "personal" && access.scope.id === runtime.board_id }).query,
      goalTitle: goalId => runtime.coordinator.goalQueries.getGoal(runtime.board_id, goalId)?.title ?? null,
      importSources: () => runWithMolisWorkHome(home, documentImportConnectionStatus),
      importConnections: () => documentImportConnections(home),
      importDocument: (input, caller) => runWithMolisWorkHome(home, () => importLocalArtifactDocument({ ...input }, {
        boardId: runtime.board_id, actorId: caller.actor_id, routePrefix: `/projects/${encodeURIComponent(runtime.project_id)}`,
        artifacts: runtime.coordinator.artifacts, signal: caller.signal,
        beforeDispatch: () => caller.beforeEffect(),
        beforeSave: () => caller.beforeEffect(),
      })),
      openProjectReference: async input => {
        const evidence = runtime.coordinator.evidenceVerification.query;
        const source = input.evidence_id ? evidence.getProjectReferenceSource(runtime.board_id, input.evidence_id) : null;
        const workspace = source?.locator_workspace_root ? null : await options.workspaceFor?.(runtime.project_id);
        const opened = openArtifactProjectReference({ evidence, readProjectReference }, { boardId: runtime.board_id,
          reference: input.reference, evidenceId: input.evidence_id, projectRoot: workspace?.canonical_path });
        return { filename: opened.fileName, content_base64: Buffer.from(opened.content).toString("base64") };
      },
    }),
  };
}
