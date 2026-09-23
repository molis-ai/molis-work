import { createTerminalConnection, createTerminalScreens } from "@molis-ai/molis-work-plugin-work/terminal";
import type { PtySpawnRequest } from "@molis-ai/molis-work-contracts/services/runtime-host";

/** Character terminals share Runtime Host PTYs and Work Session recording. Reconnect never launches. */
export function startCharacterTerminalClient(): void {
  const root = document.querySelector<HTMLElement>("[data-characters]");
  const host = root?.querySelector<HTMLElement>("[data-character-terminal]");
  const status = root?.querySelector<HTMLElement>("[data-character-terminal-status]");
  if (!host || !status || !root || host.dataset.bound) return;
  host.dataset.bound = "true";
  let active: PtySpawnRequest | null = null;
  const note = (message: string) => { status.textContent = message; };
  const screens = createTerminalScreens({ host, onInput: (panelId, data) => {
    void connection.send({ type: "write", panelId, data }).catch(error => note(error.message));
  } });
  const connection = createTerminalConnection({
    controlToken: () => document.querySelector('meta[name="molis-work-control-token"]')?.getAttribute("content") ?? "",
    url: () => `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/pty`, text: value => value,
    onDisconnected: () => note("终端连接中断，正在尝试重连；不会重新派发任务。"),
    reconnect: async () => { if (active) try { await attach({ ...active, attachOnly: true }); } catch { connection.scheduleReconnect(); } },
    onMessage: value => {
      if (!("panelId" in value) || value.panelId !== active?.panelId) return;
      const screen = screens.get(active!.panelId)!;
      if (value.type === "data" && value.data) screen.term.write(value.data);
      if (value.type === "spawned") {
        connection.resetReconnect();
        if (value.replay) { screen.term.reset(); screen.term.write(value.replay); }
        note(value.started || value.attached ? "原生 Agent · 授权、提问和操作状态显示在终端中" : "进程未运行：可能启动失败、已退出或宿主已重启。查看保存记录了解原因；可从“发布并使用”明确发起新任务。");
      }
      if (value.type === "exit") note(`进程已结束 · 退出码 ${value.exitCode ?? "未知"}。点击执行记录可读取已保存输出。`);
      if (value.type === "error") note(value.message ?? "终端启动失败");
    },
  });
  const fit = () => {
    if (!active || !host.clientWidth) return;
    const screen = screens.get(active.panelId);
    if (!screen) return;
    screen.fit.fit();
    void connection.send({ type: "resize", panelId: active.panelId, cols: screen.term.cols, rows: screen.term.rows }).catch(error => note(error.message));
  };
  async function attach(request: PtySpawnRequest) {
    active = { ...request, attachOnly: true };
    for (const [id, screen] of screens.entries()) screen.wrapper.hidden = id !== request.panelId;
    const screen = screens.ensure(request.panelId); screen.wrapper.hidden = false;
    if (host!.clientWidth) screen.fit.fit();
    await connection.send({ type: "spawn", ...request, cols: screen.term.cols, rows: screen.term.rows });
    screen.term.focus();
  }
  new ResizeObserver(fit).observe(host);
  window.addEventListener("molis-work:character-terminal-reset", () => {
    active = null; for (const [, screen] of screens.entries()) screen.wrapper.hidden = true;
    note("选择一条执行记录连接终端。");
  });
  window.addEventListener("molis-work:character-terminal", event => {
    const request = (event as CustomEvent<PtySpawnRequest>).detail;
    if (!request?.panelId?.startsWith("character-")) return;
    note("正在连接原生 Agent…");
    void attach(request).catch(error => note(error.message));
  });
  root.querySelector("[data-character-terminal-stop]")?.addEventListener("click", () => {
    if (active) void connection.send({ type: "kill", panelId: active.panelId }).then(() => note("已请求停止进程。已保存的输出仍保留。")).catch(error => note(error.message));
  });
}
