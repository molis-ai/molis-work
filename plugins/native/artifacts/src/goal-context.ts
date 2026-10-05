import type { ArtifactsQueryApi, ArtifactConsumerType } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { readArtifactSelection, type ArtifactBrowserView } from "./browser.js";

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
}): GoalArtifactEmbed[] {
  const scope = { kind: "personal" as const, id: input.projectId };
  const edges = input.ledger.list({ actor_id: "plugin:artifacts", scope }, {
    source: { module: "goals", id: input.goalId, version: null, scope },
  });
  return edges.flatMap((edge): GoalArtifactEmbed[] => {
    if ((edge.type !== "goal.input" && edge.type !== "goal.output") || edge.target.module !== "artifacts"
      || (edge.target.project_id != null && edge.target.project_id !== input.projectId)) return [];
    return [{ relationship: edge.type === "goal.input" ? "input" : "output", view: {
      versions: [], ...readArtifactSelection(input.artifacts, input.projectId,
        { artifact_id: edge.target.id, version: edge.target.version! }, input.supportedTypes),
    } }];
  });
}
