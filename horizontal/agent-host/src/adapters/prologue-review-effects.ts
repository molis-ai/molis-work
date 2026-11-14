import type { DispatchProof, DispatchReceipt, Effect, ExactRef, Runtime } from "@prologue/sdk";
import type { NodeHost, RoundState } from "./prologue-node-kit.js";
import { isGatewayChange } from "./prologue-action-gateway.js";

type ReviewEffect = { effect: Effect | undefined; dispatch: DispatchReceipt | { state: "unknown" }; inspectionFailure?: unknown };
const committingReceipts = new WeakMap<Runtime, Map<string, Promise<ReviewEffect>>>();

/** Reconcile only the original SDK dispatch evidence; never infer execution from business data or replay it. */
export async function inspectReviewEffect(runtime: Runtime, ref: ExactRef<"effect">): Promise<ReviewEffect> {
  const pending = () => committingReceipts.get(runtime)?.get(ref.id);
  try {
    const existing = pending();
    if (existing) return existing;
    const dispatch = await runtime.effects.inspectDispatch(ref);
    const receipt = pending();
    if (receipt) return receipt;
    let effect = runtime.effects.get(ref);
    if (effect?.state === "reconcile-required" && dispatch.state !== "unknown") {
      if (dispatch.state === "not-dispatched") await runtime.effects.reconcile(ref, { kind: "known-not-happened", why: "The original Host dispatch record confirms no dispatch." });
      else if (dispatch.receiptId) await runtime.effects.reconcile(ref, { kind: "host-receipt", receiptId: dispatch.receiptId });
      effect = runtime.effects.get(ref);
    }
    return { effect, dispatch };
  } catch (inspectionFailure) {
    // One unreadable receipt stays unknown without hiding unrelated reviews.
    return pending() ?? { effect: runtime.effects.get(ref), dispatch: { state: "unknown" }, inspectionFailure };
  }
}

/** The Node Host may still receive the result of a business action after the Run stops waiting. */
export function actionDispatchReceipts(host: NodeHost, state: Pick<RoundState, "actionReviews">, currentRuntime: () => Runtime | undefined) {
  const active = new Set<Promise<ReviewEffect>>();
  let closed = false;
  const bridged: NodeHost = { ...host, async openDispatch(input) {
    const runtime = currentRuntime();
    const effect = runtime?.effects.get({ kind: "effect", id: input.policyReceipt, revision: 1 });
    const permit = await host.openDispatch(input);
    const origin = effect?.proposal.origin, subject = effect?.proposal.subject;
    if (runtime && effect?.state === "dispatching" && origin?.session && origin.toolCall && subject?.what === "tool"
      && isGatewayChange(subject.name) && effect.proposal.inputFingerprint === permit.fingerprint) {
      state.actionReviews.get(origin.session)?.bindReceipt(effect, async outcome => {
        if (closed) return false;
        const unresolved = runtime.effects.get(effect.ref);
        if (unresolved?.state !== "reconcile-required") return false;
        let receipts = committingReceipts.get(runtime);
        if (!receipts) { receipts = new Map(); committingReceipts.set(runtime, receipts); }
        const unknown: ReviewEffect = { effect: unresolved, dispatch: { state: "unknown" } };
        // Install the fence before any await. Readers must not observe the SDK's provisional in-memory state.
        const commit = Promise.resolve().then(async (): Promise<ReviewEffect> => {
          let proof: DispatchProof = { kind: "known-not-happened", why: "The original Assistant client cancelled before invoking the ActionService." };
          if (outcome === "completed") {
            const receipt = await host.closeDispatch({ permit, ok: true });
            if (receipt.fingerprint !== permit.fingerprint || receipt.ok !== true || !receipt.receiptId) return unknown;
            proof = { kind: "host-receipt", receiptId: receipt.receiptId };
          }
          const saved = await runtime.effects.reconcile(effect.ref, proof);
          if (saved.state !== (outcome === "completed" ? "completed" : "failed")) return unknown;
          return { effect: saved, dispatch: await runtime.effects.inspectDispatch(effect.ref) };
        }).catch(() => unknown);
        receipts.set(effect.ref.id, commit);
        active.add(commit);
        const verified = (await commit).dispatch.state !== "unknown";
        active.delete(commit);
        // Keep a conservative projection after an unconfirmed commit. The next Runtime rehydrates from the durable ledger.
        if (verified) receipts.delete(effect.ref.id);
        return verified;
      });
    }
    return permit;
  } };
  return { host: bridged, async close() { closed = true; await Promise.all(active); } };
}
