import type { Effect, EffectOrigin, PolicySnapshot } from "@prologue/sdk";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionClient, AgentActionReviewControl, AgentDelegationActionChoice, ReviewDecisionSource } from "@molis-ai/molis-work-contracts/services/agent-host";
import { canonicalJsonText, extractActionDelegation, isRecord, redactSecrets } from "@molis-ai/molis-work-plugin-sdk";
import { agentErrors } from "../errors.js";
import { reviewProposalVersion } from "../review-decisions.js";
import type { WorkDelegationPermission } from "../delegation-permissions.js";
import type { WorkDelegationStore } from "../delegations.js";

type AutomaticSource = Extract<ReviewDecisionSource, { kind: "delegation" | "policy" }>;

interface HeldActionReview {
  readonly tool: string;
  readonly args: string;
  readonly view: ActionView;
  readonly control: AgentActionReviewControl;
  readonly choice?: AgentDelegationActionChoice;
  readonly assertChoiceCurrent: () => void;
  automatic(policy: PolicySnapshot): { source: AutomaticSource; assertCurrent(): void; activate(): void } | undefined;
}

function choiceFor(view: ActionView, input: unknown): AgentDelegationActionChoice | undefined {
  const action = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  const result = extractActionDelegation(view.action, input);
  if (result.state === "resolved") return { kind: "objects", action, operations: result.operations.map(row => ({ key: row.key,
    targets: Object.entries(row.targets).map(([key, id]) => ({ key, ids: [id] })) })) };
  if (result.reason !== "undeclared" || !isRecord(input)) return undefined;
  const exact = canonicalJsonText(input);
  if (!exact || exact.length > 12_000 || redactSecrets(exact) !== exact) return undefined;
  return { kind: "exact", action, input: structuredClone(input) };
}

