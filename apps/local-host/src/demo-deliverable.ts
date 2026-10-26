import { ARTIFACTS_PROVIDER, DOCUMENT_ARTIFACT_TYPE } from "@molis-ai/molis-work-module-artifacts";
import { LocalProjectDatabase } from "./project-database.js";
import { openProjectVersionStores } from "./project-version-stores.js";

export const DEMO_CORE_ARTIFACT_ID = "demo/core-lifecycle-record";

const DEMO_ACTOR = "demo-user";

/** CORE's two versions of the sample record in the project's 成果库 (imported, the second superseding the first). Safe to call more than once. */
export function registerDemoDeliverableVersions(store: LocalProjectDatabase, projectId: string): void {
  const { artifacts } = openProjectVersionStores(store);
  const producer = { plugin_id: ARTIFACTS_PROVIDER.plugin_id, plugin_version: ARTIFACTS_PROVIDER.version, binding_signature: ARTIFACTS_PROVIDER.publisher.signature };
  for (const [version, title, content] of [[1, "生命周期记录已接通", "从约定、报告到收尾形成完整记录"], [2, "可用的生命周期记录", "约定要求已有支持事实，演示收尾"]] as const) {
    artifacts.commands.registerVersion({ project_id: projectId, actor_id: DEMO_ACTOR, artifact_id: DEMO_CORE_ARTIFACT_ID, version,
      artifact_type_id: DOCUMENT_ARTIFACT_TYPE, schema_version: 1, producer, metadata: { origin: "demo-seed", goal_id: "CORE" },
      content: { kind: "inline", payload: { source: "file", source_id: `生命周期记录.md:v${version}`, source_url: null, title, content: `# ${title}\n\n${content}\n`, format: "markdown", warnings: [] } },
      origin: { kind: "imported", file_name: "生命周期记录.md" }, title, media_type: "text/markdown", ...(version > 1 ? { supersedes_version: version - 1 } : {}) });
  }
}

/** The same, for a library that is not open: it is opened for the one write and closed again. */
export function registerDemoDeliverable(databasePath: string, projectId: string): void {
  const store = new LocalProjectDatabase(databasePath);
  try { registerDemoDeliverableVersions(store, projectId); store.checkpoint(); } finally { store.close(); }
}
