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
