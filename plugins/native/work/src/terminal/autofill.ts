export interface TerminalAutofillOptions {
  goalId(): string;
  parentReadOnly(): boolean;
  text(value: string): string;
  errorText(error: unknown): string;
  terminal: {
    current(): { panel_id: string } | null;
    isAlive(panelId: string): boolean;
    output(panelId: string): { hasOutput: boolean; lastOutputAt: number } | undefined;
    visibleOutput(panelId: string): string;
    open(body: Record<string, unknown>): Promise<void>;
    writePrompt(send: boolean, feedItemId?: string, onboarding?: boolean): Promise<void>;
  };
  setStatus(text: string, state?: "busy" | "live" | "error"): void;
  setMenuOpen(open: boolean): void;
  showToast(text: string): void;
}

/** Fill pending context into a ready terminal; never confirm startup or send it for the user. */
export function createTerminalAutofill(options: TerminalAutofillOptions) {
  const { goalId, terminal, text: L, errorText, setStatus, setMenuOpen, showToast: showPageToast } = options;
  const { current, visibleOutput: terminalVisibleOutput, open: openPanel, writePrompt } = terminal;
  let feedAutofillInFlight = false;
  let onboardingAutofillInFlight = false;

  const feedAutofillKey = () => `molis-work-feed-runtime-autofill:${goalId()}`;

  const onboardingAutofillKey = () => `molis-work-onboarding-runtime-autofill:${goalId()}`;

  const postOnboardingRuntimeState = (type: "molis-work:onboarding-runtime-ready" | "molis-work:onboarding-runtime-waiting" | "molis-work:onboarding-runtime-error", message?: string) => {
    if (new URLSearchParams(location.search).get("onboarding-embed") !== "1" || window.parent === window) return;
    window.parent.postMessage({ type, goalId: goalId(), message }, location.origin);
  };

  const pendingOnboardingAutofill = () => {
    const key = onboardingAutofillKey();
    if (!goalId()) return false;
    try {
      const pending = JSON.parse(sessionStorage.getItem(key) || "null") as {
        runtimeKind?: string;
        workspacePath?: string;
        at?: number;
      } | null;
      if (!pending) return false;
      if (pending.at && Date.now() - pending.at > 30 * 60 * 1000) {
        sessionStorage.removeItem(key);
        return false;
      }
      const runtimeKind = typeof pending.runtimeKind === "string" ? pending.runtimeKind.trim() : "";
      const workspacePath = typeof pending.workspacePath === "string" ? pending.workspacePath.trim() : "";
      if (!runtimeKind || !workspacePath) {
        sessionStorage.removeItem(key);
        return false;
      }
      return { runtimeKind, workspacePath, startedAt: typeof pending.at === "number" ? pending.at : Date.now() };
    } catch {
      sessionStorage.removeItem(key);
      return false;
    }
  };

  const pendingFeedAutofill = () => {
    const key = feedAutofillKey();
    if (!goalId()) return false;
    try {
      const pending = JSON.parse(sessionStorage.getItem(key) || "null") as { itemId?: string; at?: number } | null;
      if (!pending) return false;
      if (pending.at && Date.now() - pending.at > 30 * 60 * 1000) {
        sessionStorage.removeItem(key);
        return false;
      }
      if (typeof pending.itemId !== "string" || !pending.itemId.trim()) {
        sessionStorage.removeItem(key);
        return false;
      }
      return { itemId: pending.itemId.trim() };
    } catch {
      sessionStorage.removeItem(key);
      return false;
    }
  };

  const waitForTerminalOutput = async (panelId: string, timeoutMs = 2_000, quietMs = 320) => {
    const deadline = Date.now() + timeoutMs;
    while (
      terminal.output(panelId) !== undefined &&
      terminal.isAlive(panelId) &&
      !terminal.output(panelId)?.hasOutput &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    if (!terminal.output(panelId)?.hasOutput) return false;
    while (
      terminal.output(panelId) !== undefined &&
      terminal.isAlive(panelId) &&
      Date.now() - (terminal.output(panelId)?.lastOutputAt ?? 0) < quietMs &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return Date.now() - (terminal.output(panelId)?.lastOutputAt ?? 0) >= quietMs;
  };

  const terminalIsWaitingForStartupConfirmation = (panelId: string) =>
    /do you trust the contents of this directory|press enter to (?:continue|confirm)|confirm you trust|trust this (?:folder|directory|workspace)|hooks need review/i.test(terminalVisibleOutput(panelId));

  const terminalShowsReadyPrompt = (panelId: string, runtimeKind: string) => {
    if (runtimeKind !== "codex") return true;
    return /ask codex to do anything/i.test(terminalVisibleOutput(panelId));
  };

  const fillPendingFeedContext = async () => {
    const pending = pendingFeedAutofill();
    if (feedAutofillInFlight || !pending) return;
    const panel = current();
    if (!panel || !terminal.isAlive(panel.panel_id)) {
      setMenuOpen(true);
      setStatus(L("选择一个 Runtime；打开后会自动填入这条 Item 的上下文。"), "busy");
      return;
    }
    feedAutofillInFlight = true;
    setStatus(L("正在填入 Item 上下文…"), "busy");
    try {
      await waitForTerminalOutput(panel.panel_id);
      await writePrompt(false, pending.itemId);
      sessionStorage.removeItem(feedAutofillKey());
      setStatus(L("Item 上下文已填入，检查后再发送。"), "live");
      showPageToast(L("Item 上下文已填入 Terminal"));
    } catch (error) {
      setStatus(errorText(error), "error");
    } finally {
      feedAutofillInFlight = false;
    }
  };

  const fillPendingOnboardingContext = async () => {
    const pending = pendingOnboardingAutofill();
    if (onboardingAutofillInFlight || !pending || options.parentReadOnly()) return;
    onboardingAutofillInFlight = true;
    document.querySelector<HTMLButtonElement>('[data-workbench-view="runtime"]')?.click();
    if (matchMedia("(max-width: 760px)").matches) {
      document.querySelector<HTMLButtonElement>('[data-mobile-target="tui"]')?.click();
    }
    setStatus(L("正在打开初始化终端…"), "busy");
    try {
      if (!current()) {
        await openPanel({ runtime_kind: pending.runtimeKind, cwd: pending.workspacePath });
      }
      const panel = current();
      if (!panel || !terminal.isAlive(panel.panel_id)) {
        throw new Error(L("终端没有成功打开；你可以从右上角再次选择 Runtime。"));
      }
      const terminalSettled = await waitForTerminalOutput(panel.panel_id, 15_000, 700);
      if (!terminalSettled) {
        setStatus(L("Runtime 还在启动；准备好后会自动填入项目提示。"), "busy");
        postOnboardingRuntimeState("molis-work:onboarding-runtime-waiting");
        window.setTimeout(() => void fillPendingOnboardingContext(), 900);
        return;
      }
      const startupObservationRemaining = 7_500 - (Date.now() - pending.startedAt);
      if (startupObservationRemaining > 0) {
        setStatus(L("Runtime 还在启动；准备好后会自动填入项目提示。"), "busy");
        postOnboardingRuntimeState("molis-work:onboarding-runtime-waiting");
        window.setTimeout(() => void fillPendingOnboardingContext(), Math.min(startupObservationRemaining + 80, 1_000));
        return;
      }
      if (terminalIsWaitingForStartupConfirmation(panel.panel_id)) {
        setStatus(L("先完成 Runtime 里的启动确认；完成后会自动填入项目提示。"), "busy");
        postOnboardingRuntimeState("molis-work:onboarding-runtime-waiting");
        return;
      }
      if (terminalShowsReadyPrompt(panel.panel_id, pending.runtimeKind)) {
        await writePrompt(false, undefined, true);
        sessionStorage.removeItem(onboardingAutofillKey());
        setStatus(L("初始化提示已填入，检查后再发送。"), "live");
        showPageToast(L("初始化提示已填入 Terminal"));
        postOnboardingRuntimeState("molis-work:onboarding-runtime-ready");
        return;
      }
      if (pending.runtimeKind === "codex") {
        setStatus(L("Runtime 还在启动；准备好后会自动填入项目提示。"), "busy");
        postOnboardingRuntimeState("molis-work:onboarding-runtime-waiting");
        window.setTimeout(() => void fillPendingOnboardingContext(), 900);
        return;
      }
      await writePrompt(false, undefined, true);
      sessionStorage.removeItem(onboardingAutofillKey());
      setStatus(L("初始化提示已填入，检查后再发送。"), "live");
      showPageToast(L("初始化提示已填入 Terminal"));
      postOnboardingRuntimeState("molis-work:onboarding-runtime-ready");
    } catch (error) {
      const message = errorText(error);
      setStatus(message, "error");
      postOnboardingRuntimeState("molis-work:onboarding-runtime-error", message);
    } finally {
      onboardingAutofillInFlight = false;
    }
  };

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const data = event.data as {
      type?: string;
      goalId?: string;
      runtimeKind?: string;
      workspacePath?: string;
    } | null;
    if (data?.type !== "molis-work:onboarding-runtime-bootstrap" || data.goalId !== goalId()) return;
    const runtimeKind = typeof data.runtimeKind === "string" ? data.runtimeKind.trim() : "";
    const workspacePath = typeof data.workspacePath === "string" ? data.workspacePath.trim() : "";
    if (!runtimeKind || !workspacePath) {
      postOnboardingRuntimeState("molis-work:onboarding-runtime-error", L("Runtime 或工作目录无效，无法继续这次初始化。"));
      return;
    }
    sessionStorage.setItem(onboardingAutofillKey(), JSON.stringify({ runtimeKind, workspacePath, at: Date.now() }));
    void fillPendingOnboardingContext();
  });

  return { fillPendingFeedContext, fillPendingOnboardingContext, pendingOnboardingAutofill };
}
