import { createFeedCaptureTrigger, feedSourceActions } from "@molis-ai/molis-work-plugin-feed";
import { inboxJudgmentTrigger } from "@molis-ai/molis-work-plugin-inbox";
import type { ActionCallContext, ActionClient, ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { createLocalFeedApplication, type LocalFeedApplicationOptions } from "./feed-application.js";
import { createHomeJudgmentTrigger, HOME_ACTION_PERMISSIONS } from "./home-actions.js";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";
import { localWebActionContext } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { feedPull } from "./web-view.js";

/**
 * The judgments an item starts when the Host brings it into Feed or the Inbox on its own (a workflow, a source tick,
 * a Scheduler wakeup), not at a person's request: capture rules, the Home dock and the Inbox next step. They run as
 * the Host's event identity with only the scopes those scenes need.
 */
export function workflowEventsFeedOptions(scenes: ActionSceneClient, actions: ActionClient, projectId: string, control: Pick<ActionCallContext, "signal" | "validate_authority" | "assert_authority_current"> = {}): LocalFeedApplicationOptions {
  const caller = (permissions: string[]) => () => ({ actor_id: "workflow-events", project_id: projectId, audience: "workflow" as const, permissions, ...control });
  return {
    captureJudgment: createFeedCaptureTrigger({ scenes, projectId,
      context: caller(["feed:read", "feed:write", "inbox:read", "inbox:write", "model:invoke", "functions:invoke"]) }),
    homeJudgment: createHomeJudgmentTrigger({ scenes, projectId,
      context: caller(HOME_ACTION_PERMISSIONS.filter(permission => permission !== "home:write")) }),
    inboxJudgment: inboxJudgmentTrigger({ actions, projectId,
      context: caller(["inbox:read", "feed:read", "model:invoke", "functions:invoke", "judgments:write"]) }),
  };
}


export function projectFeedOptions(host: MolisWorkLocalHost, reference: LocalHostProjectReference) {
  const scenes = host.sceneClient(reference), actions = host.actionClient(reference);
  const context = (permissions: readonly string[]) => () => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
    project_id: reference.project_id, audience: "user" as const, permissions: [...permissions] });
  return {
    captureJudgment: createFeedCaptureTrigger({ scenes, projectId: reference.project_id,
      context: context(["feed:read", "feed:write", "inbox:read", "inbox:write", "model:invoke", "functions:invoke"]) }),
    homeJudgment: createHomeJudgmentTrigger({ scenes, projectId: reference.project_id,
      context: context(HOME_ACTION_PERMISSIONS.filter(permission => permission !== "home:write")) }),
    inboxJudgment: inboxJudgmentTrigger({ actions, projectId: reference.project_id,
      context: context(["inbox:read", "feed:read", "model:invoke", "functions:invoke", "judgments:write"]) }),
  };
}

/** The Host's background source tick uses the same Feed application and caller as a project page. */
export function createProjectFeedScheduler(host: MolisWorkLocalHost, runtime: MolisWorkProjectRuntime, reference: LocalHostProjectReference) {
  const feed = createLocalFeedApplication(runtime.store.db, projectFeedOptions(host, reference));
  feed.recoverInterruptedSourceRuns(reference.project_id);
  const lifetime = new AbortController(), actions = host.actionClient(reference, false);
  return {
    close: () => lifetime.abort(),
    tick: () => feedPull(async () => {
      const caller = await localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS, lifetime.signal);
      lifetime.signal.throwIfAborted();
      return bindActionClient(actions, () => caller).invoke(feedSourceActions.tick, {});
    }),
  };
}
