import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  HostSurfaceAction, HostSurfaceDriver, HostSurfaceObservationKind, HostSurfaceRefusal, HostSurfaceRefusalError,
} from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import type {
  ComputerActivity, ComputerControlMode, ComputerState,
} from "@molis-ai/molis-work-contracts/services/computer";
import { LOOK_AND_CLICK_ACTIONS, showsMolis, tierOf, type AppTierVerdict } from "./app-tiers.js";
import type { ComputerRecords } from "./computer-records.js";
import type { ComputerSettings } from "./computer-settings.js";
import { HelperError, type HelperConnection, type HelperEvent, type HelperStatus } from "./helper-connection.js";

/**
 * The person's Mac as one interface the Assistant may look at and act on (specs/computer-use). There is one desk per
 * Home: one computer, so one work at a time holds it (the lease), and the person can pause, stop, take over and hand
 * back at any moment. Prologue decides whether each look and action may happen; this driver only does it through the
 * helper, one app at a time, and refuses — with Prologue's four reasons — whatever it can see is not safe right now.
 *
 * Coordinates the Assistant reads and sends are points from the top-left corner of the target app's front window, the
 * same frame its screenshot shows; the driver converts to screen points only when it hands an action to the helper.
 */

/** The scope before any app is targeted: Prologue's `DESKTOP_NO_APP_SCOPE`, which no app rule matches. */
export const NO_APP_SCOPE = "desktop:no-app";

/** Moves of the person's mouse this recent make the next action wait for the mouse to settle. */
const SETTLE_MS = 600;
/** No input for this long while nothing is locked: the person is away, and the Assistant does not act. */
const AWAY_SECONDS = 10 * 60;
const TREE_TEXT_BUDGET = 22_000;

const ROLE_NAMES: Readonly<Record<string, string>> = {
  AXButton: "按钮", AXTextField: "文本框", AXTextArea: "文本区", AXStaticText: "文字", AXCheckBox: "复选框", AXRadioButton: "单选按钮",
  AXPopUpButton: "弹出菜单", AXMenuButton: "菜单按钮", AXLink: "链接", AXTab: "标签", AXRow: "行", AXCell: "单元格", AXImage: "图像",
  AXSlider: "滑块", AXComboBox: "组合框", AXMenuItem: "菜单项", AXMenuBarItem: "菜单", AXGroup: "组", AXScrollArea: "滚动区",
  AXTable: "表格", AXOutline: "大纲", AXList: "列表", AXToolbar: "工具栏", AXWebArea: "网页区域", AXHeading: "标题",
  AXDisclosureTriangle: "展开按钮", AXIncrementor: "步进器", AXSegmentedControl: "分段控件", AXSwitch: "开关", AXWindow: "窗口",
};

/** Words on a control or menu item that mean the step cannot be taken back. */
const IRREVERSIBLE_WORDS = /发送|send\b|提交|submit|删除|delete|移到废纸篓|move to trash|清空|empty trash|抹掉|erase|付款|支付|\bpay\b|购买|buy\b|purchase|下单|place order|转账|transfer|发布|publish|\bpost\b|回复全部|reply all|签署|sign\b|确认订单|checkout|永久/iu;
/** Apps where Return in a text field sends a message. */
const MESSAGING_APP = /微信|wechat|messages|信息|mail|邮件|slack|telegram|discord|钉钉|dingtalk|飞书|lark|\bqq\b|whatsapp|signal|teams|outlook|spark|airmail/iu;

interface TreeNode {
  readonly role: string; readonly subrole?: string; readonly name?: string; readonly value?: string; readonly depth: number;
  readonly frame?: readonly [number, number, number, number]; readonly disabled?: boolean; readonly focused?: boolean;
  readonly selected?: boolean; readonly expanded?: boolean; readonly secure?: boolean; readonly filled?: boolean;
}
interface AppState {
  readonly bundle_id: string; readonly name: string; readonly pid: number; readonly active: boolean; readonly hidden: boolean; readonly front_pid: number;
  readonly window?: { readonly title: string; readonly frame: readonly [number, number, number, number]; readonly window_id: number; readonly document: string };
  readonly windows?: readonly { readonly title: string; readonly frame: readonly number[]; readonly focused: boolean; readonly minimized: boolean }[];
}
interface Target { readonly bundle_id: string; readonly name: string; pid: number; readonly verdict: AppTierVerdict }

