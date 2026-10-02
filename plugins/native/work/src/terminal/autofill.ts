export interface TerminalAutofillOptions {
  goalId(): string;
  text(value: string): string;
  errorText(error: unknown): string;
  terminal: {
    current(): { panel_id: string } | null;
    isAlive(panelId: string): boolean;
    output(panelId: string): { hasOutput: boolean; lastOutputAt: number } | undefined;
    writePrompt(send: boolean, feedItemId?: string): Promise<void>;
  };
  setStatus(text: string, state?: "busy" | "live" | "error"): void;
  setMenuOpen(open: boolean): void;
  showToast(text: string): void;
}

/** Fill pending Feed Item context into a ready terminal; never confirm startup or send it for the user. */
export function createTerminalAutofill(options: TerminalAutofillOptions) {
  const { goalId, terminal, text: L, errorText, setStatus, setMenuOpen, showToast: showPageToast } = options;
  const { current, writePrompt } = terminal;
  let feedAutofillInFlight = false;

  const feedAutofillKey = () => `molis-work-feed-runtime-autofill:${goalId()}`;

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

  return { fillPendingFeedContext };
}
