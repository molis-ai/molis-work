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
