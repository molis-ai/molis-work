import { resolve, join } from "node:path";
import { rm } from "node:fs/promises";
import { alchemistProjectDirectory } from "./alchemist-paths.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { ActionError, type ActionAvailability, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistActions, alchemistManifest, createAlchemistActionHandlers, createAlchemistStudioRuntime,
  type AlchemistAiPort, type AlchemistStudioRuntime } from "@molis-ai/molis-work-plugin-alchemist";
import { createAlchemistProloguePort } from "./alchemist-prologue.js";
import { createAlchemistSearchPort } from "./alchemist-search.js";
import { alchemistPulseGithub } from "./alchemist-pulse-github.js";
import { configuredModelChoices } from "./configured-models.js";

export interface AlchemistHostOptions {
  /** Explicit embedding/test boundary. Production uses the configured Prologue and search owners. */
  ai?: (projectId: string) => AlchemistAiPort;
  pulseSourceMode?: "live" | "fixture";
}
/**
 * The actions that need a model, so the directory can say so before anyone calls. It says so to the Assistant, MCP clients,
 * workflows and plugins, not to the person at the page: a message sent without a model is still saved, and an exploration or a
 * research run is still recorded as stopped, so the card tells the person how to continue (see the Alchemist README, 不变量).
 */
const NEEDS_MODEL: ReadonlySet<string> = new Set([alchemistActions.reuseAssess, alchemistActions.conversationSend,
  alchemistActions.explorationStart, alchemistActions.researchStart].map(action => action.capability_id));
interface SharedStudio { runtime: AlchemistStudioRuntime; search?: ReturnType<typeof createAlchemistSearchPort>; owners: Set<AlchemistHostService>; closing?: Promise<void> }
const studios = new Map<string, SharedStudio>();

/** The original project Studio is shared by Host owners, independent of page requests. */
export class AlchemistHostService {
  private readonly home: string;
  private readonly entries = new Map<string, SharedStudio>();
  private closed = false;
  constructor(home: string, private readonly options: AlchemistHostOptions = {}) {
    this.home = resolve(home);
    // Deleting a project closes its studio here (a running worker would keep writing to a database about to go) before its directory goes.
    projectDeletedHooksFor(this.home).register({ id: "alchemist", label: "炼金术士的研究空间", alive: () => !this.closed, clear: projectId => this.deleteProject(projectId) });
  }
  provider(): ActionProviderRegistration {
    return { provider: { provider_id: alchemistManifest.plugin_id, plugin_id: alchemistManifest.plugin_id, title: alchemistManifest.name, kind: "plugin" },
      definitions: alchemistManifest.actions!, handlers: [
        ...createAlchemistActionHandlers(caller => this.get(caller).actionsFor(caller.actor_id)).map(handler => NEEDS_MODEL.has(handler.capability_id) ? { ...handler, availability: (caller: ActionCallContext) => caller.audience === "user" ? { available: true as const } : this.modelAvailability() } : handler),
      ] };
  }
  /**
   * Whether the Home has a model Alchemist could use, without opening a studio. An embedding that brings its own model port
   * (`options.ai`) is not judged by the Home's settings: only the default Prologue port reads them.
   */
  private modelAvailability(): ActionAvailability {
    if (this.options.ai) return { available: true };
    try { if (configuredModelChoices(this.home).length) return { available: true }; }
    catch { return { available: false, code: "actions.connection_required", reason: "模型配置无法读取，请到模型设置检查。" }; }
    return { available: false, code: "actions.connection_required", reason: "没有可用模型，请先在 Molis Work 的模型设置中启用模型并配置凭据。" };
  }
  private assertOpen(): void { if (this.closed) throw new ActionError("alchemist.closed", "炼金术士服务已停止。"); }
  private get(caller: ActionCallContext): AlchemistStudioRuntime {
    this.assertOpen();
    if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目。");
    const key = JSON.stringify([this.home, caller.project_id]);
    const own = this.entries.get(key); if (own) return own.runtime;
    let entry = studios.get(key);
    if (entry?.closing) throw new ActionError("alchemist.closing", "炼金术士服务正在关闭，请稍后重试。");
    if (!entry) {
      const projectId = caller.project_id;
      const ai = this.options.ai?.(projectId) ?? createAlchemistProloguePort({ homeDirectory: this.home, search: input => {
        entry!.search ??= createAlchemistSearchPort({ homeDirectory: this.home, projectId });
        return entry!.search.search(input);
      } });
      const runtime = createAlchemistStudioRuntime({ databasePath: join(alchemistProjectDirectory(this.home, projectId), "studio.sqlite"),
        ai, pulseSourceMode: this.options.pulseSourceMode, pulseGithub: alchemistPulseGithub(this.home) });
      entry = { runtime, owners: new Set() }; studios.set(key, entry); runtime.start();
    }
    entry.owners.add(this); this.entries.set(key, entry);
    return entry.runtime;
  }
  /**
   * The project is deleted: its studio is evicted from every Host in this process that holds it, closed (its worker and
   * search database with it), and its directory removed, so a project made again under the same id starts empty.
   */
  async deleteProject(projectId: string): Promise<void> {
    const key = JSON.stringify([this.home, projectId]);
    const entry = studios.get(key);
    if (entry) {
      studios.delete(key);
      for (const owner of entry.owners) owner.entries.delete(key);
      entry.closing ??= (async () => { try { await entry.runtime.close(); } finally { await entry.search?.shutdown(); } })();
      await entry.closing;
    }
    await rm(alchemistProjectDirectory(this.home, projectId), { recursive: true, force: true });
  }
  async close(): Promise<void> {
    this.closed = true;
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
