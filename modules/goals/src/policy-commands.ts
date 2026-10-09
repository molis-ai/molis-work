import { randomUUID } from "node:crypto";
import type { GoalPolicy, GoalsCommandApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { GoalsCommandContext, requestHash } from "./command-support.js";

/** Project defaults have one active binding; edits and their audit event commit together. */
export class ProjectPolicyCommands {
  constructor(private readonly context: GoalsCommandContext) {}

  save(input: Parameters<GoalsCommandApi["saveProjectPolicy"]>[0]): ReturnType<GoalsCommandApi["saveProjectPolicy"]> {
    const p = input.policy;
    if (input.user_confirmed !== true || !input.idempotency_key.trim()) {
      throw this.context.error("policy.confirmation_required", "请确认项目规则。");
    }
    if (!p || typeof p.human_approval !== "boolean" || Object.keys(p).some(key => key !== "human_approval")) {
      throw this.context.error("policy.invalid", "工作规则只有「需要用户验收」一项。");
    }
    const policy: GoalPolicy = { human_approval: p.human_approval };
    const hash = requestHash({ policy });
    const operation = "save_project_policy";
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<Omit<ReturnType<GoalsCommandApi["saveProjectPolicy"]>, "replayed">>(
        input.project_id, input.actor_id, operation, input.idempotency_key, hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.context.requireBoard(input.project_id);
      const at = this.context.now().toISOString();
      const bindingId = randomUUID();
      const replaced = this.context.repository.replacePolicyBinding({
        project_id: input.project_id, goal_id: null, policy_binding_id: bindingId,
        policy, actor_id: input.actor_id, reason: "", at,
      });
      const cursor = this.context.repository.appendEvent({
        eventId: randomUUID(), projectId: input.project_id, actorId: input.actor_id,
        type: "policy.project_defaults_saved", objectType: "policy_binding", objectId: bindingId,
        reason: "", payload: { policy, replaced_policy_binding_ids: replaced }, at,
      });
      const outcome = { policy_binding_id: bindingId, observed_event_cursor: cursor };
      this.context.remember(input.project_id, input.actor_id, operation, input.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }
}
