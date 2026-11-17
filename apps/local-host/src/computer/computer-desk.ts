import { createHash } from "node:crypto";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostSurfaceContext, HostSurfaceDriver, HostSurfaceRefusal, HostSurfaceRoundEnd } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import type { ComputerActivity, ComputerControlMode, ComputerState } from "@molis-ai/molis-work-contracts/services/computer";
import { showsMolis, tierOf } from "./app-tiers.js";
import { refused } from "./computer-errors.js";
import { ComputerDriver, type AppState, type DeskContext, type Target } from "./computer-driver.js";
import type { ComputerRecords } from "./computer-records.js";
import type { ComputerSettings } from "./computer-settings.js";
import { type HelperConnection, type HelperEvent, type HelperStatus } from "./helper-connection.js";
import { desktopRoundOutcome } from "./task-outcome.js";
import { eachListener } from "../host-log.js";

/** The helper methods the desk calls. A real connection satisfies this, and a test can stand in without starting one. */
type ComputerHelper = Pick<HelperConnection, "on" | "ensure" | "call" | "status" | "unsupported" | "problem" | "ready" | "generation">;

/** No input for this long while nothing is locked: the person is away, and the Assistant does not act. */
const AWAY_SECONDS = 10 * 60;

interface ComputerDeskOptions {
  readonly helper: ComputerHelper;
  readonly settings: ComputerSettings;
  readonly records: ComputerRecords;
  /** Whether a session's round is still running (a lease a finished round left behind is free again). */
  readonly live?: (sessionId: string) => boolean;
}

/**
 * The person's Mac as one interface the Assistant may look at and act on (specs/computer-use). One desk per Home: one
 * computer, so one work at a time holds it (the lease), and the person can pause, stop, take over and hand back at any
 * moment. This class owns the control state, the lease, the live view and the round's record; the look-and-act side is
 * its {@link ComputerDriver}, which reaches this state through a `DeskContext`.
 */
export class ComputerDesk implements DeskContext {
  private mode: ComputerControlMode = "idle";
  private pausedReason: "person-input" | "person" | null = null;
  private lease: { control: HostSurfaceContext; session_id: string; record_id: string | null; monitoring?: Promise<void>; monitoredGeneration?: number } | null = null;
  private closed = false;
  private monitorGeneration = 0;
  private targetApp: Target | null = null;
  private activityNow: ComputerActivity | null = null;
  /** Grows on every take-over and hand-back: older observations no longer match, so the Assistant looks again. */
  private takeoverCount = 0;
  private lastPersonMove = 0;
  private readonly produced: string[] = [];
  private readonly listeners = new Set<(state: ComputerState) => void>();
  private readonly frameListeners = new Set<(png: Buffer) => void>();
  private allowedThisRound: { session_id: string; apps: Set<string> } | null = null;
  private readonly contexts = new WeakMap<HostSurfaceContext, { readonly run_id: string | null; readonly project_id: string | null; readonly goal: string }>();
  /** When the last action reached the screen. Null until one does, so a confirm with nothing injected is the person's. */
  private lastInjectAt: number | null = null;
  /** The window title last read this round, and files this round handed over, took out, or saw as the document. */
  private seenTitle = "";
  private readonly seenFiles: string[] = [];
  private readonly unsubscribe: () => void;
  private readonly surfaceDriver: ComputerDriver;

  // DeskContext data access (fields and arrows, not methods: the look-and-act side reads the desk's state through these).
  readonly helper: ComputerHelper;
  readonly settings: ComputerSettings;

  constructor(private readonly options: ComputerDeskOptions) {
    this.helper = options.helper;
    this.settings = options.settings;
    this.unsubscribe = options.helper.on(event => this.heard(event));
    this.surfaceDriver = new ComputerDriver(this);
  }

