/** The 成果库 as the producer and action provider the Host records: the identity its versions carry and the id it is called by. */
export const ARTIFACTS_PLUGIN_ID = "io.molis.work.artifacts";
/** What the project database stores for this provider. */
export const ARTIFACTS_PROJECT_PLUGIN_ID = "artifacts";
export const ARTIFACTS_PROVIDER = {
  plugin_id: ARTIFACTS_PLUGIN_ID,
  name: "成果",
  version: "0.3.0",
  publisher: { publisher_id: "molis", signature: "official-artifacts-binding" },
} as const;
