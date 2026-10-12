import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HostSurfaceAction, HostSurfaceDriver, HostSurfaceObservationKind, HostSurfaceRefusal, HostSurfaceRefusalError } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import type { ComputerActivity } from "@molis-ai/molis-work-contracts/services/computer";
import { tierOf, type AppTierVerdict } from "./app-tiers.js";
import { refuseCapture, refuseDespiteWindowText, refuseLanding, refuseSelfApproval, type LandingProbe } from "./computer-policy.js";
import type { ComputerRecords } from "./computer-records.js";
import { HelperError, type HelperConnection } from "./helper-connection.js";

/** The scope before any app is targeted: Prologue's `DESKTOP_NO_APP_SCOPE`, which no app rule matches. */
export const NO_APP_SCOPE = "desktop:no-app";

/** Moves of the person's mouse this recent make the next action wait for the mouse to settle. */
const SETTLE_MS = 600;
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

export interface TreeNode {
  readonly role: string; readonly subrole?: string; readonly name?: string; readonly value?: string; readonly depth: number;
  readonly frame?: readonly [number, number, number, number]; readonly disabled?: boolean; readonly focused?: boolean;
  readonly selected?: boolean; readonly expanded?: boolean; readonly secure?: boolean; readonly filled?: boolean;
}
export interface AppState {
  readonly bundle_id: string; readonly name: string; readonly pid: number; readonly active: boolean; readonly hidden: boolean; readonly front_pid: number;
  readonly window?: { readonly title: string; readonly frame: readonly [number, number, number, number]; readonly window_id: number; readonly document: string };
  readonly windows?: readonly { readonly title: string; readonly frame: readonly number[]; readonly focused: boolean; readonly minimized: boolean }[];
}
export interface Target { readonly bundle_id: string; readonly name: string; pid: number; readonly verdict: AppTierVerdict }
type Tree = { window: { title: string; frame: [number, number, number, number] }; nodes: TreeNode[]; truncated: boolean; menus: string[] };

export class Refused extends Error implements HostSurfaceRefusalError {
  constructor(readonly refusal: HostSurfaceRefusal, message: string, readonly partial = false) { super(message); this.name = "HostSurfaceRefused"; }
}

/** A refusal is written on the round's record before it leaves the driver, so the words survive Prologue's refusal code. */
function rememberRefusal(ctx: DeskContext, app: { bundle_id: string; name: string } | null, error: Error): never {
  if (error instanceof Refused) ctx.recordStep({ kind: "refused", app, summary: error.message });
  throw error;
}

