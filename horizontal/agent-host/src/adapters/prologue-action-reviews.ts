import type { Effect, EffectOrigin } from "@prologue/sdk";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionClient, AgentActionReviewControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import { reviewProposalVersion } from "../review-decisions.js";

interface HeldActionReview { readonly tool: string; readonly args: string; readonly view: ActionView; readonly control: AgentActionReviewControl }

/** One Run's original SDK tool calls. Neither a tool argument nor a later page can supply this identity. */
export class PrologueActionReviews {
  readonly #calls = new Map<string, HeldActionReview>();
  #run?: string;
  #assertRunCurrent?: () => void;
  constructor(readonly session: string, assertRunCurrent: () => void) { this.#assertRunCurrent = assertRunCurrent; }

  #assertRun(): void {
    if (!this.#assertRunCurrent) throw agentErrors.pending_not_open("原轮次已结束");
    this.#assertRunCurrent();
  }

  async prepare(origin: EffectOrigin | undefined, tool: string, args: unknown, view: ActionView, input: unknown, client: AgentActionClient): Promise<void> {
    if (!origin?.run || !origin.toolCall || origin.session !== this.session || this.#run && origin.run !== this.#run) throw agentErrors.review_unreadable("这项能力审查缺少原轮次的工具调用身份");
    if (!client.prepareReview) throw agentErrors.review_not_permitted("原执行方尚未接通持续的能力审查授权");
    this.#run = origin.run;
    if (this.#calls.has(origin.toolCall)) throw agentErrors.review_version_changed("原工具调用已有固定提案，不能重新绑定");
    this.#assertRun();
    const original = await client.prepareReview(view, input);
    const assertCurrent = () => { this.#assertRun(); original.assertCurrent(); };
    const control = { assertCurrent, beforeEffect: async () => { assertCurrent(); await original.beforeEffect(); assertCurrent(); } };
    control.assertCurrent();
    if (this.#calls.has(origin.toolCall)) throw agentErrors.review_version_changed("原工具调用已有固定提案，不能重新绑定");
    this.#calls.set(origin.toolCall, { tool, args: reviewProposalVersion(args), view: structuredClone(view), control });
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
