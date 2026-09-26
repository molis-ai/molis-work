import path from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";
import { SessionMessageService, SessionContentService, SessionDirectoryService, SessionHandoffService, SessionTuiRecorder, RegistryFallbackSessionAdapter } from "@molis-ai/molis-work-plugin-work";
import type { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import { CodexAppServerTransport, CodexRuntimeSessionAdapter, RuntimeHostRouter } from "@molis-ai/molis-work-service-runtime-host";
import { openWorkSessionRegistry } from "./session-registry.js";

export interface SessionRuntimeResources {
  registry: MolisWorkSessionRegistry;
  router: RuntimeHostRouter;
  directory: SessionDirectoryService;
  content: SessionContentService;
  messages: SessionMessageService;
  handoff: SessionHandoffService;
  recorder: SessionTuiRecorder;
  ownedCodexTransport: CodexAppServerTransport | null;
}

async function openSessionRuntimeResources(options: { homeDirectory?: string; runtimeSessionTransport?: RuntimeSessionTransport }): Promise<SessionRuntimeResources> {
  const registry = await openWorkSessionRegistry({ homeDirectory: options.homeDirectory });
  const router = new RuntimeHostRouter(
    (runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry),
  );
  const ownedCodexTransport = options.runtimeSessionTransport ? null : new CodexAppServerTransport();
  router.register(new CodexRuntimeSessionAdapter(options.runtimeSessionTransport ?? ownedCodexTransport!));
  const directory = new SessionDirectoryService(registry, router);
  const content = new SessionContentService(registry, router);
  return {
    registry,
    router,
    directory,
    content,
    messages: new SessionMessageService(registry, registry.messages, router),
    handoff: new SessionHandoffService(registry, router, directory, content),
    recorder: new SessionTuiRecorder(registry),
    ownedCodexTransport,
  };
}

/** One Home owns one registry/adapter set, shared by Web and action callers. */
export class SessionRuntimeService {
  private home?: string;
  private transport?: RuntimeSessionTransport;
  private pending?: Promise<SessionRuntimeResources>;
  private closed = false;
  constructor(options: { homeDirectory?: string; runtimeSessionTransport?: RuntimeSessionTransport }) {
    if (options.homeDirectory) this.configure(options.homeDirectory, options.runtimeSessionTransport);
  }
  get configured() { return !!this.home && !this.closed; }
  configure(home: string, transport?: RuntimeSessionTransport): void {
    if (this.closed) throw new ActionError("actions.service_unavailable", "Session 服务已关闭");
    const resolved = path.resolve(home);
    if (this.home && this.home !== resolved) throw new ActionError("actions.scope_mismatch", "Session 服务已属于另一个 Home");
    if (transport && this.pending && transport !== this.transport) throw new ActionError("actions.service_configured", "Session 服务已启动，不能替换运行中的连接");
    this.home = resolved;
    if (transport) this.transport = transport;
  }
  resources(): Promise<SessionRuntimeResources> {
    if (!this.configured) return Promise.reject(new ActionError("actions.service_unavailable", "Session 服务未配置或已关闭"));
    if (!this.pending) {
      const pending = openSessionRuntimeResources({ homeDirectory: this.home, runtimeSessionTransport: this.transport });
      this.pending = pending;
      void pending.catch(() => { if (this.pending === pending) this.pending = undefined; });
    }
    return this.pending;
  }
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const resources = await this.pending?.catch(() => undefined);
    if (!resources) return;
    resources.recorder.close();
    resources.ownedCodexTransport?.close();
    resources.registry.close();
  }
}
