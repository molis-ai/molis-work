import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";

/**
 * This store in the Home's store registry: `artifacts/projects/<project>/originals/<sha256>`. The module keeps the reading and
 * writing, and the project's deletion (`modules/artifacts`, `artifactsProjectData`).
 */
export const ARTIFACTS_HOME_STORE: NonNullable<PluginRegistration["home_store"]> = { path: "artifacts" };
