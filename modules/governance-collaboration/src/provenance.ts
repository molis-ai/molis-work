import type {
  GovernanceProvenanceApi,
  GoalEventTrustedAuthority,
  GoalTreeProposalItemProvenanceInput, GoalTreeProposalItemRecord,
} from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { GovernanceError, type GovernanceErrorFactory } from "./errors.js";
import { legacyProposalView } from "./legacy-proposal-view.js";

/** Confirmation provenance belongs to Governance; a locator is not automatically a Ledger edge. */
export class GovernanceProvenance implements GovernanceProvenanceApi {
  readonly legacyProposalView = legacyProposalView;
  constructor(private readonly error: GovernanceErrorFactory = (code, message, details) => new GovernanceError(code, message, details)) {}

  normalizeProposalSource(input: Pick<GoalTreeProposalItemProvenanceInput, "source_refs" | "reason" | "confidence" | "requires_user_confirmation">,
    index: number): Pick<GoalTreeProposalItemRecord, "source_refs" | "reason" | "confidence"> & { requires_user_confirmation: true } {
    const path = `items[${index}]`;
    const issues: Array<{ code: string; path: string; message: string; expected: string }> = [];
    const add = (field: string, code: string, message: string, expected: string) =>
      issues.push({ code, path: `${path}.${field}`, message, expected });
    const references = input.source_refs;
    const validReferences = Array.isArray(references) && references.every(ref => typeof ref === "string");
    const sourceRefs = validReferences ? [...new Set(references.map(ref => ref.trim()).filter(Boolean))].sort() : [];
    if (!sourceRefs.length || !validReferences) add("source_refs", "goal_tree_proposal.source_required",
      `第 ${index + 1} 个条目至少需要一个来源引用`, "包含真实来源的字符串数组，例如已保存的 Goal 事件 event_id");
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    if (!reason) add("reason", "goal_tree_proposal.reason_required", `第 ${index + 1} 个条目必须说明业务理由`, "非空字符串");
    if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
      add("confidence", "goal_tree_proposal.confidence_invalid", `第 ${index + 1} 个条目的置信度必须在 0 到 1 之间`, "0 到 1 的数字");
    }
    if (input.requires_user_confirmation !== undefined && input.requires_user_confirmation !== true) {
      add("requires_user_confirmation", "goal_tree_proposal.user_confirmation_required",
        "Goal Tree 提案的每个条目都必须等待用户确认，不能提前物化为正式事实", "省略或 true");
    }
    if (issues.length) {
      const first = issues[0]!;
      throw this.error(first.code, issues.map(issue => issue.message).join("；"), {
        path: first.path, issues,
        recovery: "修正列出的字段后重试 molis_work_v1_goal_tree_propose；失败调用不会创建提案，无需切换接口。",
      });
    }
    return { source_refs: sourceRefs, reason, confidence: input.confidence, requires_user_confirmation: true };
  }

  validateEventDecisionAuthority(authority: GoalEventTrustedAuthority): GoalEventTrustedAuthority {
    if (!authority || typeof authority !== "object") {
      throw this.error("event_decision.untrusted_actor", "用户决定必须来自 Host 受保护入口，不能由客户端自填身份");
    }
    if (authority.actor_kind !== "user") {
      throw this.error("event_decision.untrusted_actor", "用户决定必须来自可信用户入口，Runtime 不能声明自己是用户");
    }
    if (authority.authority_source !== "web" && authority.authority_source !== "management") {
      throw this.error(
        "event_decision.runtime_dialogue_not_user",
        "Runtime 对话摘要引用不是系统读取到的用户消息，不能当作用户批准",
      );
    }
    const actorId = authority.actor_id?.trim();
    const conversationRef = authority.conversation_ref?.trim();
    const messageRef = authority.message_ref?.trim();
    if (!actorId || !conversationRef || !messageRef) {
      throw this.error("event_decision.untrusted_actor", "可信用户决定需要 Host 注入的 actor、会话与消息来源");
    }
    return {
      actor_id: actorId,
      actor_kind: "user",
      authority_source: authority.authority_source,
      conversation_ref: conversationRef,
      message_ref: messageRef,
    };
  }
}
