import { createTerminalConnection, type PtyServerMessage } from "./connection.js";
import { createPanelSpawner } from "./panel-spawn.js";
import type { PanelProgram, PanelRecord, SpawnMode, TerminalPanelState, TerminalRequest, TerminalScreens, TerminalStatusSetter } from "./types.js";

export interface TerminalPanelsOptions {
  screens: TerminalScreens;
  goalId(): string;
  parentReadOnly(): boolean;
  parentReadOnlyMessage(): string;
  canControlPanel(panel: PanelRecord | null | undefined): panel is PanelRecord;
  text(value: string, vars?: Record<string, string | number>): string;
  errorText(error: unknown): string;
  route(path: string): string;
  /** The Goal's terminals route with `:goalId` for its id, as the pane was given it: this client names no plugin. */
  terminalsRoute(): string;
  request: TerminalRequest;
  controlToken(): string;
  setStatus: TerminalStatusSetter;
  setMenuOpen(open: boolean): void;
  renderTabs(): void;
  showTerminal(panelId: string | null): void;
  afterOpened(): Promise<void>;
}

type ListedPanel = { key: string; panel_id: string; title: string; runtime: string; program: PanelProgram; running: boolean };
type Opened = { panel_id: string; key: string; started: boolean };

interface PanelContext {
  readonly options: TerminalPanelsOptions;
  readonly state: TerminalPanelState;
  readonly spawner: ReturnType<typeof createPanelSpawner>;
}

const terminalsPath = (options: TerminalPanelsOptions, goalId: string, key?: string) => {
  const route = options.terminalsRoute();
  if (!route) throw new Error(options.text("打开失败"));
  return options.route(route.replace(":goalId", encodeURIComponent(goalId)) + (key === undefined ? "" : `/${encodeURIComponent(key)}`));
};
const listedPanel = (goalId: string, row: ListedPanel): PanelRecord => ({
  key: row.key, panel_id: row.panel_id, goal_id: goalId, title: row.title, runtime: row.runtime, program: row.program,
  status: row.running ? "open" : "exited",
});
/** The Goal's terminals as Goals lists them. */
const listPanels = async (options: TerminalPanelsOptions, goalId: string) =>
  ((await options.request<{ panels?: ListedPanel[] } | null>(terminalsPath(options, goalId)))?.panels ?? []).map(row => listedPanel(goalId, row));
/** Asks Goals to open (or, under a known key, start again) a terminal: the Host starts it, the page only attaches. */
const openTerminal = (options: TerminalPanelsOptions, goalId: string, body: Record<string, unknown>) =>
  options.request<Opened | null>(terminalsPath(options, goalId), { body, fallback: options.text("打开失败") });

function handleExit(ctx: PanelContext, value: Extract<PtyServerMessage, { type: "exit" }>) {
  const { options, state } = ctx;
  const L = options.text;
  if (!value.panelId) return;
  state.alive.delete(value.panelId);
  const panel = state.panels.find((item) => item.panel_id === value.panelId);
  if (panel) panel.status = "exited";
  const session = options.screens.get(value.panelId);
  if (session) {
    const exitCode = value.exitCode ?? 0;
    session.term.write(`\r\n${L("终端进程已退出")}${value.exitCode != null ? `（${L("退出码")} ${exitCode}）` : ""}\r\n`);
    if (!session.hasOutput && exitCode !== 0) {
      session.term.write(`\r\n${L("进程在启动后立即退出，常见原因：命令未安装、不在 PATH 中或工作目录不存在。")}\r\n`);
    }
  }
  if (state.activeId === value.panelId) {
    options.showTerminal(state.activeId);
    options.setStatus(value.exitCode != null ? L("终端已退出（退出码 {code}）", { code: value.exitCode }) : L("终端已退出"));
  }
}

