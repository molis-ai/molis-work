/** Drop hit-testing and post-drop preview geometry.
 *  State changes stay in tab-workspace-ops; DOM paint stays in the tab-workspace client.
 *  These functions are stringified into the browser factory — keep parameter lists type-annotation-free. */

export const TAB_SPLIT_EDGE_X = 0.22;
export const TAB_SPLIT_EDGE_Y = 0.24;
/** Same value as splitPane's `ratio: .5` in tab-workspace-ops. Preview reads the tree after that op, not this constant. */
export const TAB_SPLIT_RATIO = 0.5;
/** Visible canvas gap between split panes. */
export const TAB_SASH_GUTTER = 8;
/** Pointer hit strip centered on the gap. */
export const TAB_SASH_HIT = 12;
export const TAB_SASH_INSET = TAB_SASH_GUTTER / 2;
export const TAB_SASH_HALF = TAB_SASH_HIT / 2;
export const TAB_SPLIT_EDGE_X_CSS = `${TAB_SPLIT_EDGE_X * 100}%`;
export const TAB_SPLIT_EDGE_Y_CSS = `${TAB_SPLIT_EDGE_Y * 100}%`;

export const clampSplitRatio = (ratio: number) => Math.min(0.85, Math.max(0.15, ratio || TAB_SPLIT_RATIO));

export const splitDropEdge = (x: number, y: number) => {
  if (x < TAB_SPLIT_EDGE_X) return "left";
  if (x > 1 - TAB_SPLIT_EDGE_X) return "right";
  if (y < TAB_SPLIT_EDGE_Y) return "top";
  if (y > 1 - TAB_SPLIT_EDGE_Y) return "bottom";
  return null;
};

/** Percentage boxes for the current tree. Ignores the sash gutter that syncSplitSizes paints. */
export const layoutPaneBoxes = (node: any, box?: { x: number; y: number; w: number; h: number }): { paneId: string; x: number; y: number; w: number; h: number }[] => {
  if (!box) box = { x: 0, y: 0, w: 100, h: 100 };
  if (!node) return [];
  if (node.paneId) return [{ paneId: node.paneId, x: box.x, y: box.y, w: box.w, h: box.h }];
  const ratio = clampSplitRatio(node.ratio);
  if (node.direction === "row") {
    return layoutPaneBoxes(node.children[0], { x: box.x, y: box.y, w: box.w * ratio, h: box.h })
      .concat(layoutPaneBoxes(node.children[1], { x: box.x + box.w * ratio, y: box.y, w: box.w * (1 - ratio), h: box.h }));
  }
  return layoutPaneBoxes(node.children[0], { x: box.x, y: box.y, w: box.w, h: box.h * ratio })
    .concat(layoutPaneBoxes(node.children[1], { x: box.x, y: box.y + box.h * ratio, w: box.w, h: box.h * (1 - ratio) }));
};

/** Clone state, apply the same drop ops the client uses, then return the pane the drop actually lands in. */
export const focusedPaneBoxAfterDrop = (state: any, ops: any, target: any, copy: boolean, sourcePaneId: string, sourceTabId: string) => {
  if (!target?.paneId || !sourcePaneId || !sourceTabId) return null;
  const next = JSON.parse(JSON.stringify(state));
  ops.normalizeLayout(next);
  if (target.edge) ops.splitPane(next, target.paneId, target.edge, copy ? "copy" : "move", sourcePaneId, sourceTabId);
  else ops.moveTab(next, sourcePaneId, sourceTabId, target.paneId, target.beforeId, copy);
  const holder = !copy && next.panes.find((pane: { tabs?: { id: string }[] }) => pane.tabs?.some((tab: { id: string }) => tab.id === sourceTabId));
  const paneId = holder?.id || next.focusedPaneId;
  const boxes = layoutPaneBoxes(next.layout.tree);
  return boxes.find((item: { paneId: string }) => item.paneId === paneId)
    || boxes.find((item: { paneId: string }) => item.paneId === target.paneId)
    || null;
};

// Where a split's divider may go, and how it settles near the default (specs/visual-ui-experience §drag-split, VUX-24).

/** A layout tree node as the tab workspace stores it: a pane, or a split of two children along a direction. */
export interface SplitNode { paneId?: string; direction?: string; ratio?: number; children?: SplitNode[] }

/**
 * The ratio range a split's divider may take when the split is `size` CSS px long along its direction: each side keeps the
 * room its own panes need (a pane its minimum; a split along the same direction its children's together, with the gap; a
 * split across it its larger child; a pane is 240 px wide or 160 px tall at least, room for its tab strip and a readable
 * column), and never past 15–85 %, the range the drop preview reads. `null` when both sides cannot
 * fit at once: the workspace then takes its narrow layout rather than clamping into an inverted range.
 */
export const splitRatioRange = (node: SplitNode, size: number): [number, number] | null => {
  const need = (item: SplitNode | undefined, direction: string | undefined): number => !item ? 0 : item.paneId ? (direction === "row" ? 240 : 160)
    : item.direction === direction ? need(item.children?.[0], direction) + need(item.children?.[1], direction) + 8
      : Math.max(need(item.children?.[0], direction), need(item.children?.[1], direction));
  const low = Math.max(0.15, need(node.children?.[0], node.direction) / size), high = Math.min(0.85, 1 - need(node.children?.[1], node.direction) / size);
  return size > 0 && low <= high ? [low, high] : null;
};

/** Every split in the tree fits at the stage's size (`width` × `height` CSS px); false when one would invert its range. */
export const splitTreeFits = (node: SplitNode | undefined, width: number, height: number): boolean => {
  if (!node || node.paneId) return true;
  const range = splitRatioRange(node, node.direction === "row" ? width : height);
  if (!range) return false;
  const ratio = Math.min(range[1], Math.max(range[0], node.ratio || 0.5));
  return node.direction === "row"
    ? splitTreeFits(node.children?.[0], width * ratio, height) && splitTreeFits(node.children?.[1], width * (1 - ratio), height)
    : splitTreeFits(node.children?.[0], width, height * ratio) && splitTreeFits(node.children?.[1], width, height * (1 - ratio));
};

/**
 * Snap with hysteresis: within 8 CSS px of `target` the divider settles on it, and once settled it stays until the pointer is
 * 16 px away, so a hand resting near the default does not make the edge flicker between the two.
 */
export const snapSplitRatio = (ratio: number, target: number, snapped: boolean, size: number): { ratio: number; snapped: boolean } => {
  const away = Math.abs(ratio - target) * size;
  const settle = snapped ? away <= 16 : away <= 8;
  return { ratio: settle ? target : ratio, snapped: settle };
};
