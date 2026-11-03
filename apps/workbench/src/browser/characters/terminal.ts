import type { UiTerminalEvent, UiTerminalView } from "@molis-ai/molis-work-contracts/platform/ui";

/** Runs `start` once `selector` is in the page: the Characters surface is filled in when it first opens (#150). */
function whenPresent(selector: string, start: () => void): void {
  const observer = new MutationObserver(() => {
    if (!document.querySelector(selector)) return;
    observer.disconnect();
    start();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * The terminal under a Character's native runs. It shows a process the Host already runs: the Characters page asks its backend for the
 * panel and says so in `molis-work:character-terminal`; this attaches to that panel and nothing else. The terminal is the platform's
 * (`molisPageTerminal` mounted by `molisTerminalRenderer`, PG-053), so it can attach, write, resize and stop, never start a process.
 * What a run prints is shown, not recorded.
 */
export function startCharacterTerminal(): void {
  const selector = "[data-characters] [data-character-terminal]";
  if (!document.querySelector(selector)) { whenPresent(selector, startCharacterTerminal); return; }
  const root = document.querySelector<HTMLElement>("[data-characters]");
  const host = root?.querySelector<HTMLElement>("[data-character-terminal]");
  const status = root?.querySelector<HTMLElement>("[data-character-terminal-status]");
  if (!host || !status || !root || host.dataset.bound) return;
  host.dataset.bound = "true";
  let active: string | null = null, view: UiTerminalView | undefined, opening = 0;
  const note = (message: string) => { status.textContent = message; };
  const release = () => { opening++; view?.dispose(); view = undefined; };
  const onEvent = (event: UiTerminalEvent) => {
    if (event.type === "spawned") note(event.started || event.attached ? "原生 Agent · 授权、提问和操作状态显示在终端中" : "进程未运行：可能启动失败、已退出或宿主已重启。终端内容不保存；可从“发布并使用”明确发起新任务。");
    else if (event.type === "exit") note(`进程已结束 · 退出码 ${event.exitCode}。终端内容不保存。`);
    else if (event.type === "disconnected") note("终端连接中断，正在尝试重连；不会重新派发任务。");
    else if (event.type === "error") note(event.message || "终端启动失败");
  };
  const attach = async (panelId: string) => {
    release();
    const ticket = opening;
    active = panelId;
    note("正在连接原生 Agent…");
    try {
      const next = await globalThis.molisPageTerminal.mount(host, { panelId, onEvent });
      if (ticket !== opening) { next.dispose(); return; }
      view = next;
      next.focus();
    } catch (error) { note(error instanceof Error ? error.message : String(error)); }
  };
  window.addEventListener("molis-work:character-terminal-reset", () => {
    release(); active = null;
    note("选择一条执行记录，在终端里看。");
  });
  window.addEventListener("molis-work:character-terminal", event => {
    const panelId = (event as CustomEvent<{ panelId?: string }>).detail?.panelId;
    if (panelId?.startsWith("character-")) void attach(panelId);
  });
  root.querySelector("[data-character-terminal-stop]")?.addEventListener("click", () => {
    if (active) void globalThis.molisPageTerminal.send({ type: "kill", panelId: active }).then(() => note("已请求停止进程。")).catch(error => note(error.message));
  });
}
