import type { TreeNode } from "./computer-driver.js";

/** A coordinate from an accessibility-tree look is not reused after this long. */
export const OBSERVATION_TTL_MS = 10_000;

const CONTAINERS = new Set(["AXGroup", "AXScrollArea", "AXWindow", "AXToolbar", "AXList", "AXTable", "AXOutline", "AXWebArea"]);

export function observationExpired(observedAt: number | null, now: number): boolean {
  return observedAt !== null && now - observedAt > OBSERVATION_TTL_MS;
}

/** A control the model can be asked to hit: a real frame, enabled, and not a label or a container. */
export function nodeIsClickable(node: TreeNode): boolean {
  const frame = node.frame;
  if (!frame || frame[2] <= 0 || frame[3] <= 0 || node.disabled) return false;
  if (node.role === "AXStaticText" || CONTAINERS.has(node.role)) return false;
  return true;
}

/** Why a window picture would be offered: the tree was cut, or nothing in it can be clicked. A complete tree offers none. */
export function modelImageReason(nodes: readonly TreeNode[], cut: boolean): "truncated" | "no-clickable" | null {
  if (cut) return "truncated";
  if (!nodes.some(nodeIsClickable)) return "no-clickable";
  return null;
}

type NodeTree = { nodes: TreeNode[] };

/**
 * The center of node `[index]` in the tree just read, relative to the window's origin.
 * The index is the one the tree text shows. A missing node is not clicked at an older coordinate.
 */
export function pointerFromNode(nodeId: string, tree: NodeTree, windowFrame: readonly [number, number, number, number]): { x: number; y: number } {
  const index = Number(/^\[?(\d+)\]?$/u.exec(nodeId.trim())?.[1] ?? "");
  const node = Number.isInteger(index) && index >= 1 ? tree.nodes[index - 1] : undefined;
  const frame = node?.frame;
  if (!frame || frame[2] <= 0 || frame[3] <= 0) throw new Error("这个节点已经不在当前窗口里，请重新观察");
  const [ox, oy] = windowFrame;
  return { x: Math.round(frame[0] - ox + frame[2] / 2), y: Math.round(frame[1] - oy + frame[3] / 2) };
}
