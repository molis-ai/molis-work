/** The 成果 plugin's id: the owner of the 成果库's page and the project key's shell, until that shell goes (PG-077 step 2). */
export const ARTIFACTS_PLUGIN_ID = "io.molis.work.artifacts";
/** What the project database stores for this provider. */
export const ARTIFACTS_PROJECT_PLUGIN_ID = "artifacts";
/**
 * The id the 成果库's actions are called by. The 成果库 is the platform's own provider (`kind: "system"`); the id is the one it
 * had as a plugin, so MCP grants, workflow references and the search index, which all name the provider by id, stay as they are.
 */
export const ARTIFACTS_PROVIDER_ID = "io.molis.work.artifacts";
export const ARTIFACTS_PROVIDER_TITLE = "成果";
/** The identity a version imported through the 成果库 carries: what is stored on the version, whatever registers the actions. */
export const ARTIFACT_PRODUCER = {
  plugin_id: ARTIFACTS_PLUGIN_ID,
  plugin_version: "0.3.0",
  binding_signature: "official-artifacts-binding",
} as const;
