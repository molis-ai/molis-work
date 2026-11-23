import { ActionError, LOCAL_PERSON_ACTOR_ID, requireSynchronous, type ActionCallContext, type ActionProvider } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { mainlineErrors, type BackgroundTaskHeldReview } from "@molis-ai/molis-work-contracts/services/mainline";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import type { TaskReviewPorts } from "@molis-ai/molis-work-service-mainline";
import { isReviewDocumentReadable, projectReviewForTask } from "./agent-review-http.js";
import { assertHumanReview, type ComputerRoundHolder } from "./computer/computer-policy.js";
import { hasProtectedWebAction } from "./plugin-consent-settings-entry.js";

function isPerson(caller: ActionCallContext): boolean {
  return caller.audience === "user" && caller.actor_id === LOCAL_PERSON_ACTOR_ID && !caller.host_plugin && !caller.delegated_by;
}

function ownerOf(caller: ActionCallContext, provider: ActionProvider) {
  return isPerson(caller) && caller.project_id && provider.kind === "plugin" && provider.plugin_id && provider.plugin_install_id
    && (!provider.project_id || provider.project_id === caller.project_id)
    ? { project_id: caller.project_id, plugin_id: provider.plugin_id, install_id: provider.plugin_install_id } : null;
}

function matches(request: AgentReviewRequest | null | undefined, owner: NonNullable<ReturnType<typeof ownerOf>>, sessionId: string): request is AgentReviewRequest {
  return !!request && request.project_id === owner.project_id && request.plugin_id === owner.plugin_id
    && request.reference.owner.kind === "agent-review" && request.reference.owner.install_id === owner.install_id && request.run?.session_id === sessionId;
}

/** The same queue, review document and self-approval guard used in a session's review surface. */
export function mainlineHeldReviews(queueFor: () => Promise<AgentReviewQueue | undefined>, computerHolder: () => ComputerRoundHolder | null): TaskReviewPorts {
  return {
    async read(caller, provider, tasks) {
      const result = new Map<string, BackgroundTaskHeldReview[]>(), owner = ownerOf(caller, provider);
      if (!owner) return result;
      const queue = await queueFor();
      if (!queue) return result;
      const hints = tasks.flatMap(task => task.held_reviews ? [{ task: task.id, ...task.held_reviews }] : []);
      const pending = new Map(queue.pendingIds(owner, hints.map(hint => hint.session_id)).map(row => [row.session_id, new Set(row.ids)]));
      const owned = new Set(hints.flatMap(hint => hint.ids.filter(id => pending.get(hint.session_id)?.has(id))));
      const rows = new Map((await queue.readMany([...owned])).map(row => [row.request.review_id, row]));
      caller.signal?.throwIfAborted();
      for (const hint of hints) {
        const decisions = hint.ids.flatMap((id): BackgroundTaskHeldReview[] => {
          const row = rows.get(id);
          const decision = row && matches(row.request, owner, hint.session_id) ? projectReviewForTask(row) : null;
          return decision ? [decision] : [];
        });
        if (decisions.length) result.set(hint.task, decisions);
      }
      return result;
    },
    async decide(caller, provider, review, sourceAuthority) {
      const assertPerson = () => {
        if (!isPerson(caller) || !hasProtectedWebAction(caller.user_action)) throw new ActionError("actions.forbidden", uiText.text("workbench.agent-review.entry-refused"));
      };
      assertPerson();
      const owner = ownerOf(caller, provider), queue = await queueFor();
      const changed = () => mainlineErrors.decision_changed(uiText.text("workbench.agent-review.cannot-decide"));
      if (!owner || !queue) throw changed();
      const assertCurrent = (request: AgentReviewRequest | null) => {
        assertPerson();
        caller.signal?.throwIfAborted();
        requireSynchronous(caller.assert_authority_current?.());
        sourceAuthority.assertCurrent();
        if (!matches(request, owner, review.sessionId) || request.reference.version !== review.version || !isReviewDocumentReadable(request.document)) throw changed();
        assertHumanReview(computerHolder(), review.sessionId);
      };
      assertCurrent(queue.get(review.id));
      await queue.refresh(owner.project_id);
      return await queue.respond({ review_id: review.id, version: review.version, decision: review.role, actor_id: caller.actor_id }, {
        beforeEffect: async () => {
          await caller.beforeEffect();
          await sourceAuthority();
        },
        assertCurrent,
      });
    },
  };
}
