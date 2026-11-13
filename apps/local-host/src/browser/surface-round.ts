import { createHash } from "node:crypto";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostSurfaceContext } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { browserErrors } from "./errors.js";
import type { BrowserPage } from "./browser-host.js";
import { BrowserSurfaceNodes } from "./surface-nodes.js";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** The retained nodes, screenshot allowlist and activity timer belong to this context, never a session name. */
export class BrowserSurfaceRound {
  readonly nodes: BrowserSurfaceNodes;
  private live = true;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private readonly screens: string[] = [];
  private readonly inputs = new Set<Promise<void>>();

  constructor(readonly page: BrowserPage, readonly context: HostSurfaceContext,
    private readonly enabled: () => boolean, private readonly blocked: (origin: string) => boolean) {
    this.nodes = new BrowserSurfaceNodes(page, this.assertCurrent);
  }

  assertCurrent = (): void => {
    requireSynchronous(this.context.assertCurrent());
    if (!this.live) throw browserErrors.load_failed("原轮次的浏览器已释放");
    if (!this.enabled()) throw browserErrors.load_failed("用户关掉了「允许助理使用侧栏浏览器」：不能再查看或操作这个页面。");
    if (this.page.controlMode === "taken-over") throw browserErrors.load_failed("用户已接手这个页面，助理暂停操作。等用户交还后，先重新观察页面。");
    const state = this.page.snapshot();
    if (this.page.sourceKnown && !state.origin && state.url !== "") throw browserErrors.load_failed("这个页面的来源不能用于助理操作");
    if (this.blocked(state.origin)) throw browserErrors.load_failed("用户禁止助理查看或操作这个网站。");
  };
  assertDestination(url: string): void {
    this.assertCurrent();
    if (this.blocked(new URL(url).origin)) throw browserErrors.load_failed("用户禁止助理打开这个网站。");
  }

  async ready(): Promise<void> {
    this.assertCurrent(); await this.context.beforeEffect(); this.assertCurrent();
  }

  async session() {
    this.assertCurrent();
    const session = await this.page.session(this.assertCurrent);
    this.assertCurrent(); session.assertCurrent();
    const url = this.page.snapshot().url, takeovers = this.page.takeoverCount;
    const assertCurrent = () => {
      this.assertCurrent(); session.assertCurrent();
      if (this.page.snapshot().url !== url || this.page.takeoverCount !== takeovers) throw browserErrors.load_failed("先前观察的页面已变化，请重新观察页面后再操作。");
    };
    return { ...session, assertCurrent,
      send: (method: string, params: Record<string, unknown> = {}, beforeSend?: () => void) => session.send(method, params, () => { assertCurrent(); requireSynchronous(beforeSend?.()); }),
      cleanup: session.send,
    };
  }

  mark(summary: string, point: { x: number; y: number } | null): void {
    this.assertCurrent();
    this.page.setControl({ mode: "assistant", work_id: this.context.session_id, activity: { summary, point, at: new Date().toISOString() } });
    clearTimeout(this.idle);
    this.idle = setTimeout(() => { if (this.live) this.releaseControl(); }, 60_000);
    this.idle.unref?.();
  }

  private releaseControl(): void {
    if (this.page.controlMode === "assistant") this.page.setControl({ mode: "person", work_id: null, activity: null });
  }

  rememberScreen(bytes: Uint8Array): void {
    this.assertCurrent(); this.screens.push(digest(bytes));
    if (this.screens.length > 32) this.screens.shift();
  }
  masked(bytes: Uint8Array): boolean { return this.live && this.screens.includes(digest(bytes)); }

  input(operation: () => Promise<void>): Promise<void> {
    this.assertCurrent(); const pending = operation(); this.inputs.add(pending);
    return pending.finally(() => { this.inputs.delete(pending); });
  }
  async drainInputs(): Promise<void> { await Promise.allSettled(this.inputs); }

  async settle(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 250)); this.assertCurrent();
    for (let waited = 0; this.page.snapshot().loading && waited < 10_000; waited += 200) {
      await new Promise(resolve => setTimeout(resolve, 200)); this.assertCurrent();
    }
  }

  async release(): Promise<void> {
    if (!this.live) return;
    this.live = false; clearTimeout(this.idle); this.screens.length = 0; this.releaseControl();
    await this.drainInputs();
    await this.nodes.clear();
  }
}

export type BrowserSurfaceSession = Awaited<ReturnType<BrowserSurfaceRound["session"]>>;
