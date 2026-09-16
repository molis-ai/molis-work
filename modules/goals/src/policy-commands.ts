import { randomUUID } from "node:crypto";
import type { GoalPolicy, GoalsCommandApi } from "@molis-ai/molis-work-contracts/modules/goals";
import { GoalsCommandContext, requestHash } from "./command-support.js";

/** Project defaults have one active binding; edits and their audit event commit together. */
export class ProjectPolicyCommands {
  constructor(private readonly context: GoalsCommandContext) {}

  save(input: Parameters<GoalsCommandApi["saveProjectPolicy"]>[0]): ReturnType<GoalsCommandApi["saveProjectPolicy"]> {
    const p = input.policy;
    if (input.user_confirmed !== true || !input.reason.trim() || !input.idempotency_key.trim()) {
      throw this.context.error("policy.confirmation_required", "请确认项目规则并填写修改原因。");
    }
    if (!p || !["disabled", "preferred", "required"].includes(p.goal_mode)
      || typeof p.self_verification !== "boolean" || typeof p.human_approval !== "boolean"
      || !Array.isArray(p.required_capabilities) || p.required_capabilities.some(value => typeof value !== "string" || !value.trim())
      || !Number.isSafeInteger(p.cross_reviewers) || p.cross_reviewers < 0
      || !Number.isSafeInteger(p.adversarial_reviewers) || p.adversarial_reviewers < 0
      || !Number.isSafeInteger(p.max_lease_seconds) || p.max_lease_seconds <= 0) {
      throw this.context.error("policy.invalid", "请检查工作规则的选项、检查人数和领取时长。");
    }
    const policy: GoalPolicy = {
      goal_mode: p.goal_mode, self_verification: p.self_verification, human_approval: p.human_approval,
      required_capabilities: [...new Set(p.required_capabilities.map(value => value.trim()))],
      cross_reviewers: p.cross_reviewers, adversarial_reviewers: p.adversarial_reviewers,
      max_lease_seconds: p.max_lease_seconds,
    };
    const reason = input.reason.trim();
    const hash = requestHash({ policy, reason });
    const operation = "save_project_policy";
    return this.context.repository.immediate(() => {
      const replay = this.context.replay<Omit<ReturnType<GoalsCommandApi["saveProjectPolicy"]>, "replayed">>(
        input.board_id, input.actor_id, operation, input.idempotency_key, hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.context.requireBoard(input.board_id);
      const at = this.context.now().toISOString();
      const bindingId = randomUUID();
      const replaced = this.context.repository.replacePolicyBinding({
        board_id: input.board_id, goal_id: null, policy_binding_id: bindingId,
        policy, actor_id: input.actor_id, reason, at,
      });
      const cursor = this.context.repository.appendEvent({
        eventId: randomUUID(), boardId: input.board_id, actorId: input.actor_id,
        type: "policy.project_defaults_saved", objectType: "policy_binding", objectId: bindingId,
        reason, payload: { policy, replaced_policy_binding_ids: replaced }, at,
      });
      const outcome = { policy_binding_id: bindingId, observed_event_cursor: cursor };
      this.context.remember(input.board_id, input.actor_id, operation, input.idempotency_key, hash, outcome, at);
      return { ...outcome, replayed: false };
    });
  }
}
