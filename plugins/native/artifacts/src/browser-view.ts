import type { ArtifactConsumptionCompatibility, ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";

/** What the 成果 page shows; the module reads it (`modules/artifacts`), the plugin only draws and types it. */
export interface ArtifactBrowserView {
  readonly versions: readonly ArtifactVersionRecord[];
  readonly selected: ArtifactVersionRecord | null;
  readonly requested: ArtifactReference | null;
  readonly compatibility: ArtifactConsumptionCompatibility | null;
}

export function artifactVersionPath(reference: ArtifactReference): string {
  return `/artifacts/${encodeURIComponent(reference.artifact_id)}/versions/${reference.version}`;
}

/** Read explicit owner-authored relations of a Goal: the shape `artifacts.goals.embeds` returns. */
export interface GoalArtifactEmbed {
  readonly relationship: "input" | "output";
  readonly view: ArtifactBrowserView;
}

/**
 * A plugin input port that takes this version's type (artifact-positioning, 2026-10-04), and what it reads now: this very
 * version, another fixed version, another plugin's output (`source_title`), or nothing.
 */
export interface ArtifactPluginInput { plugin_id: string; plugin_title: string; port: string; source: "this" | "another-version" | "plugin" | "none"; source_title: string | null }