/** One Run's original SDK tool calls. Neither a tool argument nor a later page can supply this identity. */
export class PrologueActionReviews {
  readonly #calls = new Map<string, HeldActionReview>();
  #run?: string;
  #assertRunCurrent?: () => void;
  constructor(readonly session: string, assertRunCurrent: () => void,
    private readonly delegation?: { store: WorkDelegationStore; permission: WorkDelegationPermission }) { this.#assertRunCurrent = assertRunCurrent; }

  #assertRun(): void {
    if (!this.#assertRunCurrent) throw agentErrors.pending_not_open("原轮次已结束");
    this.#assertRunCurrent();
  }

  async prepare(origin: EffectOrigin | undefined, tool: string, args: unknown, view: ActionView, input: unknown, client: AgentActionClient, reversible = false): Promise<void> {
    if (!origin?.run || !origin.toolCall || origin.session !== this.session || this.#run && origin.run !== this.#run) throw agentErrors.review_unreadable("这项能力审查缺少原轮次的工具调用身份");
    if (!client.prepareReview) throw agentErrors.review_not_permitted("原执行方尚未接通持续的能力审查授权");
    this.#run = origin.run;
    if (this.#calls.has(origin.toolCall)) throw agentErrors.review_version_changed("原工具调用已有固定提案，不能重新绑定");
    this.#assertRun();
    const original = await client.prepareReview(view, input, reversible ? "reversible" : undefined);
    const assertCurrent = () => { this.#assertRun(); original.assertCurrent(); this.delegation?.permission.assertCurrent(); };
    const control = { assertCurrent, beforeEffect: async () => { assertCurrent(); await original.beforeEffect(); assertCurrent(); } };
    const automaticReview = reversible ? this.#reversible(view, client, control) : await this.#automatic(original, view, input, control);
    let usedAutomatic = false;
    const assertAutomatic = () => {
      if (!automaticReview) throw agentErrors.review_not_permitted("原操作需要本人确认");
      automaticReview.assertCurrent();
    };
    const heldControl = {
      assertCurrent: () => { control.assertCurrent(); if (usedAutomatic) assertAutomatic(); },
      beforeEffect: async () => { await (usedAutomatic ? automaticReview!.beforeEffect() : control.beforeEffect()); if (usedAutomatic) assertAutomatic(); },
    };
    control.assertCurrent();
    if (this.#calls.has(origin.toolCall)) throw agentErrors.review_version_changed("原工具调用已有固定提案，不能重新绑定");
    const choice = choiceFor(view, input);
    this.#calls.set(origin.toolCall, { tool, args: reviewProposalVersion(args), view: structuredClone(view), control: heldControl,
      ...(choice ? { choice } : {}), assertChoiceCurrent: original.assertCurrent,
      automatic: policy => automaticReview ? {
        source: automaticReview.source(policy), assertCurrent: assertAutomatic,
        activate: () => { assertAutomatic(); usedAutomatic = true; },
      } : undefined });
  }

  #reversible(view: ActionView, client: AgentActionClient, control: AgentActionReviewControl) {
    const assertCurrent = () => {
      control.assertCurrent();
      if (!client.direct?.(view)) throw agentErrors.review_not_permitted("原可撤销策略不再适用，需要本人确认");
    };
    assertCurrent();
    return { source: (policy: PolicySnapshot): AutomaticSource => ({ kind: "policy", owner: "agent.assistant-reversible", id: policy.ref.id,
      revision: policy.ref.revision, set_by: "molis-work", set_at: new Date(policy.takenAtMs).toISOString() }),
    assertCurrent, beforeEffect: async () => { assertCurrent(); await control.beforeEffect(); assertCurrent(); } };
  }

  async #automatic(original: Awaited<ReturnType<NonNullable<AgentActionClient["prepareReview"]>>>, view: ActionView, input: unknown, control: AgentActionReviewControl) {
    const work = this.delegation;
    if (work?.permission.mode !== "automatic" || !work.permission.automatic || !original.resolveDelegation) return undefined;
    const facts = await original.resolveDelegation();
    if (!(facts.provider_installation_generation || facts.mcp_scope) || facts.confirmationRequired()) return undefined;
    const decided = await work.store.actionDecision(work.permission.subject, {
      work_epoch: work.permission.work_epoch, view, input, provider_installation_generation: facts.provider_installation_generation,
      mcp_scope: facts.mcp_scope, confirmation_required: false, target_owners: facts.target_owners,
    }, control, work.permission);
    if (decided.decision.state !== "delegation") return undefined;
    const source = decided.decision.source;
    return { source: () => source, beforeEffect: decided.beforeEffect, assertCurrent: () => {
      decided.assertCurrent(); facts.assertProviderCurrent();
      if (facts.confirmationRequired()) throw agentErrors.review_not_permitted("原操作现在需要本人确认");
    } };
  }

  // The SDK gives broker executors a callId, without origin. This instance belongs to that Run's executor closure.
  forCall(id: string | undefined, tool: string, args: unknown): HeldActionReview {
    const held = id && this.#calls.get(id);
    if (!held || held.tool !== tool || held.args !== reviewProposalVersion(args)) throw agentErrors.review_version_changed("工具参数或原调用已变化，旧审查不能继续执行");
    return held;
  }

  forEffect(effect: Effect): HeldActionReview {
    const origin = effect.proposal.origin, subject = effect.proposal.subject;
    if (origin?.run !== this.#run || origin?.session !== this.session || subject.what !== "tool" || typeof subject.input !== "string") throw agentErrors.review_unreadable("原能力审查与执行归属不一致");
    return this.forCall(origin.toolCall, subject.name, JSON.parse(subject.input));
  }

  release(id: string | undefined): void { if (id) this.#calls.delete(id); }
  releaseEffect(effect: Effect | undefined): void {
    const origin = effect?.proposal.origin;
    if (origin?.run === this.#run && origin?.session === this.session) this.release(origin.toolCall);
  }
  releaseRun(id: string): boolean {
    if (this.#run !== undefined && this.#run !== id) return false;
    this.#calls.clear(); this.#assertRunCurrent = undefined; return true;
  }
}