function handlePtyMessage(ctx: PanelContext, value: PtyServerMessage) {
  const { options, state, spawner } = ctx;
  if (value.type === "data") {
    if (!value.panelId || value.data == null) return;
    const session = options.screens.get(value.panelId);
    if (!session) return;
    session.term.write(value.data);
    session.hasOutput = true;
    session.recentOutput = (session.recentOutput + value.data).slice(-12_000);
    session.lastOutputAt = Date.now();
    return;
  }
  if (value.type === "exit") handleExit(ctx, value);
  else if (value.type === "spawned") spawner.resolveSpawn(value);
  else if (value.type === "error") {
    const error = new Error(value.message || options.text("终端通道连接失败"));
    spawner.rejectSpawn(value.panelId, error);
    if (!value.panelId || value.panelId === state.activeId) options.setStatus(options.errorText(error), "error");
  }
}

async function spawnQuietly(ctx: PanelContext, panel: PanelRecord, mode: SpawnMode) {
  try {
    await ctx.spawner.spawnPanel(panel, mode);
  } catch (error) {
    if (ctx.state.activeId === panel.panel_id) ctx.options.setStatus(ctx.options.errorText(error), "error");
  }
}

const stubPanel = (panelId: string): PanelRecord => ({
  key: "", panel_id: panelId, goal_id: "", title: "", runtime: "", program: { runtime: "" }, status: "open",
});

async function reconnectLivePanels(ctx: PanelContext, connection: ReturnType<typeof createTerminalConnection>) {
  if (connection.isStopped()) return;
  const { state } = ctx;
  try {
    await connection.connect();
    connection.resetReconnect();
    const known = new Map(state.panels.map((panel) => [panel.panel_id, panel]));
    const queue: Array<{ panel: PanelRecord; mode: SpawnMode }> = [];
    for (const panelId of [...state.alive]) queue.push({ panel: known.get(panelId) ?? stubPanel(panelId), mode: "reconnect" });
    for (const panel of state.panels) {
      if (panel.status === "open" && !state.alive.has(panel.panel_id)) queue.push({ panel, mode: "attach" });
    }
    for (const item of queue) await spawnQuietly(ctx, item.panel, item.mode);
    ctx.options.showTerminal(state.activeId);
  } catch {
    connection.scheduleReconnect();
  }
}

async function loadPanels(ctx: PanelContext) {
  const { options, state } = ctx;
  const id = options.goalId();
  const requestSequence = ++state.loadSequence;
  if (!id) {
    state.panels = [];
    state.activeId = null;
    options.renderTabs();
    options.showTerminal(null);
    return;
  }
  let panels: PanelRecord[];
  try {
    panels = await listPanels(options, id);
  } catch {
    return;
  }
  if (requestSequence !== state.loadSequence || id !== options.goalId()) return;
  state.panels = panels;
  if (!state.panels.some((item) => item.panel_id === state.activeId)) state.activeId = state.panels[0]?.panel_id ?? null;
  options.renderTabs();
  for (const panel of state.panels) {
    if (panel.status === "open") await spawnQuietly(ctx, panel, "attach");
  }
  options.showTerminal(state.activeId);
  await options.afterOpened();
}

async function openPanel(ctx: PanelContext, body: Record<string, unknown>) {
  const { options, state } = ctx;
  const L = options.text;
  const id = options.goalId();
  if (!id) {
    options.setStatus(L("打开项目后，Goal 右侧可以添加终端"));
    return;
  }
  if (options.parentReadOnly()) {
    options.setStatus(options.parentReadOnlyMessage(), "error");
    return;
  }
  let record: PanelRecord | undefined;
  try {
    const opened = await openTerminal(options, id, body);
    // The title and program are Goals' record of it: read back once, by the key it was opened under.
    record = opened ? (await listPanels(options, id)).find(row => row.key === opened.key) : undefined;
  } catch (error) {
    options.setStatus(options.errorText(error), "error");
    return;
  }
  if (!record || id !== options.goalId()) {
    if (!record) options.setStatus(L("打开失败"), "error");
    return;
  }
  record.status = "open";
  state.panels.push(record);
  state.activeId = record.panel_id;
  options.renderTabs();
  options.showTerminal(state.activeId);
  options.setMenuOpen(false);
  try {
    await ctx.spawner.spawnPanel(record);
    options.showTerminal(state.activeId);
    await options.afterOpened();
  } catch (error) {
    options.setStatus(options.errorText(error), "error");
    options.showTerminal(state.activeId);
  }
}

