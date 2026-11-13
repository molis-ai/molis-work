import type { ExactRef, Runtime } from "@prologue/sdk";

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
