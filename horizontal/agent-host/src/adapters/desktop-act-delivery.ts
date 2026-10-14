import type { HostSurfaceActReceipt } from "@molis-ai/molis-work-contracts/services/ui-surfaces";

/**
 * The vendored computer-use package cannot take one picture in the middle of a turn, and its action has no node id.
 * A step that prepared a picture stops here. It is not turned into a picture on every step.
 */
export const DESKTOP_NODE_ID_GAP = "当前 Prologue 包的 surface-act 没有节点标识，模型发不出「点这个节点」。带了节点标识的动作会在注入前按当时的树重算落点。";

export function deliverDesktopAct(receipt: HostSurfaceActReceipt | void): void {
  if (!receipt?.model_image) return;
  throw new Error("这一步的窗口图已经准备好，但当前的 Prologue 包不能在一轮中途收下这一张图。这一步停在这里，没有改成每一步都发图。");
}