/** The target app's accessibility tree, as window-relative text for the model. */
function renderTree(state: AppState, tree: Tree): string {
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

/** The running apps and their tier, when no app is targeted yet. */
function renderApps(apps: readonly { bundle_id: string; name: string }[], forbidden: readonly string[]): string {
  const lines = apps.map(app => {
    const verdict = tierOf(app, forbidden);
    const tier = verdict.tier === "forbidden" ? "禁区，不能查看或操作" : verdict.tier === "look-and-click" ? "只能看和点，不能输入或按键" : "可以操作，每一步先问用户";
    return `- ${app.name}（${app.bundle_id}）：${tier}`;
  });
  return ["还没有选定要操作的应用。正在运行的应用：", ...lines, "",
    "要操作某个应用：用 surface-act 的 app 动作（app 填上面括号里的标识，也可以填没在运行、但装在这台电脑上的应用标识），用户确认后会打开或切到它；再用 surface-observe 看它的窗口。"].join("\n");
}

/** Whether an action cannot be taken back, from the control's name, the keys, or the app. */
function assessAction(action: HostSurfaceAction, label: string, targetName: string | null): { irreversible: boolean; why: string } {
  switch (action.what) {
    case "pointer": return IRREVERSIBLE_WORDS.test(label) ? { irreversible: true, why: `点击「${label}」可能无法撤回` } : { irreversible: false, why: "" };
    case "menu": { const last = action.path.at(-1) ?? ""; return IRREVERSIBLE_WORDS.test(last) ? { irreversible: true, why: `菜单项「${last}」可能无法撤回` } : { irreversible: false, why: "" }; }
    case "key": {
      const keys = action.keys.flatMap(key => key.split("+")).map(key => key.trim().toLowerCase());
      const command = keys.some(key => ["cmd", "command", "meta"].includes(key));
      const enter = keys.some(key => key === "return" || key === "enter");
      const remove = keys.some(key => key === "delete" || key === "backspace" || key === "forwarddelete");
      if (command && (enter || remove)) return { irreversible: true, why: `${action.keys.join("+")} 常用来发送或删除` };
      if (enter && targetName && MESSAGING_APP.test(targetName)) return { irreversible: true, why: `在「${targetName}」里按回车通常会发送` };
      return { irreversible: false, why: "" };
    }
    case "upload": case "download": return { irreversible: true, why: "交出或取出文件算对外发送" };
    default: return { irreversible: false, why: "" };
  }
}

/** A new file in the person's Downloads folder, never overwriting one. */
function downloadDestination(to: readonly string[]): string {
  const downloads = path.join(os.homedir(), "Downloads");
  if (to.some(segment => segment === "..")) throw new Error("取出文件的位置不能含「..」");
  const resolved = to.length === 1 ? path.join(downloads, to[0]!) : path.resolve(path.sep, ...to);
  if (path.dirname(resolved) !== downloads) throw new Error("从应用取出的文件只能存进「下载」文件夹");
  if (fs.existsSync(resolved)) throw new Error(`「下载」里已经有 ${path.basename(resolved)}，换个文件名`);
  return resolved;
}

/** What the desk shares with its driver: the helper, the settings, the lease's target, and recording the live view. */
export interface DeskContext {
  readonly helper: Pick<HelperConnection, "call">;
  readonly settings: { forbiddenIds(): readonly string[] };
  /** An action reached the screen. The desk times it so a confirm on this round cannot be that click. */
  noteInjected(): void;
  target(): Target | null;
  setTarget(target: Target | null): void;
  takeovers(): number;
  /** Takes the computer for this session's round (starts its record) after readiness passes; refuses otherwise. */
  ready(sessionId: string | null): Promise<void>;
  readiness(sessionId: string | null): Promise<{ refusal: HostSurfaceRefusal; detail: string } | null>;
  mark(summary: string, point: { x: number; y: number } | null): void;
  activity(): ComputerActivity | null;
  recordStep(step: Parameters<ComputerRecords["step"]>[1], png?: Uint8Array): void;
  emitFrame(png: Buffer): void;
  rememberProduced(png: Buffer): void;
  masked(bytes: Uint8Array): boolean;
  /** The person's input landed mid-step: the desk pauses and the driver refuses. */
  pauseForPerson(): void;
  /** Whether the person moved the mouse within the settle window, so the next action waits. */
  pendingPersonMove(): boolean;
  changed(): void;
  /** Names the round before the first look, so the record stores its project, run and goal. */
  describeRound(sessionId: string, context: { readonly run_id: string | null; readonly project_id: string | null; readonly goal: string }): void;
  /** Folds in the run id once the round's run exists. The id here may differ from the session that holds the lease. */
  noteRun(sessionId: string, runId: string): void;
  /** Ends the round that `describeRound` named: finishes its record and frees the computer. */
  release(sessionId: string): void;
}

/**
 * The read and write side of the desktop surface (specs/computer-use): observing one app's window and acting in it,
 * through the helper, with the landing point checked at the last moment and the four refusals. State the desk owns —
 * the lease, the target, the mode — reaches it through its `DeskContext`.
 */
export class ComputerDriver {
  constructor(private readonly ctx: DeskContext) {}

  /** The stable `HostSurfaceDriver` the Agent Host attaches. */
  surface(): HostSurfaceDriver {
    // The host ends the round with `release()` and no id (`HostSurfaceDriver.release`). The lease id is the Molis
    // session from `describeRound`, not the Prologue session ref passed to `noteRun` and `release(sessionRefId)`.
    const round = { sessionId: null as string | null };
    return {
      kind: "desktop",
      project_id: null,
      identity: () => this.identity(),
      scope: async () => this.ctx.target()?.bundle_id ?? NO_APP_SCOPE,
      readiness: context => this.ctx.readiness(context.session_id),
      observe: (kind, context) => this.observe(kind, context?.session_id ?? null),
      perform: (action, context) => this.perform(action, context.session_id),
      describeRound: (sessionId, context) => { round.sessionId = sessionId; this.ctx.describeRound(sessionId, context); },
      noteRun: (sessionId, runId) => this.ctx.noteRun(sessionId, runId),
      // `prologue-node.ts` releases with the Prologue session ref. The surface host calls this with no id.
      // The lease is the Molis session from `describeRound`; the ref is only a fallback before that ran.
      release: async (sessionId?: string) => {
        const leaseId = round.sessionId ?? sessionId ?? null;
        if (leaseId) this.ctx.release(leaseId);
      },
      close: async () => undefined,
      describePoint: (x, y) => this.describePoint(x, y),
      focusedField: () => this.focusedField(),
      assess: action => this.assess(action),
      currentApp: async () => this.appRef(),
      masked: bytes => this.ctx.masked(bytes),
    };
  }

  private appRef(): { bundle_id: string; name: string } | null {
    const target = this.ctx.target();
    return target ? { bundle_id: target.bundle_id, name: target.name } : null;
  }

  private async appState(): Promise<AppState> {
    const target = this.ctx.target();
    if (!target) throw new Error("还没有选定要操作的应用");
    try { return await this.ctx.helper.call<AppState>("app.state", { pid: target.pid }); }
    catch (error) {
      // The app quit and came back under another process: find it again by its bundle id.
      if (error instanceof HelperError && error.code === "app.gone") {
        const running = await this.ctx.helper.call<{ apps: AppState[] }>("apps.running");
        const again = running.apps.find(app => app.bundle_id === target.bundle_id);
        if (!again) throw new Error(`「${target.name}」已经退出了`);
        target.pid = again.pid;
        return this.ctx.helper.call<AppState>("app.state", { pid: again.pid });
      }
      throw error;
    }
  }

  /** Which app, which window, where it is and what it is called, and how often the person took over: equal or stale. */
  private async identity(): Promise<string> {
    const target = this.ctx.target();
    if (!target) return `none\u0000${this.ctx.takeovers()}`;
    const state = await this.appState();
    const window = state.window;
    return [state.bundle_id, state.pid, window?.window_id ?? 0, (window?.frame ?? []).join(","), window?.title ?? "", this.ctx.takeovers()].join("\u0000");
  }

  private forbidCheck(state: AppState, action?: string): void {
    const title = state.window?.title ?? "";
    const why = refuseDespiteWindowText({ app: { bundle_id: state.bundle_id, name: state.name }, windowTitle: title, windowText: title, ...(action ? { action } : {}), userForbidden: this.ctx.settings.forbiddenIds() });
    if (why) throw new Refused("outside-target", why);
  }

  private async screenshot(state: AppState): Promise<Buffer> {
    const shot = await this.ctx.helper.call<{ png: string; included_pids?: number[]; password_fields?: number; masked?: number }>("observe.screenshot", { pid: state.pid, rect: state.window!.frame, scale: 1 }).catch(error => rememberRefusal(this.ctx, this.appRef(), this.translate(error)));
    const why = refuseCapture({ targetPid: state.pid, includedPids: shot.included_pids, passwordFields: shot.password_fields, coveredFields: shot.masked });
    if (why) rememberRefusal(this.ctx, this.appRef(), new Refused("outside-target", why));
    const png = Buffer.from(shot.png, "base64");
    this.ctx.emitFrame(png);
    return png;
  }

  /** A fresh picture of the target app, and its bytes for the record; undefined when there is nothing to show. */
  async freshFrame(): Promise<Uint8Array | undefined> {
    const target = this.ctx.target();
    if (!target) return undefined;
    const state = await this.appState();
    try { this.forbidCheck(state); } catch (error) { rememberRefusal(this.ctx, this.appRef(), this.translate(error)); }
    return state.window ? this.screenshot(state) : undefined;
  }

  private async observe(kind: HostSurfaceObservationKind, sessionId: string | null): Promise<Uint8Array> {
    await this.ctx.ready(sessionId);
    const target = this.ctx.target();
    if (!target) {
      if (kind === "screenshot") throw new Error("还没有选定应用：先用 surface-act 的 app 动作打开或切到一个应用");
      const running = await this.ctx.helper.call<{ apps: { bundle_id: string; name: string }[] }>("apps.running");
      return new TextEncoder().encode(renderApps(running.apps, this.ctx.settings.forbiddenIds()));
    }
    const state = await this.appState();
    try { this.forbidCheck(state); } catch (error) { rememberRefusal(this.ctx, this.appRef(), this.translate(error)); }
    if (!state.window) throw new Error(`「${target.name}」现在没有打开的窗口`);
    this.ctx.mark(`正在查看「${target.name}」`, null);
    if (kind === "screenshot") {
      const png = await this.screenshot(state);
      this.ctx.rememberProduced(png);
      this.ctx.recordStep({ kind: "look", app: this.appRef(), summary: `查看「${target.name}」的窗口截图` }, png);
      return png;
    }
    if (kind === "window-metadata") {
      const [x, y] = state.window.frame;
      return new TextEncoder().encode(JSON.stringify({ app: { bundle_id: state.bundle_id, name: state.name }, window: { title: state.window.title,
        width: state.window.frame[2], height: state.window.frame[3] }, windows: (state.windows ?? []).map(one => ({ title: one.title, focused: one.focused,
          minimized: one.minimized, at: [Number(one.frame[0]) - x, Number(one.frame[1]) - y], size: [one.frame[2], one.frame[3]] })) }));
    }
    if (kind === "dom") throw new Error("桌面应用没有 DOM：请用 accessibility-tree 观察");
    const tree = await this.ctx.helper.call<Tree>("observe.tree", { pid: target.pid, max_nodes: 600 });
    const text = renderTree(state, tree);
    // The words go to the model; the person's record and the tab get the picture of the same moment.
    const png = await this.screenshot(state).catch(error => { if (error instanceof Refused) throw error; return undefined; });
    this.ctx.recordStep({ kind: "look", app: this.appRef(), summary: `查看「${target.name}」的窗口（${state.window.title || "无标题"}）` }, png);
    return new TextEncoder().encode(text);
  }

  /** Waits for the person's mouse to settle before the Assistant moves it; refuses when it does not. */
  private async settled(): Promise<void> {
    for (let waited = 0; this.ctx.pendingPersonMove(); waited += 100) {
      if (waited >= 2_000) { this.ctx.pauseForPerson(); throw new Refused("person-present", "用户正在用鼠标，助理暂停；等用户交还后先重新观察。"); }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async perform(action: HostSurfaceAction, sessionId: string | null): Promise<void> {
    await this.ctx.ready(sessionId);
    if (action.what === "app") { await this.switchApp(action.app); this.ctx.noteInjected(); return; }
    if (action.what === "navigate") throw new Error("桌面应用没有网址可打开；网页上的事用侧栏浏览器");
    const target = this.ctx.target();
    if (!target) throw new Error("还没有选定应用：先用 app 动作打开或切到一个应用");
    const state = await this.appState();
    try { this.forbidCheck(state, action.what); } catch (error) { const translated = this.translate(error); this.ctx.recordStep({ kind: "refused", app: this.appRef(), summary: translated.message }); throw translated; }
    if (!state.window) throw new Error(`「${target.name}」现在没有打开的窗口`);
    const [ox, oy] = state.window.frame;
    const at = (x: number, y: number): [number, number] => [ox + x, oy + y];
    const pid = target.pid;
    try {
      await this.inject(action, target, at, pid);
    } catch (error) {
      const translated = this.translate(error);
      this.ctx.recordStep({ kind: translated instanceof Refused ? "refused" : "failed", app: this.appRef(),
        summary: `${this.ctx.activity()?.summary ?? action.what}：${translated.message}`,
        ...(this.ctx.activity()?.point ? { point: this.ctx.activity()!.point! } : {}) });
      throw translated;
    }
    this.ctx.noteInjected();
    // The step and the picture after it, for the person's tab and the record.
    let png: Uint8Array | undefined;
    try { png = await this.freshFrame(); } catch (error) { if (error instanceof Refused) throw error; /* a missing picture does not undo the step */ }
    const activity = this.ctx.activity();
    this.ctx.recordStep({ kind: "act", app: this.appRef(), summary: activity?.summary ?? action.what, ...(activity?.point ? { point: activity.point } : {}) }, png);
  }

  private async inject(action: HostSurfaceAction, target: Target, at: (x: number, y: number) => [number, number], pid: number): Promise<void> {
    const helper = this.ctx.helper;
    switch (action.what) {
      case "pointer": {
        await this.settled();
        await this.landsOnTarget(at(action.x, action.y));
        const label = await this.describePoint(action.x, action.y);
        const verb = action.button === "right" ? "右键点击" : action.clicks > 1 ? "双击" : "点击";
        this.ctx.mark(`在「${target.name}」${verb}${label ? `「${label}」` : `（${action.x}, ${action.y}）`}`, { x: action.x, y: action.y });
        return void await helper.call("input.pointer", { pid, point: at(action.x, action.y), button: action.button, clicks: action.clicks });
      }
      case "hover":
        await this.settled();
        await this.landsOnTarget(at(action.x, action.y));
        this.ctx.mark(`在「${target.name}」把鼠标移到（${action.x}, ${action.y}）`, { x: action.x, y: action.y });
        return void await helper.call("input.hover", { pid, point: at(action.x, action.y) });
      case "scroll":
        await this.settled();
        await this.landsOnTarget(at(action.x, action.y));
        this.ctx.mark(`在「${target.name}」滚动`, { x: action.x, y: action.y });
        return void await helper.call("input.scroll", { pid, point: at(action.x, action.y), dx: action.dx, dy: action.dy });
      case "drag":
        await this.settled();
        await this.landsOnTarget(at(action.x, action.y));
        await this.landsOnTarget(at(action.to_x, action.to_y));
        this.ctx.mark(`在「${target.name}」从（${action.x}, ${action.y}）拖到（${action.to_x}, ${action.to_y}）`, { x: action.to_x, y: action.to_y });
        return void await helper.call("input.drag", { pid, from: at(action.x, action.y), to: at(action.to_x, action.to_y) });
      case "key":
        await this.settled();
        this.ctx.mark(`在「${target.name}」按下 ${action.keys.join(" + ")}`, null);
        return void await helper.call("input.key", { pid, keys: action.keys });
      case "text": {
        await this.settled();
        const field = await this.focusedField();
        if (field.sensitive) throw new Refused("outside-target", "焦点在密码类输入框里：助理不替用户输入密码，请用户自己完成");
        this.ctx.mark(`在「${target.name}」${field.label ? `的「${field.label}」里` : ""}输入 ${[...action.text].length} 个字`, null);
        return void await helper.call("input.text", { pid, text: action.text });
      }
      case "menu":
        this.ctx.mark(`在「${target.name}」选择菜单 ${action.path.join(" › ")}`, null);
        return void await helper.call("input.menu", { pid, path: action.path });
      case "wait": {
        const ms = Math.max(0, Math.min(action.ms, 10_000));
        this.ctx.mark(`等待「${target.name}」（${Math.round(ms / 100) / 10} 秒）`, null);
        return void await new Promise(resolve => setTimeout(resolve, ms));
      }
      case "upload": {
        const file = path.resolve(path.sep, ...action.from);
        this.ctx.mark(`把本机文件 ${path.basename(file)} 交给「${target.name}」`, null);
        return void await helper.call("file.give", { pid, path: file });
      }
      case "download": {
        const destination = downloadDestination(action.to);
        const document = await helper.call<{ path: string }>("document", { pid });
        if (!document.path) throw new Error(`「${target.name}」的前窗没有对应的文件可取出`);
        this.ctx.mark(`从「${target.name}」取出 ${path.basename(document.path)}，存到 ${destination}`, null);
        fs.copyFileSync(document.path, destination, fs.constants.COPYFILE_EXCL);
        return;
      }
    }
  }

  private async switchApp(bundleId: string): Promise<void> {
    const installed = await this.ctx.helper.call<{ apps: { bundle_id: string; name: string }[] }>("apps.installed");
    const running = await this.ctx.helper.call<{ apps: { bundle_id: string; name: string }[] }>("apps.running");
    const known = running.apps.find(app => app.bundle_id === bundleId) ?? installed.apps.find(app => app.bundle_id === bundleId);
    if (!known) throw new Error(`这台电脑上没有应用「${bundleId}」：先观察一次，看正在运行的应用列表`);
    const verdict = tierOf(known, this.ctx.settings.forbiddenIds());
    const blocked = refuseSelfApproval(known, "", this.ctx.settings.forbiddenIds());
    if (blocked) rememberRefusal(this.ctx, { bundle_id: known.bundle_id, name: known.name }, new Refused("outside-target", blocked));
    await this.settled();
    this.ctx.mark(`打开或切到「${known.name}」`, null);
    let state: AppState;
    try { state = await this.ctx.helper.call<AppState>("app.open", { bundle_id: bundleId }, 30_000); }
    catch (error) { throw this.translate(error); }
    // Prologue judged the switch by exactly this identity: an app that answers to another one is not the app approved.
    if (state.bundle_id !== bundleId) throw new Refused("outside-target", `打开的应用是「${state.bundle_id}」，不是要求的「${bundleId}」`);
    this.ctx.setTarget({ bundle_id: bundleId, name: state.name || known.name, pid: state.pid, verdict });
    try { this.forbidCheck(state); } catch (error) { rememberRefusal(this.ctx, this.appRef(), this.translate(error)); }
    this.ctx.changed();
    try { await this.freshFrame(); } catch (error) { if (error instanceof Refused) throw error; /* no picture yet is fine */ }
  }

  /** The point is on the target app and not on a window that shows Molis Work. The helper checks again at the last moment. */
  private async landsOnTarget(point: [number, number]): Promise<void> {
    const probe = await this.ctx.helper.call<LandingProbe>("probe.point", { point });
    const why = refuseLanding(probe, this.ctx.target()?.pid ?? -1);
    if (why) throw new Refused("outside-target", why);
  }

  private async describePoint(x: number, y: number): Promise<string> {
    const target = this.ctx.target();
    if (!target) return "";
    try {
      const state = await this.appState();
      if (!state.window) return "";
      const probe = await this.ctx.helper.call<{ element?: { pid: number; name: string; role: string } }>("probe.point", { point: [state.window.frame[0] + x, state.window.frame[1] + y] });
      if (!probe.element || probe.element.pid !== target.pid) return "";
      return probe.element.name.replace(/\s+/gu, " ").trim().slice(0, 40);
    } catch { return ""; }
  }

  private async focusedField(): Promise<{ label: string; sensitive: boolean }> {
    const target = this.ctx.target();
    if (!target) return { label: "", sensitive: false };
    try {
      const field = await this.ctx.helper.call<{ name: string; secure: boolean }>("focused.field", { pid: target.pid });
      return { label: field.name, sensitive: field.secure };
    } catch { return { label: "", sensitive: false }; }
  }

  /** When the driver cannot tell, it says irreversible: the person is asked once more rather than once too few. */
  private async assess(action: HostSurfaceAction): Promise<{ irreversible: boolean; why: string }> {
    try {
      const label = action.what === "pointer" ? await this.describePoint(action.x, action.y) : "";
      return assessAction(action, label, this.ctx.target()?.name ?? null);
    } catch { return { irreversible: true, why: "判断不出这一步能不能撤回，按不能撤回处理" }; }
  }

  private translate(error: unknown): Error {
    if (error instanceof Refused) return error;
    if (error instanceof HelperError) {
      switch (error.code) {
        case "person.present":
          this.ctx.pauseForPerson();
          // Some of the step's events may have landed already: Prologue settles it as needing reconciliation, never replays it.
          return new Refused("person-present", "用户动了鼠标或键盘，这一步停在半途，助理暂停；等用户交还后先重新观察。", true);
        case "landing.covered": return new Refused("outside-target", `${error.message}；不点，先重新观察。`);
        case "capture.password": case "field.password": case "input.look_only": return new Refused("outside-target", error.message);
        case "permission.accessibility": case "permission.screen_recording": case "helper.crashed": case "helper.timeout":
        case "helper.unsupported": case "helper.missing": case "helper.start_failed": case "helper.restarting_too_often":
          return new Refused("driver-unavailable", error.message);
        default: return new Error(error.message);
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  static hash(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
  static settleMs = SETTLE_MS;
}
