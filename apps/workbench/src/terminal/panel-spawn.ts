import type { PtyServerMessage } from "./connection.js";
import type { PanelRecord, SpawnMode, TerminalPanelState, TerminalScreens, TerminalStatusSetter } from "./types.js";

type TerminalSession = ReturnType<TerminalScreens["ensure"]>;
type Spawned = Extract<PtyServerMessage, { type: "spawned" }>;

export interface PanelSpawnOptions {
  state: TerminalPanelState;
  screens: TerminalScreens;
  text(value: string, vars?: Record<string, string | number>): string;
  errorText(error: unknown): string;
  canControlPanel(panel: PanelRecord | null | undefined): panel is PanelRecord;
  setStatus: TerminalStatusSetter;
  showTerminal(panelId: string | null): void;
  connect(): Promise<unknown>;
  send(message: Record<string, unknown>): Promise<void>;
}

/** The channel only attaches (S-103 ⑦): the Host started the process when Goals was asked to open it. */
const attachMessage = (panel: PanelRecord, size: { cols: number; rows: number } | undefined) => ({
  type: "spawn",
  panelId: panel.panel_id,
  attachOnly: true,
  cols: Math.min(1000, Math.max(20, size?.cols ?? 80)),
  rows: Math.min(1000, Math.max(8, size?.rows ?? 24)),
});

/** Own one attach queue per panel and the answers the channel owes it; the controller owns loading, opening and the list. */
export function createPanelSpawner(options: PanelSpawnOptions) {
  const { state, screens, text: L, errorText, setStatus } = options;
  const pendingSpawns = new Map<string, { resolve: (value: PtyServerMessage) => void; reject: (error: Error) => void }>();
  const spawnTail = new Map<string, Promise<unknown>>();

  const rejectSpawn = (panelId: string | undefined, error: Error) => {
    if (!panelId) return;
    const pending = pendingSpawns.get(panelId);
    if (!pending) return;
    pendingSpawns.delete(panelId);
    pending.reject(error);
  };

  const resolveSpawn = (value: Spawned) => {
    if (!value.panelId) return;
    pendingSpawns.get(value.panelId)?.resolve(value);
    pendingSpawns.delete(value.panelId);
  };

  const enqueueSpawn = (panelId: string, task: () => Promise<void>) => {
    const previous = spawnTail.get(panelId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    spawnTail.set(panelId, run);
    return run;
  };

  const expectSpawn = (panelId: string) => new Promise<PtyServerMessage>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingSpawns.delete(panelId);
      reject(new Error(L("终端通道连接失败")));
    }, 20_000);
    pendingSpawns.set(panelId, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
  });

  const markPanelNotRunning = (panel: PanelRecord) => {
    state.alive.delete(panel.panel_id);
    panel.status = "exited";
    if (state.activeId === panel.panel_id) options.showTerminal(state.activeId);
  };

  const spawnBusyText = (mode: SpawnMode) => {
    if (mode === "reconnect") return L("正在重新连接终端…");
    if (mode === "attach") return L("正在连接终端…");
    return L("正在启动终端…");
  };

  const showSpawned = (panel: PanelRecord, mode: SpawnMode, session: TerminalSession, result: PtyServerMessage) => {
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
    state.alive.add(panel.panel_id);
    panel.status = "open";
    requestAnimationFrame(() => {
      session.fit.fit();
      if (state.activeId === panel.panel_id) session.term.focus();
    });
    if (state.activeId === panel.panel_id) {
      setStatus(result.type === "spawned" && result.attached ? L("已回到正在运行的终端") : L("终端已连接"), "live");
    }
  };

  // Await points stay as they were (send, then the answer): the replay lands two turns after the channel answers.
  const spawnPanel = async (panel: PanelRecord, mode: SpawnMode = "start") => {
    if ((mode === "start" || mode === "reopen") && !options.canControlPanel(panel)) return;
    await enqueueSpawn(panel.panel_id, async () => {
      if (mode === "attach" && state.alive.has(panel.panel_id) && screens.has(panel.panel_id)) return;
      const session = screens.ensure(panel.panel_id);
      try {
        if (mode === "reopen") {
          session.term.reset();
          session.hasOutput = false;
        }
        session.fit.fit();
        const size = session.fit.proposeDimensions();
        if (state.activeId === panel.panel_id) setStatus(spawnBusyText(mode), "busy");
        await options.connect();
        const spawned = expectSpawn(panel.panel_id);
        try {
          await options.send(attachMessage(panel, size));
        } catch (error) {
          pendingSpawns.get(panel.panel_id)?.reject(error instanceof Error ? error : new Error(String(error)));
        }
        const result = await spawned;
        if (!screens.has(panel.panel_id)) return;
        if (result.type === "spawned" && !result.attached && result.started === false) {
          markPanelNotRunning(panel);
          return;
        }
        showSpawned(panel, mode, session, result);
      } catch (error) {
        if (!screens.has(panel.panel_id)) return;
        if (mode === "start" || mode === "reopen") {
          session.term.write(`\r\n${errorText(error)}\r\n`);
        }
        throw error;
      }
    });
  };

  return {
    spawnPanel,
    resolveSpawn,
    rejectSpawn,
    pendingPanels: () => [...pendingSpawns.keys()],
    forget(panelId: string) {
      spawnTail.delete(panelId);
      rejectSpawn(panelId, new Error("closed"));
    },
  };
}
