import { escapeHtml, type TerminalPaneElements, type TerminalStatus, type TerminalTranslate } from "./client-dom.js";
import type { PanelRecord } from "./types.js";

export type ChildGoalSummary = {
  goal: { goal_id: string; title: string };
  status_label: string;
  status_meaning: string;
  next_action: string;
};

export interface TerminalGuardOptions {
  els: TerminalPaneElements;
  text: TerminalTranslate;
  route(path: string): string;
  goalId(): string;
  setStatus: TerminalStatus;
  closeMenu(): void;
}

/** Whether this page may drive a terminal: a parent Goal is read-only, and a panel answers only to its own Goal. */
export function createTerminalGuard(options: TerminalGuardOptions) {
  const { els, text: L, route, goalId, setStatus } = options;
  const { pane, emptyEl, parentGuardEl, childChoicesEl, addBtn, emptyAddBtn } = els;
  let parentReadOnly = pane.dataset.tuiParentReadOnly === "true";

  const parentReadOnlyMessage = () =>
    L("这条上层 Goal 由子 Goal 共同完成，当前终端只读。请进入具体的子 Goal 查看或继续。");

  const panelBelongsHere = (panel: PanelRecord | null | undefined) =>
    Boolean(panel && panel.goal_id === goalId());

  const canControlPanel = (panel: PanelRecord | null | undefined): panel is PanelRecord => {
    if (parentReadOnly) {
      setStatus(parentReadOnlyMessage(), "error");
      return false;
    }
    if (!panelBelongsHere(panel)) {
      setStatus(
        L("当前页面已经切到另一条 Goal，这个终端不会跟着切换。请回到它所属的 Goal 再操作。"),
        "error",
      );
      return false;
    }
    return true;
  };

  const renderChildChoices = (children: ChildGoalSummary[]) => {
    if (!childChoicesEl) return;
    childChoicesEl.innerHTML = children.length
      ? children.map((child) => `<a class="tui-child-choice" href="${escapeHtml(route(`/goals/${encodeURIComponent(child.goal.goal_id)}`))}">
        <span><strong>${escapeHtml(child.goal.title)}</strong><small>${escapeHtml(child.status_label)} · ${escapeHtml(child.next_action)}</small></span>
        <b>${escapeHtml(L("打开这个子 Goal"))}<svg aria-hidden="true"><use href="#icon-chevron-right"></use></svg></b>
      </a>`).join("")
      : `<p>${escapeHtml(L("还没有可推进的子 Goal，请先检查 Goal 的拆分。"))}</p>`;
  };

  const updateEmptyCopy = (readOnly: boolean) => {
    if (!emptyEl) return;
    if (emptyAddBtn) emptyAddBtn.hidden = readOnly;
    const paragraphs = emptyEl.querySelectorAll("p");
    const title = paragraphs[0]?.querySelector("strong");
    if (title) title.textContent = readOnly ? L("这个上层 Goal 不直接使用终端") : L("还没有终端");
    if (paragraphs[1]) {
      paragraphs[1].textContent = readOnly
        ? L("请从上方进入一个具体的子 Goal。")
        : L("选择常用 Runtime 或自定义命令，在这个 Goal 上开始工作。");
    }
  };

  const setParentGuard = (readOnly: boolean, children: ChildGoalSummary[] = []) => {
    parentReadOnly = readOnly;
    pane.dataset.tuiParentReadOnly = String(readOnly);
    pane.toggleAttribute("data-tui-read-only", readOnly);
    if (parentGuardEl) parentGuardEl.hidden = !readOnly;
    if (readOnly) renderChildChoices(children);
    updateEmptyCopy(readOnly);
    addBtn.disabled = readOnly;
    addBtn.title = readOnly ? L("请进入一个具体的子 Goal") : "";
    if (readOnly) options.closeMenu();
  };

  return { readOnly: () => parentReadOnly, parentReadOnlyMessage, panelBelongsHere, canControlPanel, setParentGuard };
}

export type TerminalGuard = ReturnType<typeof createTerminalGuard>;
