import { createTerminalPanels } from "./panels.js";
import type { PanelRecord } from "./types.js";
import { createTerminalAutofill } from "./autofill.js";
import { createTerminalScreens } from "./screens.js";
import xtermCss from "@xterm/xterm/css/xterm.css";

type ChildGoalSummary = {
  goal: { goal_id: string; title: string };
  status_label: string;
  status_meaning: string;
  next_action: string;
};

type GoalChangedDetail = {
  goalId?: string;
  goalTitle?: string;
  status?: string;
  statusLabel?: string;
  statusMeaning?: string;
  statusIconMarkup?: string;
  parentReadOnly?: boolean;
  children?: ChildGoalSummary[];
};

declare global {
  interface Window {
    L?: (zh: string, vars?: Record<string, string | number>) => string;
    molisWorkControlHeaders?: () => Record<string, string>;
  }
}

export function startWorkTerminalClient() {
  const style = document.createElement("style");
  style.textContent = String(xtermCss);
  document.head.appendChild(style);

  const pane = document.querySelector("[data-tui-pane]") as HTMLElement | null;
  if (pane) {
    const tabsEl = pane.querySelector("[data-tui-tabs]") as HTMLElement;
    const terminalHost = pane.querySelector("[data-tui-terminal]") as HTMLElement;
    const emptyEl = pane.querySelector("[data-tui-empty]") as HTMLElement | null;
    const statusEl = pane.querySelector("[data-tui-status]") as HTMLElement | null;
    const ownerTitleEl = pane.querySelector("[data-tui-owner-title]") as HTMLElement | null;
    const ownerStatusEl = pane.querySelector("[data-tui-owner-status]") as HTMLElement | null;
    const parentGuardEl = pane.querySelector("[data-tui-parent-guard]") as HTMLElement | null;
    const childChoicesEl = pane.querySelector("[data-tui-child-choices]") as HTMLElement | null;
    const menu = pane.querySelector("[data-tui-menu]") as HTMLFormElement;
    const advanceBtn = pane.querySelector("[data-tui-advance]") as HTMLButtonElement;
    const copyBtn = pane.querySelector("[data-tui-copy]") as HTMLButtonElement | null;
    const fillBtn = pane.querySelector("[data-tui-fill]") as HTMLButtonElement;
    const reopenBtn = pane.querySelector("[data-tui-reopen]") as HTMLButtonElement;
    const addBtn = pane.querySelector("[data-tui-add]") as HTMLButtonElement;
    const emptyAddBtn = pane.querySelector<HTMLButtonElement>("[data-tui-empty-add]");
    let menuReturnTarget = addBtn;
    const genericFields = menu.querySelector("[data-tui-generic-fields]") as HTMLElement | null;
    const genericOpen = menu.querySelector("[data-tui-generic-open]") as HTMLButtonElement | null;
    const L = window.L ?? ((zh: string) => zh);
    const routePrefix = document.body.dataset.routePrefix || "";
    const route = (pathname: string) => routePrefix + pathname;

    const screens = createTerminalScreens({
      host: terminalHost,
      onInput: (panelId, data) => {
        const panel = panelController.panels.find((item) => item.panel_id === panelId);
        if (!canControlPanel(panel)) return;
        if (pendingOnboardingAutofill() && /[\r\n]/.test(data)) {
          const pendingSession = screens.get(panelId);
          if (pendingSession) pendingSession.recentOutput = "";
          window.setTimeout(() => void fillPendingOnboardingContext(), 420);
        }
        void sendPty({ type: "write", panelId, data }).catch((error) => setStatus(errorText(error), "error"));
      },
    });
    const terminalVisibleOutput = screens.visibleOutput;
    let selectedKind = (menu.querySelector("[data-tui-kind]:not(:disabled)") as HTMLButtonElement | null)?.dataset.tuiKind || "generic";
    let promptCache = "";
    let parentReadOnly = pane.dataset.tuiParentReadOnly === "true";


    const headers = () => ({
      "content-type": "application/json",
      "x-molis-work-desktop": "1",
      ...(window.molisWorkControlHeaders?.() ?? {}),
    });
    const desktopHeaders = () => ({
      "x-molis-work-desktop": "1",
      ...(window.molisWorkControlHeaders?.() ?? {}),
    });

    const goalId = () => pane.dataset.goalId || "";

    const resumeId = () => String(new FormData(menu).get("resume_session_id") || "").trim() || undefined;

    const setKind = (kind: string) => {
      selectedKind = kind;
      if (genericFields) genericFields.hidden = kind !== "generic";
      if (genericOpen) genericOpen.hidden = kind !== "generic";
      menu.querySelectorAll("[data-tui-kind]").forEach((button) => {
        button.classList.toggle("is-selected", (button as HTMLElement).dataset.tuiKind === kind);
      });
    };

    const refreshRuntimeAvailability = async () => {
      const response = await fetch(route("/api/runtime-availability"), { headers: desktopHeaders() });
      if (!response.ok) return;
      const availability = await response.json() as Record<string, boolean>;
      menu.querySelectorAll<HTMLButtonElement>("[data-tui-kind]:not([data-tui-kind=generic])").forEach((button) => {
        const kind = button.dataset.tuiKind ?? "";
        const available = availability[kind] !== false;
        button.disabled = !available;
        if (available) {
          button.removeAttribute("title");
          button.querySelector("small")?.remove();
          return;
        }
        button.title = L("需要先安装 CLI");
        if (!button.querySelector("small")) {
          const hint = document.createElement("small");
          hint.textContent = L("未安装");
          button.append(hint);
        }
      });
      if ((menu.querySelector(`[data-tui-kind="${selectedKind}"]`) as HTMLButtonElement | null)?.disabled) {
        setKind((menu.querySelector("[data-tui-kind]:not(:disabled)") as HTMLButtonElement | null)?.dataset.tuiKind ?? "generic");
      }
    };

    const setStatus = (text: string, tone: "idle" | "busy" | "live" | "error" = "idle") => {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.dataset.tone = text ? tone : "";
    };

    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    const showPageToast = (message: string, error = false) => {
      const toast = document.querySelector("[data-toast]") as HTMLElement | null;
      if (!toast) {
        setStatus(message, error ? "error" : "idle");
        return;
      }
      toast.textContent = message;
      toast.classList.toggle("is-error", error);
      toast.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
    };

    const setMenuOpen = (open: boolean) => {
      if (open && parentReadOnly) {
        setStatus(L("请进入一个具体的子 Goal"), "error");
        return;
      }
      menu.classList.toggle("is-open", open);
      menu.setAttribute("aria-hidden", String(!open));
      addBtn.setAttribute("aria-expanded", String(open));
      emptyAddBtn?.setAttribute("aria-expanded", String(open));
      if (open) {
        menu.removeAttribute("inert");
        setKind(selectedKind);
        requestAnimationFrame(() => {
          if (menu.classList.contains("is-open")) (menu.querySelector(`[data-tui-kind="${selectedKind}"]`) as HTMLButtonElement | null)?.focus();
        });
        return;
      }
      menu.setAttribute("inert", "");
    };

    const errorText = (error: unknown) => {
      if (error instanceof Error && error.message) return error.message;
      if (typeof error === "string" && error) return error;
      if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
      return String(error);
    };

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
      if (readOnly) setMenuOpen(false);
    };

    const controlToken = () =>
      document.querySelector('meta[name="molis-work-control-token"]')?.getAttribute("content") || "";

    const panelController = createTerminalPanels({
      screens, goalId,
      parentReadOnly: () => parentReadOnly,
      parentReadOnlyMessage,
      canControlPanel,
      text: L, errorText, route, headers, desktopHeaders, controlToken,
      setStatus, setMenuOpen,
      renderTabs: () => renderTabs(),
      showTerminal: (panelId) => showTerminal(panelId),
      onOutput: () => {
        if (pendingOnboardingAutofill()) window.setTimeout(() => void fillPendingOnboardingContext(), 240);
      },
      afterOpened: () => fillPendingFeedContext(),
    });
    const { current, loadPanels, openPanel, closePanel, connect: connectPty, send: sendPty } = panelController;

    const renderTabs = () => {
      tabsEl.innerHTML = panelController.panels.map((panel) => {
        const active = panel.panel_id === panelController.activeId ? " is-active" : "";
        const exited = panel.status === "exited" ? " is-exited" : "";
        const close = parentReadOnly
          ? `<small class="tui-tab-readonly">${escapeHtml(L("只读"))}</small>`
          : `<span class="tui-tab-close" data-tui-close="${escapeHtml(panel.panel_id)}" aria-label="${escapeHtml(L("关闭终端"))}"><svg aria-hidden="true"><use href="#icon-x"></use></svg></span>`;
        return `<button class="tui-tab${active}${exited}" type="button" data-tui-select="${escapeHtml(panel.panel_id)}" title="${escapeHtml(`${ownerTitleEl?.textContent || L("当前 Goal")} · ${panel.title}`)}"><span class="tui-tab-title">${escapeHtml(panel.title)}</span>${close}</button>`;
      }).join("");
    };

    const showTerminal = (panelId: string | null) => {
      for (const [id, session] of screens.entries()) {
        session.wrapper.hidden = id !== panelId;
      }
      if (emptyEl) emptyEl.hidden = panelController.panels.length > 0;
      const panel = current();
      const live = Boolean(panelId && panelController.isAlive(panelId));
      const readOnly = parentReadOnly || Boolean(panel && !panelBelongsHere(panel));
      advanceBtn.disabled = !live || readOnly;
      if (copyBtn) copyBtn.disabled = readOnly || !goalId();
      fillBtn.disabled = !live || readOnly;
      reopenBtn.hidden = !(panel && !live && !readOnly);
      if (!panel) setStatus("");
      else if (parentReadOnly) setStatus(L("历史终端只读；请到具体的子 Goal 继续。"));
      else if (!panelBelongsHere(panel)) setStatus(L("这个终端属于另一条 Goal，当前不可操作。"), "error");
      else if (live) setStatus(L("终端已连接"), "live");
      else setStatus(L("终端进程已不在，可重新打开"));
      if (panelId && screens.has(panelId)) {
        const session = screens.get(panelId)!;
        requestAnimationFrame(() => {
          session.fit.fit();
          if (live) session.term.focus();
        });
      }
    };

    const writePrompt = async (send: boolean, feedItemId?: string, onboarding = false) => {
      const panel = current();
      if (!canControlPanel(panel)) return;
      const text = await loadAdvancePrompt(panel.goal_id, feedItemId, onboarding);
      const fillText = text
        .replace(/[\r\n]+/g, " ⏎ ")
        .replace(/[\u0000-\u001f\u007f]/g, " ");
      await sendPty({ type: "write", panelId: panel.panel_id, data: send ? `${fillText}\r` : fillText });
    };

    const { fillPendingFeedContext, fillPendingOnboardingContext, pendingOnboardingAutofill } = createTerminalAutofill({
      goalId,
      parentReadOnly: () => parentReadOnly,
      text: L,
      errorText,
      terminal: {
        current,
        isAlive: (panelId) => panelController.isAlive(panelId),
        output: (panelId) => screens.get(panelId),
        visibleOutput: terminalVisibleOutput,
        open: openPanel,
        writePrompt,
      },
      setStatus,
      setMenuOpen,
      showToast: showPageToast,
    });

    const loadAdvancePrompt = async (requestedGoalId?: string, feedItemId?: string, onboarding = false) => {
      const id = requestedGoalId || goalId();
      if (!id) throw new Error(L("打开失败"));
      if (parentReadOnly) throw new Error(parentReadOnlyMessage());
      if (requestedGoalId && requestedGoalId !== goalId()) {
        throw new Error(L("当前页面已经切到另一条 Goal，请回到终端所属的 Goal 再操作。"));
      }
      const query = new URLSearchParams();
      if (feedItemId) query.set("feed_item_id", feedItemId);
      if (onboarding) query.set("onboarding", "1");
      const queryText = query.size ? `?${query.toString()}` : "";
      const response = await fetch(route(`/api/goals/${encodeURIComponent(id)}/advance-prompt${queryText}`), {
        cache: "no-store",
        headers: desktopHeaders(),
      });
      const payload = await response.json() as { prompt?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || L("打开失败"));
      const text = payload.prompt || promptCache;
      if (!text) throw new Error(L("打开失败"));
      promptCache = text;
      return text;
    };

    const copyAdvancePrompt = async () => {
      const text = await loadAdvancePrompt();
      try {
        await navigator.clipboard.writeText(text);
        showPageToast(L("命令已复制到剪贴板"));
      } catch {
        showPageToast(L("无法访问剪贴板，请手动复制"), true);
      }
    };

    emptyAddBtn?.addEventListener("click", () => {
      menuReturnTarget = emptyAddBtn;
      setMenuOpen(true);
    });
    addBtn.addEventListener("click", () => {
      menuReturnTarget = addBtn;
      if (parentReadOnly) {
        setStatus(parentReadOnlyMessage(), "error");
        return;
      }
      setMenuOpen(!menu.classList.contains("is-open"));
    });
    menu.querySelector("[data-tui-menu-cancel]")?.addEventListener("click", () => {
      setMenuOpen(false);
      menuReturnTarget.focus();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!menu.classList.contains("is-open")) return;
      const target = event.target as Node;
      if (menu.contains(target) || addBtn.contains(target) || emptyAddBtn?.contains(target)) return;
      setMenuOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !menu.classList.contains("is-open")) return;
      event.preventDefault();
      setMenuOpen(false);
      menuReturnTarget.focus();
    });
    menu.querySelectorAll("[data-tui-kind]").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = (button as HTMLElement).dataset.tuiKind || "generic";
        setKind(kind);
        if (kind === "generic") {
          menu.querySelector<HTMLInputElement>("input[name=command]")?.focus();
          return;
        }
        void openPanel({
          runtime_kind: kind,
          resume_session_id: resumeId(),
        });
      });
    });
    menu.addEventListener("submit", (event) => {
      event.preventDefault();
      const command = String(new FormData(menu).get("command") || "").trim();
      void openPanel({
        runtime_kind: selectedKind,
        command: selectedKind === "generic" ? command : undefined,
        resume_session_id: resumeId(),
      });
    });
    tabsEl.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const closeId = target.closest("[data-tui-close]")?.getAttribute("data-tui-close");
      if (closeId) {
        event.preventDefault();
        void closePanel(closeId);
        return;
      }
      const selectId = target.closest("[data-tui-select]")?.getAttribute("data-tui-select");
      if (selectId) {
        panelController.select(selectId);
      }
    });
    advanceBtn.addEventListener("click", () => { void writePrompt(true).catch((error) => setStatus(errorText(error), "error")); });
    copyBtn?.addEventListener("click", () => { void copyAdvancePrompt().catch((error) => setStatus(errorText(error), "error")); });
    fillBtn.addEventListener("click", () => { void writePrompt(false).catch((error) => setStatus(errorText(error), "error")); });
    reopenBtn.addEventListener("click", () => {
      void panelController.reopenPanel().catch((error) => setStatus(errorText(error), "error"));
    });

    document.addEventListener("molis-work:goal-changed", (event) => {
      const detail = (event as CustomEvent<GoalChangedDetail>).detail;
      if (ownerTitleEl && detail?.goalTitle) ownerTitleEl.textContent = detail.goalTitle;
      if (ownerStatusEl) {
        const status = detail?.status ?? "";
        const label = ownerStatusEl.querySelector("[data-tui-owner-status-label]");
        if (label) label.textContent = detail?.statusLabel ?? "";
        ownerStatusEl.hidden = !detail?.statusLabel;
        ownerStatusEl.title = detail?.statusMeaning ?? "";
        [...ownerStatusEl.classList]
          .filter((className) => className.startsWith("goal-status--"))
          .forEach((className) => ownerStatusEl.classList.remove(className));
        if (/^[a-z_]+$/.test(status)) ownerStatusEl.classList.add(`goal-status--${status}`);
        if (detail?.statusIconMarkup) {
          const template = document.createElement("template");
          template.innerHTML = detail.statusIconMarkup.trim();
          const nextIcon = template.content.firstElementChild;
          const currentIcon = ownerStatusEl.querySelector(":scope > svg");
          if (nextIcon?.tagName.toLowerCase() === "svg") {
            if (currentIcon) currentIcon.replaceWith(nextIcon);
            else ownerStatusEl.prepend(nextIcon);
          }
        }
      }
      promptCache = "";
      setParentGuard(Boolean(detail?.parentReadOnly), detail?.children ?? []);
      panelController.resetGoal();
    });

    document.addEventListener("molis-work:goal-document-loaded", (event) => {
      const detail = (event as CustomEvent<{ goalId?: string }>).detail;
      if (!detail?.goalId || detail.goalId !== goalId()) return;
      void loadPanels();
    });

    new ResizeObserver(() => {
      if (panelController.activeId && screens.has(panelController.activeId)) {
        const session = screens.get(panelController.activeId)!;
        session.fit.fit();
        const size = session.fit.proposeDimensions();
        if (size) void sendPty({ type: "resize", panelId: panelController.activeId, cols: size.cols, rows: size.rows }).catch(() => undefined);
      }
    }).observe(terminalHost);

    terminalHost.addEventListener("pointerdown", () => {
      if (panelController.activeId && screens.has(panelController.activeId)) screens.get(panelController.activeId)!.term.focus();
    });

    window.addEventListener("beforeunload", () => {
      panelController.stop();
    });

    void (async () => {
      void refreshRuntimeAvailability().catch(() => undefined);
      try {
        await connectPty();
      } catch (error) {
        setStatus(errorText(error), "error");
      }
      await loadPanels();
      await fillPendingOnboardingContext();
    })();
  }

}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
