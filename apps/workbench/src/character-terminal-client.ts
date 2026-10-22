import type { UiPageTerminal, UiTerminalEvent, UiTerminalView } from "@molis-ai/molis-work-contracts/platform/ui";

declare global { var molisPageTerminal: UiPageTerminal; }

/** Runs once the plugin surface is mounted. The public renderer handles input, replay and sizing. */
export function startCharacterTerminalClient(): void {
  const root = document.querySelector<HTMLElement>("[data-characters]");
  const host = root?.querySelector<HTMLElement>("[data-character-terminal]");
  const status = root?.querySelector<HTMLElement>("[data-character-terminal-status]");
  if (!host || !status || !root) {
    const observer = new MutationObserver(() => {
      if (!document.querySelector("[data-characters] [data-character-terminal]")) return;
      observer.disconnect(); startCharacterTerminalClient();
    });
    observer.observe(document.body, { childList: true, subtree: true }); return;
  }
  if (host.dataset.bound) return; host.dataset.bound = "true";
  const terminal = globalThis.molisPageTerminal;
  let active: string | null = null, current: UiTerminalView | undefined, generation = 0;
  const note = (message: string) => { status.textContent = message; };
  const event = (value: UiTerminalEvent) => {
    if (value.type === "disconnected") note("终端连接中断，正在尝试重连；不会重新派发任务。");
    if (value.type === "spawned") note(value.started || value.attached
      ? "原生 Agent · 授权、提问和操作状态显示在终端中"
      : "进程未运行：可能启动失败、已退出或宿主已重启。查看保存记录了解原因；可从“发布并使用”明确发起新任务。");
    if (value.type === "exit") note(`进程已结束 · 退出码 ${value.exitCode ?? "未知"}。点击执行记录可读取已保存输出。`);
    if (value.type === "error") note(value.message);
  };
  async function attach(panelId: string) {
    const version = ++generation; active = panelId; current?.dispose(); current = undefined;
    const view = await terminal.mount(host, { panelId, onEvent: value => { if (version === generation) event(value); } });
    if (version !== generation) { view.dispose(); return; }
    current = view; view.focus();
  }
  window.addEventListener("molis-work:character-terminal-reset", () => {
    generation++; active = null; current?.dispose(); current = undefined;
    note("选择一条执行记录连接终端。");
  });
  window.addEventListener("molis-work:character-terminal", value => {
    const panelId = (value as CustomEvent<{ panelId: string }>).detail?.panelId;
    if (!panelId?.startsWith("character-")) return;
    note("正在连接原生 Agent…"); void attach(panelId).catch(error => note(error.message));
  });
  root.querySelector("[data-character-terminal-stop]")?.addEventListener("click", () => {
    if (active) void terminal.send({ type: "kill", panelId: active }).then(() => note("已请求停止进程。已保存的输出仍保留。")).catch(error => note(error.message));
  });
}
