import { resolve, join } from "node:path";
import { ActionError, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistManifest, createAlchemistActionHandlers, createAlchemistLegacyActionHandlers, createAlchemistStudioRuntime, openAlchemistStore,
  type AlchemistAiPort, type AlchemistStudioRuntime } from "@molis-ai/molis-work-plugin-alchemist";
import { createAlchemistProloguePort } from "./alchemist-prologue.js";
import { createAlchemistSearchPort } from "./alchemist-search.js";

export interface AlchemistHostOptions {
  /** Explicit embedding/test boundary. Production uses the configured Prologue and search owners. */
  ai?: (projectId: string) => AlchemistAiPort;
  pulseSourceMode?: "live" | "fixture";
}
interface SharedStudio { runtime: AlchemistStudioRuntime; search?: ReturnType<typeof createAlchemistSearchPort>; owners: Set<AlchemistHostService>; closing?: Promise<void> }
const studios = new Map<string, SharedStudio>();

/** The original project Studio is shared by Host owners, independent of page requests. */
export class AlchemistHostService {
  private readonly home: string;
  private readonly entries = new Map<string, SharedStudio>();
  private closed = false;
  constructor(home: string, private readonly options: AlchemistHostOptions = {}) { this.home = resolve(home); }
  provider(): ActionProviderRegistration {
    return { provider: { provider_id: alchemistManifest.plugin_id, plugin_id: alchemistManifest.plugin_id, title: alchemistManifest.name, kind: "plugin" },
      definitions: alchemistManifest.actions!, handlers: [
        ...createAlchemistActionHandlers(caller => this.get(caller).actionsFor(caller.actor_id)),
        ...createAlchemistLegacyActionHandlers(run => { this.assertOpen(); const store = openAlchemistStore(this.home); try { return run(store); } finally { store.close(); } }),
      ] };
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
      const ai = this.options.ai?.(projectId) ?? createAlchemistProloguePort({ homeDirectory: this.home, projectId, search: input => {
        entry!.search ??= createAlchemistSearchPort({ homeDirectory: this.home, projectId });
        return entry!.search.search(input);
      } });
      const runtime = createAlchemistStudioRuntime({ databasePath: join(this.home, "alchemist", "projects", encodeURIComponent(projectId).replaceAll(".", "%2E"), "studio.sqlite"),
        ai, pulseSourceMode: this.options.pulseSourceMode });
      entry = { runtime, owners: new Set() }; studios.set(key, entry); runtime.start();
    }
    entry.owners.add(this); this.entries.set(key, entry);
    return entry.runtime;
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
