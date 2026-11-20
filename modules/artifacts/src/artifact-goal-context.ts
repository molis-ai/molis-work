import type { ArtifactsQueryApi, ArtifactConsumerType } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { readArtifactSelection, type ArtifactBrowserView } from "./artifact-browser.js";
import { linkKindOf, type ArtifactLinkKinds } from "./artifact-link-kinds.js";

export interface GoalArtifactEmbed {
  readonly relationship: "input" | "output";
  readonly view: ArtifactBrowserView;
}

/** Read explicit owner-authored relations; locators, private sessions and Goal status are not Artifact facts. */
export function readGoalArtifactEmbeds(input: {
  projectId: string;
  goalId: string;
  ledger: ContextLedgerApi["query"];
  artifacts: ArtifactsQueryApi;
  supportedTypes?: ArtifactConsumerType[];
  /** The link kinds Plugins declare; with none (no Plugin that links objects to 成果 is present) there is nothing to embed. */
  linkKinds?: ArtifactLinkKinds;
}): GoalArtifactEmbed[] {
  const scope = { kind: "personal" as const, id: input.projectId };
  // By each declared kind: the object's kind is its owner's word, so the edges are matched on the declaring plugin and the id.
  const edges = [...input.linkKinds?.entries() ?? []].filter(([, kind]) => !kind.proposal).flatMap(([type, kind]) =>
    input.ledger.list({ actor_id: "plugin:artifacts", scope }, { type })
      .filter(edge => edge.source.module === "plugins" && edge.source.plugin_id === kind.plugin_id && edge.source.id === input.goalId));
  return edges.flatMap((edge): GoalArtifactEmbed[] => {
    const kind = linkKindOf(input.linkKinds, edge);
    if (!kind || kind.proposal || edge.target.module !== "artifacts" || (edge.target.project_id != null && edge.target.project_id !== input.projectId)) return [];
    return [{ relationship: kind.role, view: {
      versions: [], ...readArtifactSelection(input.artifacts, input.projectId,
        { artifact_id: edge.target.id, version: edge.target.version! }, input.supportedTypes),
    } }];
  });
}
