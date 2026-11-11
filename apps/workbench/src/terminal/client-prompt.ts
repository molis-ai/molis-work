import { SUBJECT_CONTEXT_PATH, type SubjectContextAnswer } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { TerminalTranslate } from "./client-dom.js";
import type { TerminalGuard } from "./client-guard.js";
import type { PanelRecord, TerminalRequest } from "./types.js";

export interface AdvancePromptOptions {
  text: TerminalTranslate;
  route(path: string): string;
  request: TerminalRequest;
  goalId(): string;
  /** The prompt's route with `:goalId` for the Goal's id, as the pane was given it: this client names no plugin. */
  promptRoute(): string;
  guard: TerminalGuard;
  current(): PanelRecord | null;
  sendPty(message: Record<string, unknown>): Promise<void>;
  copyBtn: HTMLButtonElement | null;
  showToast(message: string, error?: boolean): void;
}

/**
 * The "advance this Goal" prompt: read from the route the pane names, typed into the live panel (never sent unless asked), or copied.
 * Before it, the text the project's plugins keep about this Goal is read as the person (GAS-01) and handed to the prompt, which binds it
 * as untrusted data; without that text the prompt is the Goal's own. Each read names the one Goal, so another Goal's text never comes.
 */
export function createAdvancePrompt(options: AdvancePromptOptions) {
  const { text: L, route, goalId, promptRoute, guard } = options;
  let promptCache: { goalId: string; text: string } | null = null;

  const sourceContexts = (id: string) => options.request<SubjectContextAnswer | null>(
    route(`${SUBJECT_CONTEXT_PATH}?kind=goal&id=${encodeURIComponent(id)}`), { fallback: L("打开失败") },
  ).then(answer => answer?.contexts ?? [], () => []);

  const loadAdvancePrompt = async (requestedGoalId?: string) => {
    const id = requestedGoalId || goalId(), path = promptRoute();
    if (!id || !path) throw new Error(L("打开失败"));
    if (guard.readOnly()) throw new Error(guard.parentReadOnlyMessage());
    if (requestedGoalId && requestedGoalId !== goalId()) {
      throw new Error(L("当前页面已经切到另一条 Goal，请回到终端所属的 Goal 再操作。"));
    }
    const contexts = await sourceContexts(id);
    const payload = await options.request<{ prompt?: string } | null>(
      route(path.replace(":goalId", encodeURIComponent(id))),
      { method: "POST", body: contexts.length ? { source_contexts: contexts } : {}, fallback: L("打开失败") },
    );
    const text = payload?.prompt || (promptCache?.goalId === id ? promptCache.text : "");
    if (!text) throw new Error(L("打开失败"));
    promptCache = { goalId: id, text };
    return text;
  };

  const writePrompt = async (send: boolean) => {
    const panel = options.current();
    if (!guard.canControlPanel(panel)) return;
    const text = await loadAdvancePrompt(panel.goal_id);
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

  return { writePrompt, copyAdvancePrompt, resetCache: () => { promptCache = null; } };
}
