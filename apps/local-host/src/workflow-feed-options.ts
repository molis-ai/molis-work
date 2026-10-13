import { createFeedCaptureTrigger } from "@molis-ai/molis-work-plugin-feed";
import { createInboxJudgmentTrigger } from "@molis-ai/molis-work-plugin-inbox";
import type { ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalFeedApplicationOptions } from "./feed-application.js";
import { createHomeJudgmentTrigger, HOME_ACTION_PERMISSIONS } from "./home-actions.js";

/**
 * The judgments an item starts when the Host brings it into Feed or the Inbox on its own (a workflow, a source tick,
 * a Scheduler wakeup), not at a person's request: capture rules, the Home dock and the Inbox next step. They run as
 * the Host's event identity with only the scopes those scenes need.
 */
export function workflowEventsFeedOptions(scenes: ActionSceneClient, projectId: string): LocalFeedApplicationOptions {
  const caller = (permissions: string[]) => () => ({ actor_id: "workflow-events", project_id: projectId, audience: "workflow" as const, permissions });
  return {
    captureJudgment: createFeedCaptureTrigger({ scenes, projectId,
      context: caller(["feed:read", "feed:write", "inbox:read", "inbox:write", "model:invoke", "functions:invoke"]) }),
    homeJudgment: createHomeJudgmentTrigger({ scenes, projectId,
      context: caller(HOME_ACTION_PERMISSIONS.filter(permission => permission !== "home:write")) }),
    inboxJudgment: createInboxJudgmentTrigger({ scenes, projectId,
      context: caller(["inbox:read", "model:invoke", "functions:invoke"]) }),
  };
}