async function closePanel(ctx: PanelContext, panelId: string) {
  const { options, state } = ctx;
  const panel = state.panels.find((item) => item.panel_id === panelId);
  if (!options.canControlPanel(panel)) return;
  // Goals ends the process and forgets it. Any answer closes the tab here; only a request that got no answer stops it.
  await options.request(terminalsPath(options, panel.goal_id, panel.key), { method: "DELETE", as: "response" });
  options.screens.remove(panelId);
  state.alive.delete(panelId);
  ctx.spawner.forget(panelId);
  state.panels = state.panels.filter((item) => item.panel_id !== panelId);
  if (state.activeId === panelId) state.activeId = state.panels[0]?.panel_id ?? null;
  options.renderTabs();
  options.showTerminal(state.activeId);
}

async function reopenPanel(ctx: PanelContext) {
  const { options, state } = ctx;
  const panel = state.panels.find((item) => item.panel_id === state.activeId) ?? null;
  if (!options.canControlPanel(panel)) return;
  // The same key with the program it was opened with: Goals starts it again (resuming the runtime's session when one was reported).
  try {
    await openTerminal(options, panel.goal_id, { key: panel.key, ...panel.program });
  } catch (error) {
    options.setStatus(options.errorText(error), "error");
    return;
  }
  panel.status = "open";
  await ctx.spawner.spawnPanel(panel, "reopen");
  options.showTerminal(state.activeId);
}

/** Own panel loading/spawn/attach/reopen/exit state, not xterm rendering or prompt composition. */
export function createTerminalPanels(options: TerminalPanelsOptions) {
  const state: TerminalPanelState = { panels: [], activeId: null, alive: new Set(), loadSequence: 0 };
  const connection = createTerminalConnection({
    controlToken: options.controlToken,
    url: () => `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/pty`,
    text: options.text,
    onMessage: (value) => handlePtyMessage(ctx, value),
    onDisconnected: (error) => {
      for (const panelId of spawner.pendingPanels()) spawner.rejectSpawn(panelId, error);
      if (state.alive.size) options.setStatus(error.message, "error");
    },
    reconnect: () => reconnectLivePanels(ctx, connection),
  });
  const spawner = createPanelSpawner({
    state, screens: options.screens, text: options.text, errorText: options.errorText,
    canControlPanel: options.canControlPanel, setStatus: options.setStatus, showTerminal: options.showTerminal,
    connect: connection.connect, send: connection.send,
  });
  const ctx: PanelContext = { options, state, spawner };
  const current = () => state.panels.find((item) => item.panel_id === state.activeId) ?? null;
  return {
    get panels() { return state.panels; },
    get activeId() { return state.activeId; },
    isAlive: (panelId: string) => state.alive.has(panelId),
    current,
    loadPanels: () => loadPanels(ctx),
    openPanel: (body: Record<string, unknown>) => openPanel(ctx, body),
    closePanel: (panelId: string) => closePanel(ctx, panelId),
    reopenPanel: () => reopenPanel(ctx),
    connect: connection.connect,
    send: connection.send,
    stop: connection.stop,
    select(panelId: string) { state.activeId = panelId; options.renderTabs(); options.showTerminal(state.activeId); },
    resetGoal() {
      state.loadSequence += 1; state.panels = []; state.activeId = null;
      options.renderTabs(); options.showTerminal(null);
    },
  };
}