  assertCurrent(control: HostSurfaceContext): void {
    requireSynchronous(control.assertCurrent());
    if (this.closed || (this.lease && this.lease.control !== control)) throw refused("driver-unavailable", "原轮次不再占用电脑");
    if (!this.settings.enabled) throw refused("driver-unavailable", "用户没有打开「允许助理使用电脑」。");
    if (this.mode === "paused" || this.mode === "taken-over") throw refused("person-present", "用户已暂停或接手电脑，请等待交还后重新观察。");
    const status = this.helper.status();
    if (status && Object.values(status.permissions).some(granted => granted !== true)) throw refused("driver-unavailable", "电脑助手的系统权限已被收回");
    const presence = this.presence(status);
    if (presence.locked || presence.away) throw refused("screen-locked", presence.reason ?? "用户不在");
  }
  assertReady(control: HostSurfaceContext): void {
    this.assertCurrent(control);
    if (this.lease?.control !== control || this.lease.monitoredGeneration !== this.helper.generation || !this.helper.ready) throw refused("driver-unavailable", "原轮次的输入监视尚未确认启用");
  }

  target = (): Target | null => this.targetApp;
  setTarget = (target: Target | null): void => { this.targetApp = target; };
  takeovers = (): number => this.takeoverCount;
  activity = (): ComputerActivity | null => this.activityNow;
  emitFrame = (png: Buffer): void => { eachListener("computer", "desk_frames", this.frameListeners, listener => listener(png)); };
  rememberProduced = (png: Buffer): void => { this.produced.push(createHash("sha256").update(png).digest("hex")); if (this.produced.length > 32) this.produced.shift(); };
  masked = (bytes: Uint8Array): boolean => this.produced.includes(createHash("sha256").update(bytes).digest("hex"));
  pendingPersonMove = (): boolean => Date.now() - this.lastPersonMove < ComputerDriver.settleMs;
  recordStep = (step: Parameters<ComputerRecords["step"]>[1], png?: Uint8Array): void => { if (this.lease?.record_id) this.options.records.step(this.lease.record_id, step, png); };
  noteInjected = (): void => { this.lastInjectAt = Date.now(); };
  noteWindow = (title: string): void => { this.seenTitle = title.trim(); };
  noteFile = (name: string): void => { const base = name.trim(); if (base && !this.seenFiles.includes(base)) this.seenFiles.push(base); };

  mark = (summary: string, point: { x: number; y: number } | null): void => {
    if (this.mode !== "assistant") return;
    this.activityNow = { summary, point, at: new Date().toISOString(), app: this.targetApp ? this.targetApp.name : null };
    this.changed();
  };

  pauseForPerson = (): void => { this.mode = "paused"; this.pausedReason = "person-input"; this.activityNow = null; this.changed(); };

  // ── state the person sees ────────────────────────────────────────────────

