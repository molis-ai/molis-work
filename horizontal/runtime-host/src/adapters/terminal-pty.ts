import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type {
  PtyHostHandlers,
  PtySpawnRequest,
  PtySpawnResult,
} from "@molis-ai/molis-work-contracts/services/runtime-host";

import {
  buildPtyEnvironment,
  isExecutableFile,
  resolveCommand,
} from "./terminal-pty-env.js";

export type { PtyHostHandlers, PtySpawnRequest, PtySpawnResult } from "@molis-ai/molis-work-contracts/services/runtime-host";
export {
  buildPtyEnvironment,
  isBlockedPtyEnvKey,
  isPtyCommandAvailable,
  resolveNvmBinDirectory,
  resolvePtyCommand,
} from "./terminal-pty-env.js";

const REPLAY_LIMIT = 200_000;
const FORCE_KILL_GRACE_MS = 2_000;

// Keep the compile-time surface local so builds also work without the optional package.
interface PtyProcess {
  readonly pid: number;
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void;
  resize(cols: number, rows: number): void;
  write(data: string): void;
  kill(signal?: string): void;
}

interface NodePty {
  spawn(command: string, args: string[], options: {
    name: string;
    cols: number;
    rows: number;
    cwd: string;
    env: Record<string, string>;
  }): PtyProcess;
}

const require = createRequire(import.meta.url);
let cachedNodePty: NodePty | Error | undefined;

function loadNodePty(): NodePty {
  if (cachedNodePty instanceof Error) throw cachedNodePty;
  if (cachedNodePty) return cachedNodePty;
  try {
    const nodePty: NodePty = require("node-pty");
    ensureMacosSpawnHelperExecutable();
    cachedNodePty = nodePty;
    return nodePty;
  } catch (cause) {
    cachedNodePty = new Error(
      "当前环境缺少终端原生组件，工作台的其他功能仍可使用。如需打开终端，请安装编译工具后重新构建，或使用预构建安装包。",
      { cause },
    );
    throw cachedNodePty;
  }
}

export function isPtyNativeAvailable(): { available: boolean; reason?: string } {
  try {
    loadNodePty();
    return { available: true };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function ensureMacosSpawnHelperExecutable(): void {
  if (process.platform !== "darwin") return;
  let ptyRoot: string;
  try {
    ptyRoot = path.dirname(require.resolve("node-pty/package.json"));
  } catch {
    return;
  }
  const helpers = [
    path.join(ptyRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
    path.join(ptyRoot, "build", "Release", "spawn-helper"),
  ];
  for (const helper of helpers) {
    try {
      const stat = fs.statSync(helper);
      if (!stat.isFile()) continue;
      if ((stat.mode & 0o111) === 0) fs.chmodSync(helper, 0o755);
    } catch {
      // Prebuild vs source layouts differ; spawn will fail later if the helper is missing.
    }
  }
}

function terminatePtyProcess(session: PtyProcess): void {
  const pid = session.pid;
  if (typeof pid === "number" && pid > 1 && process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGHUP");
    } catch {
      // The child may not be a process-group leader.
    }
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // Process may already have exited.
    }
  }
  try {
    session.kill();
  } catch {
    // Process may already have exited.
  }
}

function forceKillPtyProcess(session: PtyProcess): void {
  const pid = session.pid;
  if (typeof pid === "number" && pid > 1 && process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // The child may not be a process-group leader or may already have exited.
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process may already have exited.
    }
  }
  try {
    session.kill("SIGKILL");
  } catch {
    // Process may already have exited.
  }
}

function clipReplay(value: string): string {
  return value.length > REPLAY_LIMIT ? value.slice(value.length - REPLAY_LIMIT) : value;
}

export class MolisWorkPtyHost {
  private readonly sessions = new Map<string, PtyProcess>();
  private readonly replay = new Map<string, string>();
  private readonly dying = new Map<PtyProcess, ReturnType<typeof setTimeout>>();

  constructor(private readonly handlers: PtyHostHandlers) {}

  alive(panelId: string): boolean {
    return this.sessions.has(panelId);
  }

  spawn(request: PtySpawnRequest): PtySpawnResult {
    const cols = Math.max(20, Math.floor(request.cols ?? 80));
    const rows = Math.max(8, Math.floor(request.rows ?? 24));
    const existing = this.sessions.get(request.panelId);
    if (existing) {
      existing.resize(cols, rows);
      return { attached: true, started: false, replay: this.replay.get(request.panelId) ?? "" };
    }
    if (request.attachOnly) return { attached: false, started: false, replay: "" };
    const commandName = request.command?.trim();
    if (!commandName) throw new Error("缺少启动命令");
    const cwd = request.cwd?.trim() ?? "";
    if (!cwd) throw new Error("打开终端需要先把这个项目关联到一个工作目录");
    const env = buildPtyEnvironment(request.env ?? {});
    env.PWD = cwd;
    delete env.OLDPWD;
    const command = resolveCommand(commandName, env.PATH);
    if (!isExecutableFile(command)) throw new Error(`找不到命令：${commandName}，请先安装，或确认它在 PATH 中。`);
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      throw new Error(`工作目录不存在：${cwd}，请检查项目绑定的目录。`);
    }
    const proc = loadNodePty().spawn(command, request.args ?? [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env,
    });
    this.replay.set(request.panelId, "");
    proc.onData((data) => {
      if (this.sessions.get(request.panelId) !== proc) return;
      this.replay.set(request.panelId, clipReplay((this.replay.get(request.panelId) ?? "") + data));
      this.handlers.onData(request.panelId, data);
    });
    proc.onExit(({ exitCode, signal }) => {
      const pendingKill = this.dying.get(proc);
      if (pendingKill !== undefined) {
        clearTimeout(pendingKill);
        this.dying.delete(proc);
      }
      if (this.sessions.get(request.panelId) !== proc) return;
      this.sessions.delete(request.panelId);
      this.replay.delete(request.panelId);
      this.handlers.onExit(request.panelId, { exitCode: exitCode ?? -1, signal: signal ?? 0 });
    });
    this.sessions.set(request.panelId, proc);
    return { attached: false, started: true, replay: "" };
  }

  write(panelId: string, data: string): void {
    const session = this.sessions.get(panelId);
    if (!session) throw new Error("终端进程不存在");
    session.write(data);
  }

  resize(panelId: string, cols: number, rows: number): void {
    const session = this.sessions.get(panelId);
    if (session) session.resize(Math.max(20, Math.floor(cols)), Math.max(8, Math.floor(rows)));
  }

  kill(panelId: string): void {
    const session = this.sessions.get(panelId);
    this.sessions.delete(panelId);
    this.replay.delete(panelId);
    if (!session) return;
    terminatePtyProcess(session);
    const existingTimer = this.dying.get(session);
    if (existingTimer !== undefined) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      if (!this.dying.has(session)) return;
      this.dying.delete(session);
      forceKillPtyProcess(session);
    }, FORCE_KILL_GRACE_MS);
    timer.unref?.();
    this.dying.set(session, timer);
  }

  killAll(): void {
    for (const [session, timer] of [...this.dying.entries()]) {
      clearTimeout(timer);
      this.dying.delete(session);
      forceKillPtyProcess(session);
    }
    for (const panelId of [...this.sessions.keys()]) this.kill(panelId);
  }
}
