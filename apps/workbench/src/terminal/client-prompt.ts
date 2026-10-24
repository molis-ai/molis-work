import type { TerminalTranslate } from "./client-dom.js";
import type { TerminalGuard } from "./client-guard.js";
import type { PanelRecord, TerminalRequest } from "./types.js";

export interface AdvancePromptOptions {
  text: TerminalTranslate;
  route(path: string): string;
  request: TerminalRequest;
  goalId(): string;
  guard: TerminalGuard;
  current(): PanelRecord | null;
  sendPty(message: Record<string, unknown>): Promise<void>;
  copyBtn: HTMLButtonElement | null;
  showToast(message: string, error?: boolean): void;
}

/** The "advance this Goal" prompt: read from the Host, typed into the live panel (never sent unless asked), or copied. */
export function createAdvancePrompt(options: AdvancePromptOptions) {
  const { text: L, route, goalId, guard } = options;
  let promptCache = "";

  const loadAdvancePrompt = async (requestedGoalId?: string, feedItemId?: string) => {
    const id = requestedGoalId || goalId();
    if (!id) throw new Error(L("打开失败"));
    if (guard.readOnly()) throw new Error(guard.parentReadOnlyMessage());
    if (requestedGoalId && requestedGoalId !== goalId()) {
      throw new Error(L("当前页面已经切到另一条 Goal，请回到终端所属的 Goal 再操作。"));
    }
    const query = new URLSearchParams();
    if (feedItemId) query.set("feed_item_id", feedItemId);
    const queryText = query.size ? `?${query.toString()}` : "";
    const payload = await options.request<{ prompt?: string } | null>(
      route(`/api/goals/${encodeURIComponent(id)}/advance-prompt${queryText}`),
      { fallback: L("打开失败") },
    );
    const text = payload?.prompt || promptCache;
    if (!text) throw new Error(L("打开失败"));
    promptCache = text;
    return text;
  };

  const writePrompt = async (send: boolean, feedItemId?: string) => {
    const panel = options.current();
    if (!guard.canControlPanel(panel)) return;
    const text = await loadAdvancePrompt(panel.goal_id, feedItemId);
    const fillText = text
      .replace(/[\r\n]+/g, " ⏎ ")
      .replace(/[\u0000-\u001f\u007f]/g, " ");
    await options.sendPty({ type: "write", panelId: panel.panel_id, data: send ? `${fillText}\r` : fillText });
  };

  const copyAdvancePrompt = async () => {
    const text = await loadAdvancePrompt();
    const { copyBtn } = options;
    const copied = copyBtn && window.molisCopy ? await window.molisCopy(copyBtn, text, { done: L("已复制"), failed: L("复制失败") })
      : await navigator.clipboard.writeText(text).then(() => true, () => false);
    if (!copied) options.showToast(L("无法访问剪贴板，请手动复制"), true);
  };

  return { writePrompt, copyAdvancePrompt, resetCache: () => { promptCache = ""; } };
}
