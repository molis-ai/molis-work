/** Live tab-strip reorder preview.
 *  State changes stay in tab-workspace-ops; DOM paint stays in the tab-workspace client.
 *  Stringified into the browser factory — keep parameter lists type-annotation-free. */

export const TAB_REORDER_MS = 190;
export const TAB_REORDER_EASE = "cubic-bezier(.16, 1, .3, 1)";

/** Clone state, run the same moveTab the drop handler uses, return dest order. */
export const tabIdsAfterMove = (state: any, ops: any, fromId: string, tabId: string, toId: string, beforeId: string | undefined, copy: boolean) => {
  const next = JSON.parse(JSON.stringify(state));
  ops.moveTab(next, fromId, tabId, toId, beforeId, copy);
  const dest = next.panes.find((pane: { id: string }) => pane.id === toId)
    || next.panes.find((pane: { id: string }) => pane.id === next.focusedPaneId);
  if (!dest) return { paneId: toId, ids: [], movingId: tabId };
  const previous = new Set((state.panes.find((pane: { id: string }) => pane.id === dest.id)?.tabs || []).map((tab: { id: string }) => tab.id));
  const movingId = copy ? dest.tabs.find((tab: { id: string }) => !previous.has(tab.id))?.id || tabId : tabId;
  return { paneId: dest.id, ids: dest.tabs.map((tab: { id: string }) => tab.id), movingId };
};
