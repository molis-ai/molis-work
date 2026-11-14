import type { ExactRef, Runtime } from "@prologue/sdk";
import type { NodeHost, RoundState } from "./prologue-node-kit.js";
import { isGatewayChange } from "./prologue-action-gateway.js";

/** Reconcile only the original SDK dispatch evidence; never infer execution from business data or replay it. */
export async function inspectReviewEffect(runtime: Runtime, ref: ExactRef<"effect">) {
  try {
    const dispatch = await runtime.effects.inspectDispatch(ref);
    let effect = runtime.effects.get(ref);
    if (effect?.state === "reconcile-required" && dispatch.state !== "unknown") {
      if (dispatch.state === "not-dispatched") await runtime.effects.reconcile(ref, { kind: "known-not-happened", why: "The original Host dispatch record confirms no dispatch." });
      else if (dispatch.receiptId) await runtime.effects.reconcile(ref, { kind: "host-receipt", receiptId: dispatch.receiptId });
      effect = runtime.effects.get(ref);
    }
    return { effect, dispatch };
  } catch {
    // One unreadable receipt stays unknown without hiding unrelated reviews.
    return { effect: runtime.effects.get(ref), dispatch: { state: "unknown" as const } };
  }
}

/** The Node Host may still receive the result of a business action after the Run stops waiting. */
export function withActionDispatchReceipts(host: NodeHost, state: Pick<RoundState, "actionReviews">, currentRuntime: () => Runtime | undefined): NodeHost {
  return { ...host, async openDispatch(input) {
    const runtime = currentRuntime();
    const effect = runtime?.effects.get({ kind: "effect", id: input.policyReceipt, revision: 1 });
    const permit = await host.openDispatch(input);
    const origin = effect?.proposal.origin, subject = effect?.proposal.subject;
    if (runtime && effect?.state === "dispatching" && origin?.session && origin.toolCall && subject?.what === "tool"
      && isGatewayChange(subject.name) && effect.proposal.inputFingerprint === permit.fingerprint) {
      state.actionReviews.get(origin.session)?.bindReceipt(effect, async () => {
        if (runtime.effects.get(effect.ref)?.state !== "reconcile-required") return false;
        await host.closeDispatch({ permit, ok: true });
        const { effect: saved, dispatch } = await inspectReviewEffect(runtime, effect.ref);
        return saved?.state === "completed" && dispatch.state === "dispatched" && dispatch.ok === true;
      });
    }
    return permit;
  } };
}
