import { isDeepStrictEqual } from "node:util";
import { actionEffect, requireSynchronous, type ActionView, type ActionDelegationExtraction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionReviewAuthority, AgentDelegationSubject, AgentDelegationTargetOwner, ReviewDecisionSource } from "@molis-ai/molis-work-contracts/services/agent-host";
import { canonicalJsonText, extractActionDelegation } from "@molis-ai/molis-work-plugin-sdk";
import { actionDigest } from "./action-digest.js";
import { actionDelegationMatches } from "./delegation-scopes.js";
import type { WorkDelegationPermission } from "./delegation-permissions.js";
import { reviewProposalVersion, type ReviewDecisionControl } from "./review-decisions.js";
import { agentErrors } from "./errors.js";

/** Trusted adapter facts, not an action's business input. The original review control already validated the schema. */
export interface WorkActionProposal {
  readonly work_epoch: string;
  readonly view: ActionView;
  readonly input: unknown;
  readonly provider_installation_generation: string | null;
  readonly mcp_scope?: Awaited<ReturnType<NonNullable<AgentActionReviewAuthority["resolveDelegation"]>>>["mcp_scope"];
  /** Includes explicit human-review policy and the person's current confirm-always setting. */
  readonly confirmation_required: boolean;
  /** Only nonempty targets need owners. Each fence retains that exact registration and installation generation. */
  readonly target_owners: Readonly<Record<string, { readonly identity: AgentDelegationTargetOwner; assertCurrent(): void }>>;
}

type ActionDecision =
  | { readonly state: "read" | "original" }
  | { readonly state: "confirm"; readonly reason: "required" | "mode" | "identity" | "scope" | Extract<ActionDelegationExtraction, { state: "confirmation-required" }>["reason"] }
  | { readonly state: "delegation"; readonly subject: AgentDelegationSubject; readonly source: Extract<ReviewDecisionSource, { kind: "delegation" }> };

function exactJson(input: unknown): string {
  try {
    const text = canonicalJsonText(input);
    if (text !== undefined && isDeepStrictEqual(JSON.parse(text), input)) return text;
  } catch { /* Unsupported or cyclic values cannot become a smaller, more permissive JSON proposal. */ }
  throw agentErrors.delegation_invalid("授权参数必须是完整的 JSON，不能省略或转换其中的值");
}

/** Freeze before the first await. Display labels never resolve an owner or grant a scope. */
export function prepareActionDelegation(proposal: WorkActionProposal, control: ReviewDecisionControl) {
  const inputJson = exactJson(proposal.input), input = JSON.parse(inputJson) as unknown;
  const { work_epoch: workEpoch, provider_installation_generation: generation, confirmation_required: required } = proposal;
  const mcpScope = proposal.mcp_scope && structuredClone(proposal.mcp_scope);
  if (!workEpoch || typeof required !== "boolean") throw agentErrors.delegation_invalid("动作判定缺少原工作版本或确认规则");
  const view = structuredClone(proposal.view), extracted = extractActionDelegation(view.action, input);
  const ownerEntries: Array<[string, AgentDelegationTargetOwner | null]> = [], fences: Array<() => void> = [];
  if (extracted.state === "resolved" && view.action.delegation && view.action.delegation !== "confirmation-only") {
    for (const key of new Set(extracted.operations.flatMap(operation => Object.keys(operation.targets)))) {
      const declaration = view.action.delegation.targets.find(target => target.key === key)!;
      const id = extracted.operations.find(operation => Object.hasOwn(operation.targets, key))!.targets[key];
      if (id === "") { ownerEntries.push([key, null]); continue; }
      const target = Object.hasOwn(proposal.target_owners, key) ? proposal.target_owners[key] : undefined;
      if (!target || target.identity.kind !== declaration.kind || typeof target.assertCurrent !== "function") continue;
      ownerEntries.push([key, structuredClone(target.identity)]); fences.push(target.assertCurrent.bind(target));
    }
  }
  const originalCheck = control.assertCurrent.bind(control), before = control.beforeEffect.bind(control);
  const assertCurrent = () => { requireSynchronous(originalCheck()); };
  const beforeEffect = async () => { assertCurrent(); await before(); assertCurrent(); };
  const reference = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  const owners = Object.fromEntries(ownerEntries);
  const digest = actionDigest(view), inputVersion = reviewProposalVersion(input);
  return { beforeEffect, decide(permission: WorkDelegationPermission) {
    let matchedObject = false;
    const current = () => {
      assertCurrent(); requireSynchronous(permission.assertCurrent());
      if (permission.work_epoch !== workEpoch) throw agentErrors.delegation_changed("原轮次所属的工作版本已变化，不能沿用新工作授权");
      if (matchedObject) for (const check of fences) requireSynchronous(check());
    };
    current();
    let decision: ActionDecision;
    const isRead = view.operation === "query" && actionEffect(view.action, view.capability_id) === "read";
    if (!isRead && permission.mode === "read-only") throw agentErrors.review_not_permitted("当前工作只允许读取，不能批准或执行改动");
    else if (required) decision = { state: "confirm", reason: "required" };
    else if (isRead) decision = { state: "read" };
    else if (permission.mode === "original") decision = { state: "original" };
    else if (permission.mode === "confirm") decision = { state: "confirm", reason: "mode" };
    else if (!mcpScope && (!generation || view.provider.kind === "mcp")) decision = { state: "confirm", reason: "identity" };
    else {
      const automatic = permission.automatic;
      const identity = { action: reference, declaration_digest: digest, provider_installation_generation: generation };
      const matched = automatic?.selection.scopes.some(scope => {
        if (mcpScope) return extracted.state === "confirmation-required" && extracted.reason === "undeclared"
          && scope.kind === "mcp-exact" && isDeepStrictEqual(scope, { ...mcpScope, input_json: inputJson });
        if (!generation || view.provider.kind === "mcp") return false;
        if (extracted.state === "resolved") return scope.kind === "action-objects"
          && actionDelegationMatches(scope, { kind: "action-objects", ...identity, provider_installation_generation: generation, operations: extracted.operations, target_owners: owners });
        return extracted.reason === "undeclared" && scope.kind === "action-exact" && isDeepStrictEqual(scope, { kind: "action-exact", ...identity, input_json: inputJson });
      });
      matchedObject = Boolean(matched && !mcpScope && extracted.state === "resolved");
      decision = matched && automatic ? { state: "delegation", subject: structuredClone(automatic.state.subject), source: { kind: "delegation", delegation: {
        id: automatic.selection.id, revision: automatic.selection.revision, work_epoch: workEpoch, grantor_id: automatic.selection.granted_by,
      } } } : { state: "confirm", reason: extracted.state === "resolved" || extracted.reason === "undeclared" ? "scope" : extracted.reason };
    }
    current();
    return { decision, input_version: inputVersion, assertCurrent: current, beforeEffect: async () => { current(); await beforeEffect(); current(); } };
  } };
}
