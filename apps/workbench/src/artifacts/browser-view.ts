export { artifactVersionPath } from "@molis-ai/molis-work-module-artifacts";
export type { ArtifactBrowserView, GoalArtifactEmbed } from "@molis-ai/molis-work-module-artifacts";

/**
 * A plugin input port that takes this version's type (artifact-positioning, 2026-10-04), and what it reads now: this very
 * version, another fixed version, another plugin's output (`source_title`), or nothing.
 */
export interface ArtifactPluginInput { plugin_id: string; plugin_title: string; port: string; source: "this" | "another-version" | "plugin" | "none"; source_title: string | null }
