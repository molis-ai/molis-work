import { resolve, join } from "node:path";
import { rm } from "node:fs/promises";
import { alchemistProjectDirectory } from "./alchemist-paths.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { ActionError, type ActionAvailability, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistManifest, createAlchemistActionHandlers, createAlchemistStudioRuntime,
  type AlchemistAiPort, type AlchemistStudioRuntime } from "@molis-ai/molis-work-plugin-alchemist";
import { alchemistModelChoices, createAlchemistProloguePort } from "./alchemist-prologue.js";
import { createAlchemistSearchPort } from "./alchemist-search.js";
import { alchemistPulseGithub } from "./alchemist-pulse-github.js";

export interface AlchemistHostOptions {
  /** Explicit embedding/test boundary. Production uses the configured Prologue and search owners. */
  ai?: (projectId: string) => AlchemistAiPort;
  pulseSourceMode?: "live" | "fixture";
  /** How long a project's studio stays open with no action and no job before it is closed (W4-09); the next action opens it again. */
  idleReclaimMs?: number;
}
interface SharedStudio { runtime: AlchemistStudioRuntime; search?: ReturnType<typeof createAlchemistSearchPort>; owners: Set<AlchemistHostService>; closing?: Promise<void>; lastUsed: number }
const studios = new Map<string, SharedStudio>();
/** An open studio drains its jobs four times a second; one nobody has used for this long and with no job is closed. */
const STUDIO_IDLE_MS = 10 * 60_000;

/** The original project Studio is shared by Host owners, independent of page requests. */
export class AlchemistHostService {
  private readonly home: string;
  /** The Home's GitHub account choice for the market pulse, and the transport that carries its token to api.github.com. */
  private readonly pulseGithub: ReturnType<typeof alchemistPulseGithub>;
  private readonly entries = new Map<string, SharedStudio>();
  private closed = false;
  private sweep?: NodeJS.Timeout;
  constructor(home: string, private readonly options: AlchemistHostOptions = {}) {
    this.home = resolve(home);
    this.pulseGithub = alchemistPulseGithub(this.home);
    // Deleting a project closes its studio here (a running worker would keep writing to a database about to go) before its directory goes.
    projectDeletedHooksFor(this.home).register({ id: "alchemist", label: "炼金术士的研究空间", alive: () => !this.closed, clear: projectId => this.deleteProject(projectId) });
  }
  provider(): ActionProviderRegistration {
    return { provider: { provider_id: alchemistManifest.plugin_id, plugin_id: alchemistManifest.plugin_id, title: alchemistManifest.name, kind: "plugin" },
      definitions: alchemistManifest.actions!, handlers: createAlchemistActionHandlers({
        resolve: caller => this.get(caller).actionsFor(caller.actor_id),
        // Which actions need a model, and that the person's own page is never held back, is the plugin's; the Host says whether the Home has a model.
        modelAvailability: () => this.modelAvailability(),
        pulseGithub: this.pulseGithub,
      }) };
  }
  /**
   * Whether the Home has a model Alchemist could use, without opening a studio: the list the Prologue port offers is not empty. An
   * embedding that brings its own model port (`options.ai`) is not judged by the Home's settings: only the default port reads them.
   */
  private modelAvailability(): ActionAvailability {
    if (this.options.ai) return { available: true };
    try { if (alchemistModelChoices(this.home).length) return { available: true }; }
    catch { return { available: false, code: "actions.connection_required", reason: "模型配置无法读取，请到模型设置检查。" }; }
    return { available: false, code: "actions.connection_required", reason: "没有可用模型，请先在 Molis Work 的模型设置中启用模型并配置凭据。" };
  }
  private assertOpen(): void { if (this.closed) throw new ActionError("alchemist.closed", "炼金术士服务已停止。"); }
  private get(caller: ActionCallContext): AlchemistStudioRuntime {
    this.assertOpen();
    if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目。");
    const key = JSON.stringify([this.home, caller.project_id]);
    const own = this.entries.get(key); if (own) { own.lastUsed = Date.now(); return own.runtime; }
    let entry = studios.get(key);
    if (entry?.closing) throw new ActionError("alchemist.closing", "炼金术士服务正在关闭，请稍后重试。");
    if (!entry) {
      const projectId = caller.project_id;
      const ai = this.options.ai?.(projectId) ?? createAlchemistProloguePort({ homeDirectory: this.home, search: input => {
        entry!.search ??= createAlchemistSearchPort({ homeDirectory: this.home, projectId });
        return entry!.search.search(input);
      } });
      const runtime = createAlchemistStudioRuntime({ databasePath: join(alchemistProjectDirectory(this.home, projectId), "studio.sqlite"),
        ai, pulseSourceMode: this.options.pulseSourceMode, pulseGithub: this.pulseGithub });
      entry = { runtime, owners: new Set(), lastUsed: Date.now() }; studios.set(key, entry); runtime.start();
    }
    entry.owners.add(this); this.entries.set(key, entry); entry.lastUsed = Date.now();
    this.watchIdle();
    return entry.runtime;
  }
  /**
   * While this Host holds a studio, it looks every so often for one nobody has used for a while and that has nothing to do,
   * and closes it in every Host that holds it (W4-09). The next action on that project opens it again.
   */
  private watchIdle(): void {
    const idleMs = this.options.idleReclaimMs ?? STUDIO_IDLE_MS;
    this.sweep ??= setInterval(() => {
      for (const [key, entry] of this.entries) if (!entry.closing && Date.now() - entry.lastUsed >= idleMs && entry.runtime.idle()) void this.evict(key, entry);
      if (!this.entries.size) { clearInterval(this.sweep); this.sweep = undefined; }
    }, Math.min(60_000, idleMs)).unref();
  }
  /** Takes the studio out of every Host in this process that holds it and closes it, its worker and search database with it. */
  private evict(key: string, entry: SharedStudio): Promise<void> {
    if (studios.get(key) === entry) studios.delete(key);
    for (const owner of entry.owners) owner.entries.delete(key);
    return entry.closing ??= (async () => { try { await entry.runtime.close(); } finally { await entry.search?.shutdown(); } })();
  }
  /**
   * The project is deleted: its studio is evicted from every Host in this process that holds it, closed (its worker and
   * search database with it), and its directory removed, so a project made again under the same id starts empty.
   */
  async deleteProject(projectId: string): Promise<void> {
    const key = JSON.stringify([this.home, projectId]);
    const entry = studios.get(key);
    if (entry) await this.evict(key, entry);
    await rm(alchemistProjectDirectory(this.home, projectId), { recursive: true, force: true });
  }
  async close(): Promise<void> {
    this.closed = true;
    clearInterval(this.sweep); this.sweep = undefined;
    const closing: Promise<void>[] = [];
    for (const [key, entry] of this.entries) {
      entry.owners.delete(this);
      if (entry.owners.size) continue;
      entry.closing ??= (async () => { try { await entry.runtime.close(); } finally { try { await entry.search?.shutdown(); } finally { if (studios.get(key) === entry) studios.delete(key); } } })();
      closing.push(entry.closing);
    }
    this.entries.clear(); await Promise.all(closing);
  }
}