class Refused extends Error implements HostSurfaceRefusalError {
  constructor(readonly refusal: HostSurfaceRefusal, message: string, readonly partial = false) { super(message); this.name = "HostSurfaceRefused"; }
}

export interface ComputerDeskOptions {
  readonly helper: HelperConnection;
  readonly settings: ComputerSettings;
  readonly records: ComputerRecords;
  /** Whether a session's round is still running (a lease a finished round left behind is free again). */
  readonly live?: (sessionId: string) => boolean;
}

export class ComputerDesk {
  private mode: ComputerControlMode = "idle";
  private pausedReason: "person-input" | "person" | null = null;
  private lease: { session_id: string; record_id: string | null } | null = null;
  private target: Target | null = null;
  private activity: ComputerActivity | null = null;
  /** Grows on every take-over and hand-back: older observations no longer match, so the Assistant looks again. */
  private takeovers = 0;
  private lastPersonMove = 0;
  private readonly produced: string[] = [];
  private readonly listeners = new Set<(state: ComputerState) => void>();
  private readonly frameListeners = new Set<(png: Buffer) => void>();
  private allowedThisRound: { session_id: string; apps: Set<string> } | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly options: ComputerDeskOptions) {
    this.unsubscribe = options.helper.on(event => this.heard(event));
  }

  // ── state the person sees ────────────────────────────────────────────────

  onState(listener: (state: ComputerState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  onFrame(listener: (png: Buffer) => void): () => void {
    this.frameListeners.add(listener);
    return () => { this.frameListeners.delete(listener); };
  }

  state(): ComputerState {
    const helper = this.options.helper;
    const status = helper.status();
    const unsupported = helper.unsupported();
    const problem = unsupported ?? (helper.problem() ? { code: helper.problem()!, message: this.problemMessage(helper.problem()!) } : null);
    return {
      enabled: this.options.settings.enabled,
      helper: { state: unsupported ? (unsupported.code === "helper.unsupported" ? "unsupported" : "missing") : helper.ready ? "ready" : helper.problem() ? "crashed" : "stopped",
        problem, version: status?.version ?? null },
      permissions: status ? { ...status.permissions } : null,
      presence: this.presence(status),
      control: { mode: this.mode, work_id: this.lease?.session_id ?? null, paused_reason: this.pausedReason, activity: this.activity },
      target: this.target ? { bundle_id: this.target.bundle_id, name: this.target.name, tier: this.target.verdict.tier, reason: this.target.verdict.reason } : null,
      allowed_this_round: this.allowedThisRound ? [...this.allowedThisRound.apps] : [],
      record_id: this.lease?.record_id ?? null,
    };
  }

  private problemMessage(code: string): string {
    switch (code) {
      case "helper.crashed": return "电脑助手意外退出了；下一步会自动重新启动它。";
      case "helper.start_failed": return "电脑助手没能启动。";
      case "helper.restarting_too_often": return "电脑助手一分钟内反复退出，先停下；稍后再试。";
      default: return "电脑助手现在不可用。";
    }
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

  private changed(): void {
    const state = this.state();
    for (const listener of this.listeners) { try { listener(state); } catch { /* a listener's failure does not stop the others */ } }
  }

  private frame(png: Buffer): void {
    for (const listener of this.frameListeners) { try { listener(png); } catch { /* same */ } }
  }

  // ── the person's controls ────────────────────────────────────────────────

  /** The person pauses the Assistant's use of the computer; every look and action is refused until they hand it back. */
  pause(): void { this.mode = "paused"; this.pausedReason = "person"; this.activity = null; this.changed(); }

  takeOver(): void { this.mode = "taken-over"; this.pausedReason = "person"; this.takeovers += 1; this.activity = null; this.changed(); }

  /** Back to the Assistant; what it saw before no longer counts, so it looks again first. */
  handBack(): void {
    if (this.mode === "idle" || this.mode === "assistant") return;
    this.mode = this.lease ? "assistant" : "idle";
    this.pausedReason = null;
    this.takeovers += 1;
    this.changed();
  }

  /** The person allowed the Assistant to act in this app for the rest of this round (D06); shown in the tab. */
  allowForRound(sessionId: string, bundleId: string): void {
    if (this.allowedThisRound?.session_id !== sessionId) this.allowedThisRound = { session_id: sessionId, apps: new Set() };
    this.allowedThisRound.apps.add(bundleId);
    this.changed();
  }

  /** A round of this session ended or was stopped: the computer is free again and its record is finished. */
  release(sessionId: string, outcome?: { readonly outcome: "completed" | "failed" | "stopped"; readonly conclusion: string }): void {
    if (this.lease?.session_id !== sessionId) return;
    const record = this.lease.record_id ? this.options.records.get(this.lease.record_id) : null;
    if (record) {
      const unfinished = record.steps.filter(step => step.kind === "refused" || step.kind === "failed" || step.kind === "declined").map(step => step.summary);
      this.options.records.finish(record.id, { outcome: outcome?.outcome ?? "completed", conclusion: outcome?.conclusion ?? "", unfinished });
    }
    this.lease = null;
    this.target = null;
    this.activity = null;
    this.allowedThisRound = null;
    if (this.mode === "assistant") this.mode = "idle";
    void this.options.helper.call("monitor", { on: false }).catch(() => undefined);
    this.changed();
  }

  /** The record of the round that holds the computer now, started on its first look. */
  startRecord(sessionId: string, input: { readonly run_id: string | null; readonly project_id: string | null; readonly goal: string }): string | null {
    if (this.lease?.session_id !== sessionId) return null;
    if (!this.lease.record_id) this.lease.record_id = this.options.records.start({ session_id: sessionId, ...input }).id;
    this.changed();
    return this.lease.record_id;
  }

  // ── what the helper tells ────────────────────────────────────────────────

  private heard(event: HelperEvent): void {
    if (event.event === "status" || event.event === "closed" || event.event === "watch_failed") { this.changed(); return; }
    if (event.event === "app_exit" && this.target && event.pid === this.target.pid) {
      this.note(`「${this.target.name}」已经退出`);
      this.changed();
      return;
    }
    if (event.event !== "input" || !this.lease || this.mode !== "assistant") return;
    if (event.kind === "move") { this.lastPersonMove = Date.now(); return; }
    // The person clicked, scrolled or typed somewhere other than Molis Work: they are using the computer, so the Assistant
    // stops at once and waits for them to hand it back (goal §3). Using Molis Work itself — answering a card, writing to the
    // Assistant — does not count.
    void this.isMolisFront(event.front_pid).then(molis => {
      if (molis || !this.lease || this.mode !== "assistant") return;
      this.mode = "paused";
      this.pausedReason = "person-input";
      this.activity = null;
      this.note("用户动了鼠标或键盘，助理暂停");
      this.changed();
    });
  }

  private async isMolisFront(pid: number): Promise<boolean> {
    try {
      const state = await this.options.helper.call<AppState>("app.state", { pid });
      return tierOf({ bundle_id: state.bundle_id, name: state.name }).reason.startsWith("Molis Work") || showsMolis(state.window?.title ?? "");
    } catch { return false; }
  }

  private note(summary: string): void {
    if (this.lease?.record_id) this.options.records.step(this.lease.record_id, { kind: "note", app: this.appRef(), summary });
  }

  private appRef(): { bundle_id: string; name: string } | null {
    return this.target ? { bundle_id: this.target.bundle_id, name: this.target.name } : null;
  }

  // ── readiness ────────────────────────────────────────────────────────────

  /** Whether the session may look or act at all right now; null when nothing stands in the way. */
  async readiness(sessionId: string | null): Promise<{ refusal: HostSurfaceRefusal; detail: string } | null> {
    if (!this.options.settings.enabled) return { refusal: "driver-unavailable", detail: "用户没有打开「允许助理使用电脑」。" };
    let status: HelperStatus;
    try { status = await this.options.helper.ensure(); } catch (error) {
      return { refusal: "driver-unavailable", detail: error instanceof Error ? error.message : "电脑助手不可用" };
    }
    const missing = (Object.entries(status.permissions) as [string, boolean][]).filter(([, granted]) => !granted).map(([name]) =>
      name === "accessibility" ? "辅助功能" : name === "screen_recording" ? "屏幕录制" : "输入监控");
    if (missing.length) return { refusal: "driver-unavailable", detail: `电脑助手缺少系统权限：${missing.join("、")}。请用户在「电脑」标签里按引导授权。` };
    const presence = this.presence(status);
    if (presence.locked || presence.away) return { refusal: "screen-locked", detail: `${presence.reason ?? "用户不在"}，助理不操作电脑。` };
    if (this.mode === "taken-over") return { refusal: "person-present", detail: "用户已接手电脑，助理暂停；等用户交还后先重新观察。" };
    if (this.mode === "paused") return { refusal: "person-present", detail: this.pausedReason === "person-input"
      ? "用户动了鼠标或键盘，助理已暂停；等用户在「电脑」标签里交还后先重新观察。" : "用户暂停了助理对电脑的使用；等用户交还后先重新观察。" };
    if (sessionId && this.lease && this.lease.session_id !== sessionId && (this.options.live?.(this.lease.session_id) ?? true)) {
      return { refusal: "driver-unavailable", detail: "电脑正被另一项工作使用，这一轮不能用它。" };
    }
    return null;
  }

  private async ready(sessionId: string | null): Promise<void> {
    const blocked = await this.readiness(sessionId);
    if (blocked) throw new Refused(blocked.refusal, blocked.detail);
    // The first look or action of a round takes the computer for it; the person's input is watched from then on.
    if (sessionId && (!this.lease || this.lease.session_id !== sessionId)) {
      this.lease = { session_id: sessionId, record_id: null };
      this.target = null;
      this.mode = "assistant";
      await this.options.helper.call("monitor", { on: true }).catch(() => undefined);
      this.changed();
    }
  }

  // ── the driver ───────────────────────────────────────────────────────────

  /** The desktop driver the Agent Host attaches for one round (specs/computer-use; contract `HostSurfaceDriver`). */
  driver(): HostSurfaceDriver {
    return {
      kind: "desktop",
      project_id: null,
      identity: () => this.identity(),
      scope: async () => this.target?.bundle_id ?? NO_APP_SCOPE,
      readiness: context => this.readiness(context.session_id),
      observe: (kind, context) => this.observe(kind, context?.session_id ?? null),
      perform: (action, context) => this.perform(action, context.session_id),
      release: async () => { if (this.lease) this.release(this.lease.session_id); },
      close: async () => { if (this.lease) this.release(this.lease.session_id); },
      describePoint: async (x, y) => this.describePoint(x, y),
      focusedField: async () => this.focusedField(),
      assess: action => this.assess(action),
      currentApp: async () => this.appRef(),
      masked: bytes => this.produced.includes(createHash("sha256").update(bytes).digest("hex")),
    };
  }

  private async appState(): Promise<AppState> {
    if (!this.target) throw new Error("还没有选定要操作的应用");
    try { return await this.options.helper.call<AppState>("app.state", { pid: this.target.pid }); }
    catch (error) {
      // The app quit and came back under another process: find it again by its bundle id.
      if (error instanceof HelperError && error.code === "app.gone") {
        const running = await this.options.helper.call<{ apps: AppState[] }>("apps.running");
        const again = running.apps.find(app => app.bundle_id === this.target!.bundle_id);
        if (!again) throw new Error(`「${this.target.name}」已经退出了`);
        this.target.pid = again.pid;
        return this.options.helper.call<AppState>("app.state", { pid: again.pid });
      }
      throw error;
    }
  }

  /** Which app, which window, where it is and what it is called, and how often the person took over: equal or stale. */
  private async identity(): Promise<string> {
    if (!this.target) return `none\u0000${this.takeovers}`;
    const state = await this.appState();
    const window = state.window;
    return [state.bundle_id, state.pid, window?.window_id ?? 0, (window?.frame ?? []).join(","), window?.title ?? "", this.takeovers].join("\u0000");
  }

  private forbidCheck(state: AppState): void {
    const verdict = tierOf({ bundle_id: state.bundle_id, name: state.name }, this.options.settings.forbiddenIds());
    if (verdict.tier === "forbidden") throw new Error(`禁区：${verdict.reason}`);
    if (showsMolis(state.window?.title ?? "")) throw new Error("禁区：这个窗口显示着 Molis Work，助理不能操作自己的确认卡");
  }

  private async observe(kind: HostSurfaceObservationKind, sessionId: string | null): Promise<Uint8Array> {
    await this.ready(sessionId);
    if (!this.target) {
      if (kind === "screenshot") throw new Error("还没有选定应用：先用 surface-act 的 app 动作打开或切到一个应用");
      return new TextEncoder().encode(await this.appsText());
    }
    const state = await this.appState();
    this.forbidCheck(state);
    if (!state.window) throw new Error(`「${this.target.name}」现在没有打开的窗口`);
    this.mark(`正在查看「${this.target.name}」`, null);
    if (kind === "screenshot") {
      const png = await this.screenshot(state);
      this.produced.push(createHash("sha256").update(png).digest("hex"));
      if (this.produced.length > 32) this.produced.shift();
      this.recordStep({ kind: "look", app: this.appRef(), summary: `查看「${this.target.name}」的窗口截图` }, png);
      return png;
    }
    if (kind === "window-metadata") {
      const [x, y] = state.window.frame;
      return new TextEncoder().encode(JSON.stringify({ app: { bundle_id: state.bundle_id, name: state.name }, window: { title: state.window.title,
        width: state.window.frame[2], height: state.window.frame[3] }, windows: (state.windows ?? []).map(one => ({ title: one.title, focused: one.focused,
          minimized: one.minimized, at: [Number(one.frame[0]) - x, Number(one.frame[1]) - y], size: [one.frame[2], one.frame[3]] })) }));
    }
    if (kind === "dom") throw new Error("桌面应用没有 DOM：请用 accessibility-tree 观察");
    const tree = await this.options.helper.call<{ window: { title: string; frame: [number, number, number, number] }; nodes: TreeNode[]; truncated: boolean; menus: string[] }>(
      "observe.tree", { pid: this.target.pid, max_nodes: 600 });
    const text = this.treeText(state, tree);
    // The words go to the model; the person's record and the tab get the picture of the same moment.
    const png = await this.screenshot(state).catch(() => undefined);
    this.recordStep({ kind: "look", app: this.appRef(), summary: `查看「${this.target.name}」的窗口（${state.window.title || "无标题"}）` }, png);
    return new TextEncoder().encode(text);
  }

  private async appsText(): Promise<string> {
    const running = await this.options.helper.call<{ apps: { bundle_id: string; name: string; active: boolean }[] }>("apps.running");
    const forbidden = this.options.settings.forbiddenIds();
    const lines = running.apps.map(app => {
      const verdict = tierOf(app, forbidden);
      const tier = verdict.tier === "forbidden" ? "禁区，不能查看或操作" : verdict.tier === "look-and-click" ? "只能看和点，不能输入或按键" : "可以操作，每一步先问用户";
      return `- ${app.name}（${app.bundle_id}）：${tier}`;
    });
    return [
      "还没有选定要操作的应用。正在运行的应用：",
      ...lines,
      "",
      "要操作某个应用：用 surface-act 的 app 动作（app 填上面括号里的标识，也可以填没在运行、但装在这台电脑上的应用标识），用户确认后会打开或切到它；再用 surface-observe 看它的窗口。",
    ].join("\n");
  }

  private treeText(state: AppState, tree: { window: { title: string; frame: [number, number, number, number] }; nodes: TreeNode[]; truncated: boolean; menus: string[] }): string {
    const [ox, oy, width, height] = tree.window.frame;
    const lines: string[] = [
      `应用：${state.name}（${state.bundle_id}）`,
      `窗口：「${tree.window.title || "无标题"}」，${width}×${height}。坐标以这个窗口的左上角为原点，单位是点；点击、滚动、拖动、悬停都用这里的坐标。`,
      ...(tree.menus.length ? [`菜单栏：${tree.menus.join("、")}（用 surface-act 的 menu 动作按菜单路径选，例如 ["${tree.menus[1] ?? tree.menus[0]}", "…"]）`] : []),
      "",
      "窗口里的元素（@ 后是点击用的中心坐标）：",
    ];
    let used = lines.join("\n").length;
    let index = 0;
    for (const node of tree.nodes) {
      const role = node.subrole === "AXSecureTextField" ? "密码框" : node.subrole === "AXSearchField" ? "搜索框" : ROLE_NAMES[node.role] ?? node.role.replace(/^AX/u, "");
      const states = [node.disabled ? "不可用" : "", node.focused ? "有焦点" : "", node.selected ? "已选中" : "", node.expanded ? "已展开" : ""].filter(Boolean);
      const value = node.secure ? (node.filled ? "（已填写，已隐藏）" : "") : node.value && node.value !== node.name ? ` 值=${node.value.replace(/\s+/gu, " ").slice(0, 300)}` : "";
      const at = node.frame && node.frame[2] > 0 && node.frame[3] > 0
        ? ` @(${Math.round(node.frame[0] - ox + node.frame[2] / 2)},${Math.round(node.frame[1] - oy + node.frame[3] / 2)})` : "";
      const name = node.name ? `「${node.name.replace(/\s+/gu, " ")}」` : node.role === "AXStaticText" ? "" : "「无名称」";
      const line = `${"  ".repeat(Math.min(node.depth, 6))}[${++index}] ${role}${name}${value}${states.length ? ` （${states.join("、")}）` : ""}${at}`;
      if (used + line.length > TREE_TEXT_BUDGET) { lines.push("（元素较多，后面的没有列出；可以滚动后再观察，或者看截图）"); break; }
      lines.push(line);
      used += line.length + 1;
    }
    if (tree.truncated) lines.push("（元素较多，只列出前 600 个）");
    if (tree.nodes.some(node => node.secure)) lines.push("", "密码类输入框的内容不显示，助理也不替用户输入；需要登录时请用户自己完成。");
    return lines.join("\n");
  }

  private async screenshot(state: AppState): Promise<Buffer> {
    const shot = await this.options.helper.call<{ png: string }>("observe.screenshot", { pid: state.pid, rect: state.window!.frame, scale: 1 });
    const png = Buffer.from(shot.png, "base64");
    this.frame(png);
    return png;
  }

  /** A fresh picture for the tab, when the person is watching and the computer is in use. */
  async refreshFrame(): Promise<void> {
    if (!this.target || !this.lease || (this.mode !== "assistant" && this.mode !== "paused")) return;
    const state = await this.appState();
    this.forbidCheck(state);
    if (state.window) await this.screenshot(state);
  }

  private mark(summary: string, point: { x: number; y: number } | null): void {
    if (this.mode !== "assistant") return;
    this.activity = { summary, point, at: new Date().toISOString(), app: this.target ? this.target.name : null };
    this.changed();
  }

  private recordStep(step: Parameters<ComputerRecords["step"]>[1], png?: Uint8Array): void {
    if (this.lease?.record_id) this.options.records.step(this.lease.record_id, step, png);
  }

  /** Waits for the person's mouse to settle before the Assistant moves it; refuses when it does not. */
  private async settled(): Promise<void> {
    for (let waited = 0; Date.now() - this.lastPersonMove < SETTLE_MS; waited += 100) {
      if (waited >= 2_000) {
        this.mode = "paused"; this.pausedReason = "person-input"; this.activity = null; this.changed();
        throw new Refused("person-present", "用户正在用鼠标，助理暂停；等用户交还后先重新观察。");
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async perform(action: HostSurfaceAction, sessionId: string | null): Promise<void> {
    await this.ready(sessionId);
    if (action.what === "app") return this.switchApp(action.app);
    if (action.what === "navigate") throw new Error("桌面应用没有网址可打开；网页上的事用侧栏浏览器");
    if (!this.target) throw new Error("还没有选定应用：先用 app 动作打开或切到一个应用");
    const target = this.target;
    const state = await this.appState();
    this.forbidCheck(state);
    if (target.verdict.tier === "look-and-click" && !LOOK_AND_CLICK_ACTIONS.has(action.what)) {
      throw new Error(`「${target.name}」只能看和点：助理不能在这里输入或按键（命令走 Coding）`);
    }
    if (!state.window) throw new Error(`「${target.name}」现在没有打开的窗口`);
    const [ox, oy] = state.window.frame;
    const at = (x: number, y: number): [number, number] => [ox + x, oy + y];
    const pid = target.pid;
    try {
      switch (action.what) {
        case "pointer": {
          await this.settled();
          await this.landsOnTarget(at(action.x, action.y));
          const label = await this.describePoint(action.x, action.y);
          const verb = action.button === "right" ? "右键点击" : action.clicks > 1 ? "双击" : "点击";
          this.mark(`在「${target.name}」${verb}${label ? `「${label}」` : `（${action.x}, ${action.y}）`}`, { x: action.x, y: action.y });
          await this.options.helper.call("input.pointer", { pid, point: at(action.x, action.y), button: action.button, clicks: action.clicks });
          break;
        }
        case "hover":
          await this.settled();
          await this.landsOnTarget(at(action.x, action.y));
          this.mark(`在「${target.name}」把鼠标移到（${action.x}, ${action.y}）`, { x: action.x, y: action.y });
          await this.options.helper.call("input.hover", { pid, point: at(action.x, action.y) });
          break;
        case "scroll":
          await this.settled();
          await this.landsOnTarget(at(action.x, action.y));
          this.mark(`在「${target.name}」滚动`, { x: action.x, y: action.y });
          await this.options.helper.call("input.scroll", { pid, point: at(action.x, action.y), dx: action.dx, dy: action.dy });
          break;
        case "drag":
          await this.settled();
          await this.landsOnTarget(at(action.x, action.y));
          await this.landsOnTarget(at(action.to_x, action.to_y));
          this.mark(`在「${target.name}」从（${action.x}, ${action.y}）拖到（${action.to_x}, ${action.to_y}）`, { x: action.to_x, y: action.to_y });
          await this.options.helper.call("input.drag", { pid, from: at(action.x, action.y), to: at(action.to_x, action.to_y) });
          break;
        case "key":
          await this.settled();
          this.mark(`在「${target.name}」按下 ${action.keys.join(" + ")}`, null);
          await this.options.helper.call("input.key", { pid, keys: action.keys });
          break;
        case "text": {
          await this.settled();
          const field = await this.focusedField();
          if (field.sensitive) throw new Error("焦点在密码类输入框里：助理不替用户输入密码，请用户自己完成");
          this.mark(`在「${target.name}」${field.label ? `的「${field.label}」里` : ""}输入 ${[...action.text].length} 个字`, null);
          await this.options.helper.call("input.text", { pid, text: action.text });
          break;
        }
        case "menu":
          this.mark(`在「${target.name}」选择菜单 ${action.path.join(" › ")}`, null);
          await this.options.helper.call("input.menu", { pid, path: action.path });
          break;
        case "wait": {
          const ms = Math.max(0, Math.min(action.ms, 10_000));
          this.mark(`等待「${target.name}」（${Math.round(ms / 100) / 10} 秒）`, null);
          await new Promise(resolve => setTimeout(resolve, ms));
          break;
        }
        case "upload": {
          const file = path.resolve(path.sep, ...action.from);
          this.mark(`把本机文件 ${path.basename(file)} 交给「${target.name}」`, null);
          await this.options.helper.call("file.give", { pid, path: file });
          break;
        }
        case "download": {
          const destination = this.downloadDestination(action.to);
          const document = await this.options.helper.call<{ path: string }>("document", { pid });
          if (!document.path) throw new Error(`「${target.name}」的前窗没有对应的文件可取出`);
          this.mark(`从「${target.name}」取出 ${path.basename(document.path)}，存到 ${destination}`, null);
          fs.copyFileSync(document.path, destination, fs.constants.COPYFILE_EXCL);
          break;
        }
      }
    } catch (error) {
      throw this.translate(error);
    }
    // The picture after the step, for the person's tab and the record (Prologue's receipt is added by the Agent Host).
    void this.afterStep();
  }

  private async afterStep(): Promise<void> {
    try { await this.refreshFrame(); } catch { /* a missing picture does not undo the step */ }
  }

  /** Destination of a file taken out of an app: a new file in the person's Downloads folder, never overwriting one. */
  private downloadDestination(to: readonly string[]): string {
    const downloads = path.join(os.homedir(), "Downloads");
    if (to.some(segment => segment === "..")) throw new Error("取出文件的位置不能含「..」");
    const resolved = to.length === 1 ? path.join(downloads, to[0]!) : path.resolve(path.sep, ...to);
    if (path.dirname(resolved) !== downloads) throw new Error("从应用取出的文件只能存进「下载」文件夹");
    if (fs.existsSync(resolved)) throw new Error(`「下载」里已经有 ${path.basename(resolved)}，换个文件名`);
    return resolved;
  }

  private async switchApp(bundleId: string): Promise<void> {
    const installed = await this.options.helper.call<{ apps: { bundle_id: string; name: string }[] }>("apps.installed");
    const running = await this.options.helper.call<{ apps: { bundle_id: string; name: string }[] }>("apps.running");
    const known = running.apps.find(app => app.bundle_id === bundleId) ?? installed.apps.find(app => app.bundle_id === bundleId);
    if (!known) throw new Error(`这台电脑上没有应用「${bundleId}」：先观察一次，看正在运行的应用列表`);
    const verdict = tierOf(known, this.options.settings.forbiddenIds());
    if (verdict.tier === "forbidden") throw new Error(`禁区：${verdict.reason}`);
    await this.settled();
    this.mark(`打开或切到「${known.name}」`, null);
    let state: AppState;
    try { state = await this.options.helper.call<AppState>("app.open", { bundle_id: bundleId }, 30_000); }
    catch (error) { throw this.translate(error); }
    // Prologue judged the switch by exactly this identity: an app that answers to another one is not the app approved.
    if (state.bundle_id !== bundleId) throw new Refused("outside-target", `打开的应用是「${state.bundle_id}」，不是要求的「${bundleId}」`);
    this.target = { bundle_id: bundleId, name: state.name || known.name, pid: state.pid, verdict };
    this.forbidCheck(state);
    this.changed();
    void this.afterStep();
  }

  /** The point is on the target app and not on a window that shows Molis Work. The helper checks again at the last moment. */
  private async landsOnTarget(point: [number, number]): Promise<void> {
    const probe = await this.options.helper.call<{ window: { pid?: number; owner?: string }; element?: { pid: number; window_title: string } }>("probe.point", { point });
    if (probe.element && showsMolis(probe.element.window_title)) throw new Refused("outside-target", "落点在显示着 Molis Work 的窗口上：助理不能操作自己的确认卡");
  }

  private async describePoint(x: number, y: number): Promise<string> {
    if (!this.target) return "";
    try {
      const state = await this.appState();
      if (!state.window) return "";
      const probe = await this.options.helper.call<{ element?: { pid: number; name: string; role: string } }>("probe.point",
        { point: [state.window.frame[0] + x, state.window.frame[1] + y] });
      if (!probe.element || probe.element.pid !== this.target.pid) return "";
      return probe.element.name.replace(/\s+/gu, " ").trim().slice(0, 40);
    } catch { return ""; }
  }

  private async focusedField(): Promise<{ label: string; sensitive: boolean }> {
    if (!this.target) return { label: "", sensitive: false };
    try {
      const field = await this.options.helper.call<{ name: string; secure: boolean }>("focused.field", { pid: this.target.pid });
      return { label: field.name, sensitive: field.secure };
    } catch { return { label: "", sensitive: false }; }
  }

  /**
   * Whether an action cannot be taken back: a click or menu item named like send / delete / pay / submit, a Cmd+Return or
   * Cmd+Delete, Return in a messaging app, or anything handing a file over. When the driver cannot tell, it says
   * irreversible: the person is asked once more rather than once too few.
   */
  private async assess(action: HostSurfaceAction): Promise<{ irreversible: boolean; why: string }> {
    try {
      switch (action.what) {
        case "pointer": {
          const label = await this.describePoint(action.x, action.y);
          return IRREVERSIBLE_WORDS.test(label) ? { irreversible: true, why: `点击「${label}」可能无法撤回` } : { irreversible: false, why: "" };
        }
        case "menu": {
          const last = action.path.at(-1) ?? "";
          return IRREVERSIBLE_WORDS.test(last) ? { irreversible: true, why: `菜单项「${last}」可能无法撤回` } : { irreversible: false, why: "" };
        }
        case "key": {
          const keys = action.keys.flatMap(key => key.split("+")).map(key => key.trim().toLowerCase());
          const command = keys.some(key => ["cmd", "command", "meta"].includes(key));
          const enter = keys.some(key => key === "return" || key === "enter");
          const remove = keys.some(key => key === "delete" || key === "backspace" || key === "forwarddelete");
          if (command && (enter || remove)) return { irreversible: true, why: `${action.keys.join("+")} 常用来发送或删除` };
          if (enter && this.target && MESSAGING_APP.test(this.target.name)) return { irreversible: true, why: `在「${this.target.name}」里按回车通常会发送` };
          return { irreversible: false, why: "" };
        }
        case "upload": case "download":
          return { irreversible: true, why: "交出或取出文件算对外发送" };
        default:
          return { irreversible: false, why: "" };
      }
    } catch {
      return { irreversible: true, why: "判断不出这一步能不能撤回，按不能撤回处理" };
    }
  }

  private translate(error: unknown): Error {
    if (error instanceof Refused) return error;
    if (error instanceof HelperError) {
      switch (error.code) {
        case "person.present":
          this.mode = "paused"; this.pausedReason = "person-input"; this.activity = null; this.changed();
          // Some of the step's events may have landed already: Prologue settles it as needing reconciliation, never replays it.
          return new Refused("person-present", "用户动了鼠标或键盘，这一步停在半途，助理暂停；等用户交还后先重新观察。", true);
        case "landing.covered": return new Refused("outside-target", `${error.message}；不点，先重新观察。`);
        case "permission.accessibility": case "permission.screen_recording": case "helper.crashed": case "helper.timeout":
        case "helper.unsupported": case "helper.missing": case "helper.start_failed": case "helper.restarting_too_often":
          return new Refused("driver-unavailable", error.message);
        default: return new Error(error.message);
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  close(): void { this.unsubscribe(); this.listeners.clear(); this.frameListeners.clear(); }
}

