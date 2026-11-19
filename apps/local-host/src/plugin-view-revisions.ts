import { randomUUID } from "node:crypto";
import { EventEmitter, once } from "node:events";

/** A page may read the current revision or wait for its next invalidation. */
export class PluginViewRevisions {
  private readonly epoch = randomUUID();
  private readonly revisions = new Map<string, number>();
  private readonly events = new EventEmitter();
  private readonly closed = new AbortController();

  constructor(private readonly running: (id: string) => boolean) {}

  readonly viewRevision = (id: string) => { return this.epoch + ":" + (this.revisions.get(id) ?? 0); };
  readonly invalidateView = (id: string) => {
    if (!this.running(id)) return;
    this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
    this.wake(id);
  };
  wake(id: string) { this.events.emit("view:" + id); }
  readonly waitForView = async (id: string, after: string, signal: AbortSignal) => {
    if (this.viewRevision(id) === after) await once(this.events, "view:" + id, { signal: AbortSignal.any([signal, this.closed.signal]) });
    return this.viewRevision(id);
  };
  close() { this.closed.abort(); }
}
