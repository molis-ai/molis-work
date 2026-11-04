import { STATE_RING_FAMILIES, type StateRingFamily, type StateRingState } from "@molis-ai/molis-work-contracts/platform/ui";

// The ring's values belong to the contracts so a declaration (presentation `status.map`) can name them; the SDK keeps the labels and drawing.
export { STATE_RING_FAMILIES, type StateRingFamily, type StateRingState };

export const STATE_RING_LABELS: Record<StateRingState, string> = {
  "idle": "未开始",
  "ready": "可继续",
  "doing": "进行中",
  "done": "已完成",
  "stopped": "已停止",
  "cancelled": "已取消",
  "queued": "排队中",
  "waiting": "等待中",
  "answer": "等你回答",
  "approval": "等你审查",
  "paused": "已暂停",
  "blocked": "受阻",
  "starting": "准备中",
  "running": "执行中",
  "generating": "生成中",
  "saving": "保存中",
  "syncing": "同步中",
  "indexing": "索引中",
  "retrying": "重试中",
  "failed": "失败",
  "interrupted": "已中断",
  "partial": "部分完成",
  "verify": "结果待核对",
  "stale": "已过时",
  "conflict": "有冲突",
  "connected": "已连接",
  "disconnected": "已断开",
  "reauth": "需要授权",
  "unavailable": "不可用",
  "disabled": "已停用",
  "quarantined": "已隔离",
  "unsaved": "未保存",
  "saved": "已保存",
  "unread": "未读",
  "read": "已读",
  "archived": "已归档",
  "trashed": "回收站",
  "round-ended": "本轮结束",
  "draft": "草稿",
  "material": "已存资料",
  "staged": "已暂存",
  "unstaged": "未暂存",
  "untracked": "未跟踪"
};

export const STATE_RING_ICON_STATES = {
  "status-todo": "idle", "status-progress": "doing", "status-waiting": "waiting",
  "status-needs-you": "answer", "status-blocked": "blocked", "status-done": "done", "status-cancelled": "cancelled",
} as const;

export function stateRingFamily(state: StateRingState): StateRingFamily {
  return STATE_RING_FAMILIES.find(family => family.states.some(id => id === state))!.key;
}
