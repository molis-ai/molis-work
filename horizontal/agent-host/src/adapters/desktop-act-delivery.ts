import type { HostSurfaceActReceipt } from "@molis-ai/molis-work-contracts/services/ui-surfaces";

/**
 * The one picture for this desktop step, when the tree was not enough.
 * A complete tree returns nothing, so the model is not sent a picture on every step.
 */
export function deliverDesktopAct(receipt: HostSurfaceActReceipt | void): { readonly image: Uint8Array } | void {
  if (!receipt?.model_image) return;
  return { image: receipt.model_image };
}
