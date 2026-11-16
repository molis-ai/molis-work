import type { ExternalToolId } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { getSessionAdapter } from "./adapters/index.js";
import { executeDiscoveryJob } from "./discovery-runner.js";
import type { SessionsPorts } from "./ports.js";
import type { SessionsStore } from "./store.js";

export { resolveLocalToolRoot } from "./discovery-runner.js";

const MAX_CONCURRENT_DISCOVERY = 2;

interface QueuedDiscoveryJob {
  entry_id: ExternalToolId;
  location_key: string;
  from_start: boolean;
}

export class DiscoveryCoordinator {
  private readonly running = new Map<string, AbortController>();
  private readonly queue: QueuedDiscoveryJob[] = [];
  private activeWorkers = 0;
  private closed = false;
  private idleResolvers: Array<() => void> = [];

  constructor(
    private readonly store: SessionsStore,
    private readonly ports: SessionsPorts,
  ) {}

  private jobKey(entryId: ExternalToolId, locationKey: string): string {
    return `${entryId}\0${locationKey}`;
  }

  isRunning(entryId: ExternalToolId, locationKey: string): boolean {
    return this.running.has(this.jobKey(entryId, locationKey));
  }

  resumeInterrupted(): void {
    if (this.closed) return;
    const scopes = this.store.decisions.readScopes();
    const sources = this.store.sources();
    for (const scope of scopes) {
      if (!scope.allowed) continue;
      const existing = sources.get(this.jobKey(scope.entry_id, scope.location_key));
      if (existing && existing.state === "reading") {
        this.enqueue(scope.entry_id, scope.location_key, false);
      }
    }
  }

  enqueue(entryId: ExternalToolId, locationKey: string, fromStart = true): boolean {
    if (this.closed) return false;
    if (!getSessionAdapter(entryId)) return false;
    const key = this.jobKey(entryId, locationKey);
    if (this.running.has(key)) return false;

    const existingQueued = this.queue.find(item => this.jobKey(item.entry_id, item.location_key) === key);
    if (existingQueued) {
      if (fromStart) existingQueued.from_start = true;
      return false;
    }
    this.queue.push({ entry_id: entryId, location_key: locationKey, from_start: fromStart });
    this.pump();
    return true;
  }

  cancelSource(entryId: ExternalToolId, locationKey: string): void {
    const key = this.jobKey(entryId, locationKey);
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const item = this.queue[i]!;
      if (this.jobKey(item.entry_id, item.location_key) === key) this.queue.splice(i, 1);
    }
    const controller = this.running.get(key);
    if (controller) {
      controller.abort(new Error("Scope narrowed or source stopped"));
      this.running.delete(key);
    }
  }

  cancelAll(): void {
    this.closed = true;
    this.queue.length = 0;
    for (const controller of this.running.values()) {
      controller.abort(new Error("SessionsService closed"));
    }
    this.running.clear();
    this.notifyIfIdle();
  }

  cancelLinkedProjectsJobs(): void {
    for (const scope of this.store.decisions.readScopes()) {
      if (!scope.allowed || scope.directories.mode === "linked_projects") {
        this.cancelSource(scope.entry_id, scope.location_key);
      }
    }
  }

  waitForIdle(): Promise<void> {
    if (this.activeWorkers === 0 && this.queue.length === 0) return Promise.resolve();
    return new Promise(resolve => {
      this.idleResolvers.push(resolve);
    });
  }

  private notifyIfIdle(): void {
    if (this.activeWorkers === 0 && this.queue.length === 0 && this.idleResolvers.length > 0) {
      const resolvers = this.idleResolvers.splice(0, this.idleResolvers.length);
      for (const resolve of resolvers) resolve();
    }
  }

  private pump(): void {
    while (!this.closed && this.activeWorkers < MAX_CONCURRENT_DISCOVERY && this.queue.length > 0) {
      const next = this.queue.shift()!;
      const key = this.jobKey(next.entry_id, next.location_key);
      if (this.running.has(key)) continue;
      const controller = new AbortController();
      this.running.set(key, controller);
      this.activeWorkers++;
      void executeDiscoveryJob({
        entryId: next.entry_id,
        locationKey: next.location_key,
        fromStart: next.from_start,
        signal: controller.signal,
        isClosed: () => this.closed,
        store: this.store,
        ports: this.ports,
      }).finally(() => {
        if (this.running.get(key) === controller) this.running.delete(key);
        this.activeWorkers--;
        this.pump();
        this.notifyIfIdle();
      });
    }
  }
}
