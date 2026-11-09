// The state ring's values (DESIGN.md「状态环」), published through the `platform/ui` subpath like `ui-text.ts`. A contract that names a
// state (the presentation declaration's `status.map`, specs/shared-sources-and-surfaces §5) imports it from here, because the contracts
// never import the SDK. What a ring looks like (geometry, paths, icons and the words under it) stays in the SDK's `/ui`.

/** Each family is one look; its `states` are the names a caller may write for it, the family's own key among them. Visual aliases only: callers retain their business state and label. */
export const STATE_RING_FAMILIES = [
  {"key": "idle", "label": "未开始", "states": ["idle"]},
  {"key": "connected", "label": "已就绪", "states": ["ready", "connected"]},
  {"key": "running", "label": "进行 / 执行", "states": ["doing", "starting", "running", "generating", "saving", "indexing"]},
  {"key": "done", "label": "完成 / 已保存", "states": ["done", "saved", "round-ended", "staged"]},
  {"key": "waiting", "label": "排队 / 等待", "states": ["queued", "waiting"]},
  {"key": "answer", "label": "等你处理", "states": ["answer", "approval", "reauth"]},
  {"key": "paused", "label": "暂停 / 停止", "states": ["paused", "stopped", "cancelled", "disabled"]},
  {"key": "blocked", "label": "无法继续", "states": ["blocked", "unavailable", "quarantined"]},
  {"key": "syncing", "label": "同步中", "states": ["syncing"]},
  {"key": "retrying", "label": "重试中", "states": ["retrying"]},
  {"key": "failed", "label": "失败", "states": ["failed"]},
  {"key": "partial", "label": "部分完成", "states": ["partial"]},
  {"key": "interrupted", "label": "已中断", "states": ["interrupted"]},
  {"key": "verify", "label": "需要核对", "states": ["verify", "conflict"]},
  {"key": "stale", "label": "已过时", "states": ["stale"]},
  {"key": "disconnected", "label": "已断开", "states": ["disconnected"]},
  {"key": "unsaved", "label": "待整理 / 写入", "states": ["unsaved", "draft", "unstaged", "untracked"]},
  {"key": "unread", "label": "未读", "states": ["unread"]},
  {"key": "read", "label": "已读", "states": ["read"]},
  {"key": "archived", "label": "已收存", "states": ["archived", "material"]},
  {"key": "trashed", "label": "回收站", "states": ["trashed"]},
] as const;

export type StateRingFamily = typeof STATE_RING_FAMILIES[number]["key"];
export type StateRingState = typeof STATE_RING_FAMILIES[number]["states"][number];
