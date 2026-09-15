import { createTerminalConnection, type PtyServerMessage } from "./connection.js";
import type { createTerminalScreens } from "./screens.js";
import type { PanelRecord, SpawnMode } from "./types.js";

export interface TerminalPanelsOptions {
  screens: ReturnType<typeof createTerminalScreens>;
  goalId(): string;
  parentReadOnly(): boolean;
  parentReadOnlyMessage(): string;
  canControlPanel(panel: PanelRecord | null | undefined): panel is PanelRecord;
  text(value: string, vars?: Record<string, string | number>): string;
  errorText(error: unknown): string;
  route(path: string): string;
  headers(): Record<string, string>;
  desktopHeaders(): Record<string, string>;
  controlToken(): string;
  setStatus(text: string, state?: "busy" | "live" | "error"): void;
  setMenuOpen(open: boolean): void;
  renderTabs(): void;
  showTerminal(panelId: string | null): void;
  onOutput(): void;
  afterOpened(): Promise<void>;
}

/** Own panel loading/spawn/attach/reopen/exit state, not xterm rendering or prompt composition. */
export function createTerminalPanels(options: TerminalPanelsOptions) {
  const { screens, goalId, parentReadOnlyMessage, canControlPanel, text: L, errorText,
    route, headers, desktopHeaders, controlToken, setStatus, setMenuOpen, renderTabs, showTerminal } = options;
  const ensureSession = screens.ensure;
  const alive = new Set<string>();
  const pendingSpawns = new Map<string, { resolve: (value: PtyServerMessage) => void; reject: (error: Error) => void }>();
  const spawnTail = new Map<string, Promise<unknown>>();
  let panels: PanelRecord[] = [];
  let activeId: string | null = null;
  let panelLoadSequence = 0;

  const rejectSpawn = (panelId: string | undefined, error: Error) => {
    if (!panelId) return;
    const pending = pendingSpawns.get(panelId);
    if (!pending) return;
    pendingSpawns.delete(panelId);
    pending.reject(error);
  };

  const handlePtyMessage = (value: PtyServerMessage) => {
    if (value.type === "data") {
      if (!value.panelId || value.data == null) return;
      const session = screens.get(value.panelId);
      if (!session) return;
      session.term.write(value.data);
      session.hasOutput = true;
      session.recentOutput = (session.recentOutput + value.data).slice(-12_000);
      session.lastOutputAt = Date.now();
      options.onOutput();
      return;
    }
    if (value.type === "exit") {
      if (!value.panelId) return;
      alive.delete(value.panelId);
      const panel = panels.find((item) => item.panel_id === value.panelId);
      if (panel) panel.status = "exited";
      const session = screens.get(value.panelId);
      if (session) {
        const exitCode = value.exitCode ?? 0;
        session.term.write(`\r\n${L("终端进程已退出")}${value.exitCode != null ? `（${L("退出码")} ${exitCode}）` : ""}\r\n`);
        if (!session.hasOutput && exitCode !== 0) {
          session.term.write(`\r\n${L("进程在启动后立即退出，常见原因：命令未安装、不在 PATH 中或工作目录不存在。")}\r\n`);
        }
      }
      void fetch(route(`/api/panels/${encodeURIComponent(value.panelId)}/exited`), {
        method: "POST",
        headers: headers(),
        body: "{}",
      }).catch(() => undefined);
      if (activeId === value.panelId) {
        showTerminal(activeId);
        setStatus(
          value.exitCode != null ? L("终端已退出（退出码 {code}）", { code: value.exitCode }) : L("终端已退出"),
        );
      }
      return;
    }
    if (value.type === "spawned" && value.panelId) {
      pendingSpawns.get(value.panelId)?.resolve(value);
      pendingSpawns.delete(value.panelId);
      return;
    }
    if (value.type === "error") {
      const error = new Error(value.message || L("终端通道连接失败"));
      rejectSpawn(value.panelId, error);
      if (!value.panelId || value.panelId === activeId) setStatus(errorText(error), "error");
    }
  };

  const connection = createTerminalConnection({
    controlToken,
    url: () => `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/pty`,
    text: L,
    onMessage: handlePtyMessage,
    onDisconnected: (error) => {
      for (const panelId of [...pendingSpawns.keys()]) rejectSpawn(panelId, error);
      if (alive.size) setStatus(error.message, "error");
    },
    reconnect: () => reconnectLivePanels(),
  });
  const connectPty = connection.connect;
  const sendPty = connection.send;
  const scheduleReconnect = connection.scheduleReconnect;

  const enqueueSpawn = (panelId: string, task: () => Promise<void>) => {
    const previous = spawnTail.get(panelId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    spawnTail.set(panelId, run);
    return run;
  };

  const stubPanel = (panelId: string): PanelRecord => ({
    panel_id: panelId,
    goal_id: "",
    runtime_kind: "generic",
    launch_command: "",
    launch_args: [],
    cwd: null,
    work_context_id: panelId,
    title: "",
    status: "open",
  });

  const markPanelNotRunning = async (panel: PanelRecord) => {
    alive.delete(panel.panel_id);
    panel.status = "exited";
    await fetch(route(`/api/panels/${encodeURIComponent(panel.panel_id)}/exited`), {
      method: "POST",
      headers: headers(),
      body: "{}",
    }).catch(() => undefined);
    if (activeId === panel.panel_id) showTerminal(activeId);
  };

  const forgetLocalSession = (panelId: string) => {
    spawnTail.delete(panelId);
    screens.remove(panelId);
    alive.delete(panelId);
    rejectSpawn(panelId, new Error("closed"));
  };

  const current = () => panels.find((item) => item.panel_id === activeId) ?? null;

  const spawnBusyText = (mode: SpawnMode) => {
    if (mode === "reconnect") return L("正在重新连接终端…");
    if (mode === "attach") return L("正在连接终端…");
    return L("正在启动终端…");
  };

  const spawnPanel = async (panel: PanelRecord, mode: SpawnMode = "start") => {
    if ((mode === "start" || mode === "reopen") && !canControlPanel(panel)) return;
    await enqueueSpawn(panel.panel_id, async () => {
      if (mode === "attach" && alive.has(panel.panel_id) && screens.has(panel.panel_id)) return;
      const session = ensureSession(panel.panel_id);
      try {
        if (mode === "reopen") {
          session.term.reset();
          session.hasOutput = false;
        }
        session.fit.fit();
        const size = session.fit.proposeDimensions();
        const spawn = panel.spawn;
        if (activeId === panel.panel_id) setStatus(spawnBusyText(mode), "busy");
        await connectPty();
        const spawned = new Promise<PtyServerMessage>((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingSpawns.delete(panel.panel_id);
            reject(new Error(L("终端通道连接失败")));
          }, 20_000);
          pendingSpawns.set(panel.panel_id, {
            resolve: (value) => {
              clearTimeout(timer);
              resolve(value);
            },
            reject: (error) => {
              clearTimeout(timer);
              reject(error);
            },
          });
        });
        try {
          await sendPty({
            type: "spawn",
            panelId: panel.panel_id,
            sessionId: spawn?.sessionId,
            command: spawn?.command ?? panel.launch_command,
            args: spawn?.args ?? panel.launch_args,
            cwd: spawn?.cwd ?? panel.cwd,
            env: spawn?.env ?? {
              MOLIS_WORK_PANEL_ID: panel.panel_id,
              MOLIS_WORK_GOAL_ID: panel.goal_id,
              MOLIS_WORK_WORK_CONTEXT_ID: panel.work_context_id,
              MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
              MOLIS_WORK_RUNTIME_ID: panel.runtime_kind,
            },
            cols: Math.max(20, size?.cols ?? 80),
            rows: Math.max(8, size?.rows ?? 24),
            attachOnly: mode === "attach" || mode === "reconnect",
          });
        } catch (error) {
          pendingSpawns.get(panel.panel_id)?.reject(error instanceof Error ? error : new Error(String(error)));
        }
        const result = await spawned;
        if (!screens.has(panel.panel_id)) return;
        if (result.type === "spawned" && !result.attached && result.started === false) {
          await markPanelNotRunning(panel);
          return;
        }
        if (mode === "reconnect") {
          session.term.reset();
          session.hasOutput = false;
        }
        if (result.type === "spawned" && result.replay && (mode === "reconnect" || !session.hasOutput)) {
          session.term.write(result.replay);
          session.hasOutput = true;
          session.recentOutput = result.replay.slice(-12_000);
          session.lastOutputAt = Date.now();
        }
        alive.add(panel.panel_id);
        panel.status = "open";
        requestAnimationFrame(() => {
          session.fit.fit();
          if (activeId === panel.panel_id) session.term.focus();
        });
        if (activeId === panel.panel_id) {
          setStatus(result.type === "spawned" && result.attached ? L("已回到正在运行的终端") : L("终端已连接"), "live");
        }
      } catch (error) {
        if (!screens.has(panel.panel_id)) return;
        if (mode === "start" || mode === "reopen") {
          session.term.write(`\r\n${errorText(error)}\r\n`);
        }
        throw error;
      }
    });
  };

  const reconnectLivePanels = async () => {
    if (connection.isStopped()) return;
    try {
      await connectPty();
      connection.resetReconnect();
      const known = new Map(panels.map((panel) => [panel.panel_id, panel]));
      const queue: Array<{ panel: PanelRecord; mode: SpawnMode }> = [];
      for (const panelId of [...alive]) {
        queue.push({ panel: known.get(panelId) ?? stubPanel(panelId), mode: "reconnect" });
      }
      for (const panel of panels) {
        if (panel.status === "open" && !alive.has(panel.panel_id)) {
          queue.push({ panel, mode: "attach" });
        }
      }
      for (const item of queue) {
        try {
          await spawnPanel(item.panel, item.mode);
        } catch (error) {
          if (activeId === item.panel.panel_id) setStatus(errorText(error), "error");
        }
      }
      showTerminal(activeId);
    } catch {
      scheduleReconnect();
    }
  };

  const loadPanels = async () => {
    const id = goalId();
    const requestSequence = ++panelLoadSequence;
    if (!id) {
      panels = [];
      activeId = null;
      renderTabs();
      showTerminal(null);
      return;
    }
    const response = await fetch(route(`/api/goals/${encodeURIComponent(id)}/panels`), {
      cache: "no-store",
      headers: desktopHeaders(),
    });
    if (!response.ok) return;
    const payload = await response.json() as { panels?: PanelRecord[] };
    if (requestSequence !== panelLoadSequence || id !== goalId()) return;
    panels = payload.panels ?? [];
    if (!panels.some((item) => item.panel_id === activeId)) {
      activeId = panels[0]?.panel_id ?? null;
    }
    renderTabs();
    for (const panel of panels) {
      if (panel.status !== "open") continue;
      try {
        await spawnPanel(panel, "attach");
      } catch (error) {
        if (activeId === panel.panel_id) setStatus(errorText(error), "error");
      }
    }
    showTerminal(activeId);
    await options.afterOpened();
  };

  const openPanel = async (body: Record<string, unknown>) => {
    const id = goalId();
    if (!id) {
      setStatus(L("打开项目后，Goal 右侧可以添加终端"));
      return;
    }
    if (options.parentReadOnly()) {
      setStatus(parentReadOnlyMessage(), "error");
      return;
    }
    const response = await fetch(route(`/api/goals/${encodeURIComponent(id)}/panels`), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    const payload = await response.json() as { panel?: PanelRecord; spawn?: PanelRecord["spawn"]; error?: string };
    if (!response.ok || !payload.panel) {
      setStatus(payload.error || L("打开失败"), "error");
      return;
    }
    const record = { ...payload.panel, spawn: payload.spawn };
    panels.push(record);
    activeId = record.panel_id;
    renderTabs();
    showTerminal(activeId);
    setMenuOpen(false);
    try {
      await spawnPanel(record);
      showTerminal(activeId);
      await options.afterOpened();
    } catch (error) {
      setStatus(errorText(error), "error");
      showTerminal(activeId);
    }
  };

  const closePanel = async (panelId: string) => {
    const panel = panels.find((item) => item.panel_id === panelId);
    if (!canControlPanel(panel)) return;
    await sendPty({ type: "kill", panelId }).catch(() => undefined);
    await fetch(route(`/api/panels/${encodeURIComponent(panelId)}`), {
      method: "DELETE",
      headers: headers(),
    });
    forgetLocalSession(panelId);
    panels = panels.filter((item) => item.panel_id !== panelId);
    if (activeId === panelId) activeId = panels[0]?.panel_id ?? null;
    renderTabs();
    showTerminal(activeId);
  };


  const reopenPanel = async () => {
    const panel = current();
    if (!canControlPanel(panel)) return;
      const response = await fetch(route(`/api/panels/${encodeURIComponent(panel.panel_id)}/reopen`), {
        method: "POST",
        headers: headers(),
        body: "{}",
      });
      const payload = await response.json() as { panel?: PanelRecord; spawn?: PanelRecord["spawn"]; error?: string };
      if (!response.ok) {
        setStatus(payload.error || L("打开失败"), "error");
        return;
      }
      if (payload.panel) {
        Object.assign(panel, payload.panel, { spawn: payload.spawn ?? panel.spawn });
      }
      await spawnPanel(panel, "reopen");
      showTerminal(activeId);
  };
  return {
    get panels() { return panels; },
    get activeId() { return activeId; },
    isAlive: (panelId: string) => alive.has(panelId),
    current,
    loadPanels,
    openPanel,
    closePanel,
    reopenPanel,
    connect: connectPty,
    send: sendPty,
    stop: connection.stop,
    select(panelId: string) { activeId = panelId; renderTabs(); showTerminal(activeId); },
    resetGoal() { panelLoadSequence += 1; panels = []; activeId = null; renderTabs(); showTerminal(null); },
  };
}