  onState(listener: (state: ComputerState) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  onFrame(listener: (png: Buffer) => void): () => void { this.frameListeners.add(listener); return () => { this.frameListeners.delete(listener); }; }

  /** The desktop driver the Agent Host attaches (one desk, one stable driver object). */
  driver(): HostSurfaceDriver { return this.surfaceDriver.surface(); }

  /** A fresh picture for the tab, when the person is watching and the computer is in use. */
  async refreshFrame(): Promise<void> {
    const lease = this.lease, target = this.targetApp;
    if (!lease || (this.mode !== "assistant" && this.mode !== "paused")) return;
    // A person's live preview may remain visible while paused, but it never follows a later lease or app.
    const current = () => { if (this.closed || this.lease !== lease || this.targetApp !== target) throw refused("driver-unavailable", "原预览已结束"); };
    await this.surfaceDriver.freshFrame(current).catch(() => undefined);
  }

  state(): ComputerState {
    const helper = this.options.helper, status = helper.status(), unsupported = helper.unsupported();
    const problem = unsupported ?? (helper.problem() ? { code: helper.problem()!, message: problemMessage(helper.problem()!) } : null);
    return {
      enabled: this.options.settings.enabled,
      helper: { state: unsupported ? (unsupported.code === "computer.unsupported" ? "unsupported" : "missing") : helper.ready ? "ready" : helper.problem() ? "crashed" : "stopped",
        problem, version: status?.version ?? null },
      permissions: status ? { ...status.permissions } : null,
      presence: this.presence(status),
      control: { mode: this.mode, work_id: this.lease?.session_id ?? null, paused_reason: this.pausedReason, activity: this.activityNow },
      target: this.targetApp ? { bundle_id: this.targetApp.bundle_id, name: this.targetApp.name, tier: this.targetApp.verdict.tier, reason: this.targetApp.verdict.reason } : null,
      allowed_this_round: this.allowedThisRound ? [...this.allowedThisRound.apps] : [],
      record_id: this.lease?.record_id ?? null,
    };
  }

  private presence(status: HelperStatus | null): ComputerState["presence"] {
    const presence = status?.presence;
    if (!presence) return { locked: false, away: false, reason: null };
    if (presence.locked) return { locked: true, away: false, reason: "屏幕已锁定" };
    if (presence.screensaver) return { locked: true, away: false, reason: "屏幕保护程序在运行" };
    if (presence.displays_asleep) return { locked: true, away: false, reason: "显示器在睡眠" };
    if (!presence.on_console) return { locked: true, away: false, reason: "这台 Mac 现在是别的用户在用" };
    if (presence.idle_seconds > AWAY_SECONDS) return { locked: false, away: true, reason: "用户已经十分钟没有动过鼠标键盘" };
    return { locked: false, away: false, reason: null };
  }

  changed(): void {
    const state = this.state();
    eachListener("computer", "desk_state", this.listeners, listener => listener(state));
  }

  // ── the person's controls ────────────────────────────────────────────────

  /** The person pauses the Assistant's use of the computer; every look and action is refused until they hand it back. */
  pause(): void { this.mode = "paused"; this.pausedReason = "person"; this.activityNow = null; this.changed(); }
  takeOver(): void { this.mode = "taken-over"; this.pausedReason = "person"; this.takeoverCount += 1; this.activityNow = null; this.changed(); }

  /** Back to the Assistant; what it saw before no longer counts, so it looks again first. */
  handBack(): void {
    if (this.mode === "idle" || this.mode === "assistant") return;
    this.mode = this.lease ? "assistant" : "idle";
    this.pausedReason = null;
    this.takeoverCount += 1;
    this.changed();
  }

  /** The person allowed the Assistant to act in this app for the rest of this round (D06); shown in the tab. */
  allowForRound(sessionId: string, bundleId: string): void {
    if (this.allowedThisRound?.session_id !== sessionId) this.allowedThisRound = { session_id: sessionId, apps: new Set() };
    this.allowedThisRound.apps.add(bundleId);
    this.changed();
  }

  /** A round of this session ended or was stopped: the computer is free again and its record is finished. */
  release(control: HostSurfaceContext, ended?: HostSurfaceRoundEnd): void {
    this.contexts.delete(control);
    if (this.lease?.control !== control) return;
    const record = this.lease.record_id ? this.options.records.get(this.lease.record_id) : null;
    if (record) {
      const unfinished = record.steps.filter(step => step.kind === "refused" || step.kind === "failed" || step.kind === "declined").map(step => step.summary);
      const judged = desktopRoundOutcome(record.goal, {
        ...(this.seenTitle ? { windowTitle: this.seenTitle } : {}),
        files: [...this.seenFiles],
        record: record.steps.map(step => step.summary),
      }, ended);
      this.options.records.finish(record.id, { outcome: judged.outcome, conclusion: judged.conclusion, unfinished });
    }
    this.seenTitle = "";
    this.seenFiles.length = 0;
    this.lease = null;
    this.lastInjectAt = null;
    this.targetApp = null;
    this.activityNow = null;
    this.allowedThisRound = null;
    this.produced.length = 0;
    if (this.mode === "assistant") this.mode = "idle";
    const generation = ++this.monitorGeneration;
    void this.options.helper.call("monitor", { on: false }, undefined, () => {
      if (this.monitorGeneration !== generation || this.lease) throw refused("driver-unavailable", "原监视已结束");
    }).catch(() => undefined);
    this.changed();
  }

  /** The round about to use the computer names its goal and ids, so the record the desk starts on first look names them. */
  describeRound(control: HostSurfaceContext, metadata: { readonly run_id: string | null; readonly project_id: string | null; readonly goal: string }): void {
    requireSynchronous(control.assertCurrent());
    this.contexts.set(control, metadata);
  }

  /** The round holding the computer, including the project its record was started for. Null when the computer is free. */
  holding(): { sessionId: string; projectId: string | null; lastInjectAt: number | null } | null {
    if (!this.lease) return null;
    const record = this.lease.record_id ? this.options.records.get(this.lease.record_id) : null;
    return { sessionId: this.lease.session_id, projectId: record?.project_id ?? null, lastInjectAt: this.lastInjectAt };
  }

  /** The run id arrives after attach; fold it into the round's context so the record names it (until the lease is taken). */
  noteRun(control: HostSurfaceContext, runId: string): void {
    requireSynchronous(control.assertCurrent());
    const context = this.contexts.get(control);
    if (context) this.contexts.set(control, { ...context, run_id: runId });
  }

  // ── readiness ────────────────────────────────────────────────────────────

  /** Whether the session may look or act at all right now; null when nothing stands in the way. */
  async readiness(control: HostSurfaceContext): Promise<{ refusal: HostSurfaceRefusal; detail: string } | null> {
    requireSynchronous(control.assertCurrent());
    if (!this.options.settings.enabled) return { refusal: "driver-unavailable", detail: "用户没有打开「允许助理使用电脑」。" };
    let status: HelperStatus;
    try { status = await this.options.helper.ensure(); } catch (error) { return { refusal: "driver-unavailable", detail: error instanceof Error ? error.message : "电脑助手不可用" }; }
    requireSynchronous(control.assertCurrent());
    if (this.closed) return { refusal: "driver-unavailable", detail: "电脑服务已关闭" };
    const missing = (Object.entries(status.permissions) as [string, boolean][]).filter(([, granted]) => !granted).map(([name]) =>
      name === "accessibility" ? "辅助功能" : name === "screen_recording" ? "屏幕录制" : "输入监控");
    if (missing.length) return { refusal: "driver-unavailable", detail: `电脑助手缺少系统权限：${missing.join("、")}。请用户在「电脑」标签里按引导授权。` };
    const presence = this.presence(status);
    if (presence.locked || presence.away) return { refusal: "screen-locked", detail: `${presence.reason ?? "用户不在"}，助理不操作电脑。` };
    if (this.mode === "taken-over") return { refusal: "person-present", detail: "用户已接手电脑，助理暂停；等用户交还后先重新观察。" };
    if (this.mode === "paused") return { refusal: "person-present", detail: this.pausedReason === "person-input"
      ? "用户动了鼠标或键盘，助理已暂停；等用户在「电脑」标签里交还后先重新观察。" : "用户暂停了助理对电脑的使用；等用户交还后先重新观察。" };
    if (this.lease && this.lease.control !== control) {
      return { refusal: "driver-unavailable", detail: "电脑正被另一项工作使用，这一轮不能用它。" };
    }
    return null;
  }

  async ready(control: HostSurfaceContext): Promise<void> {
    const blocked = await this.readiness(control);
    this.assertCurrent(control);
    if (blocked) throw refused(blocked.refusal, blocked.detail);
    // The first look or action of a round takes the computer for it, starts its record, and watches the person's input.
    if (!this.lease) {
      if (!control.session_id) throw refused("driver-unavailable", "电脑操作缺少原会话");
      const metadata = this.contexts.get(control);
      const record = this.options.records.start({ session_id: control.session_id, run_id: metadata?.run_id ?? null, project_id: metadata?.project_id ?? null, goal: metadata?.goal ?? "" });
      this.lease = { control, session_id: control.session_id, record_id: record.id };
      this.lastInjectAt = null;
      this.seenTitle = "";
      this.seenFiles.length = 0;
      this.contexts.delete(control);
      this.targetApp = null;
      this.mode = "assistant";
    }
    await this.monitor(this.lease!);
    this.assertReady(control); this.changed();
  }

  private async monitor(lease: NonNullable<ComputerDesk["lease"]>): Promise<void> {
    if (lease.monitoredGeneration === this.helper.generation && this.helper.ready) return;
    if (lease.monitoring) return lease.monitoring;
    const generation = ++this.monitorGeneration, helper = this.helper.generation;
    const current = () => {
      this.assertCurrent(lease.control);
      if (this.lease !== lease || this.monitorGeneration !== generation || this.helper.generation !== helper) throw refused("driver-unavailable", "原监视已结束");
    };
    lease.monitoring = this.helper.call<{ watching: boolean }>("monitor", { on: true }, undefined, current).then(result => {
      current();
      if (result.watching !== true) throw refused("driver-unavailable", "电脑助手未能启用输入监视");
      lease.monitoredGeneration = helper;
    }).finally(() => { lease.monitoring = undefined; });
    return lease.monitoring;
  }

  // ── what the helper tells ────────────────────────────────────────────────

  private heard(event: HelperEvent): void {
    if (event.event === "status" || event.event === "closed" || event.event === "watch_failed") {
      if (this.lease && (event.event !== "status" || !event.watching || Object.values(event.permissions).some(granted => granted !== true))) this.lease.monitoredGeneration = undefined;
      this.changed(); return;
    }
    const lease = this.lease;
    if (lease) { try { requireSynchronous(lease.control.assertCurrent()); } catch { return; } }
    if (event.event === "app_exit" && this.targetApp && event.pid === this.targetApp.pid) { this.note(`「${this.targetApp.name}」已经退出`); this.changed(); return; }
    if (event.event !== "input" || !this.lease || this.mode !== "assistant") return;
    if (event.kind === "move") { this.lastPersonMove = Date.now(); return; }
    // The person clicked, scrolled or typed somewhere other than Molis Work: they are using the computer, so the Assistant
    // stops at once and waits for them to hand it back. Using Molis Work itself — answering a card — does not count.
    void this.isMolisFront(event.front_pid).then(molis => {
      if (molis || !lease || this.lease !== lease || this.mode !== "assistant") return;
      try { requireSynchronous(lease.control.assertCurrent()); } catch { return; }
      this.pauseForPerson();
      this.note("用户动了鼠标或键盘，助理暂停");
    });
  }

  private async isMolisFront(pid: number): Promise<boolean> {
    try {
      const state = await this.options.helper.call<AppState>("app.state", { pid });
      return tierOf({ bundle_id: state.bundle_id, name: state.name }).reason.startsWith("Molis Work") || showsMolis(state.window?.title ?? "");
    } catch { return false; }
  }

  private note(summary: string): void {
    if (this.lease?.record_id) this.options.records.step(this.lease.record_id, { kind: "note", app: this.targetApp ? { bundle_id: this.targetApp.bundle_id, name: this.targetApp.name } : null, summary });
  }

  close(): void { this.closed = true; this.monitorGeneration++; this.unsubscribe(); this.listeners.clear(); this.frameListeners.clear(); }
}

function problemMessage(code: string): string {
  switch (code) {
    case "computer.crashed": return "电脑助手意外退出了；下一步会自动重新启动它。";
    case "computer.start_failed": return "电脑助手没能启动。";
    case "computer.restarting_too_often": return "电脑助手一分钟内反复退出，先停下；稍后再试。";
    default: return "电脑助手现在不可用。";
  }
}
