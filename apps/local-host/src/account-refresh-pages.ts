import { channel } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PersonalAccountLease } from './personal-auth.js';

type Lease = Pick<PersonalAccountLease, 'signal' | 'assertCurrent'>;
type Intent = 'switch' | 'logout';
export interface AccountRefreshPreparation { id: string; ownerPageId: string; intent: Intent; ready: boolean }
export interface AccountRefreshPageEvent { type: 'prepare' | 'changed' | 'cancelled' | 'revoked'; preparation: AccountRefreshPreparation | null; reason?: string }
interface Page {
  binding: string; departed: boolean; lease: Lease; listeners: Set<(event: AccountRefreshPageEvent) => void>; abort(): void;
  /** Set when this document opened the event stream; a page that never did may still be waiting to join. */
  subscribedAt: number | undefined;
  disconnectedAt: number | undefined;
  /** A stream that died and did not come back cannot acknowledge; it must not block a later preparation forever. */
  stale: boolean;
}
interface Preparation extends AccountRefreshPreparation { lease: Lease; required: Set<string>; acknowledged: Set<string>; committing: boolean; timer: NodeJS.Timeout }
const diagnostics = channel('molis-work.account-pages');
const refused = () => new ActionError('actions.forbidden', '账号切换准备已失效，请返回原页面重试');
/**
 * An event stream that has been gone this long is a closed or crashed document, not a page that is about to
 * reconnect: EventSource backs off at most 10 s in `account-event-stream.ts`. Pages that never subscribed stay
 * required (a page opened before its stream finished connecting), and an immediate disconnect stays required
 * until the current preparation times out, so a live page that lost one connection can still save its drafts
 * (ASR-04). A crashed tab can delay one preparation and is then dropped instead of blocking every retry.
 */
const CRASHED_AFTER_MS = 15_000;

/** Ephemeral page coordination only. Identity and revocation remain the original account lease's facts. */
export class AccountRefreshPages {
  private readonly pages = new Map<string, Page>();
  private preparation: Preparation | null = null;
  constructor(private readonly timeoutMs = 30_000, private readonly onCancel: () => void = () => {}, private readonly now: () => number = Date.now) {}

  register(pageId: string, lease: Lease): string {
    lease.assertCurrent();
    if (!pageId || pageId.length > 128) throw refused();
    const existing = this.pages.get(pageId);
    if (existing?.lease.signal === lease.signal) {
      if (existing.departed) throw refused();
      existing.stale = false; // A status read proves this document is alive again.
      return existing.binding;
    }
    if (this.preparation?.committing && this.preparation.lease.signal === lease.signal) throw refused();
    if (existing) this.remove(pageId, existing);
    const page: Page = { binding: randomUUID(), departed: false, stale: false, subscribedAt: undefined, disconnectedAt: undefined, lease, listeners: new Set(), abort: () => {
      this.emit(page, { type: 'revoked', preparation: null });
      if (this.preparation?.lease.signal === lease.signal) this.clear('revoked');
      this.remove(pageId, page);
    } };
    this.pages.set(pageId, page);
    diagnostics.publish({ event: 'registered', pageId });
    lease.signal.addEventListener('abort', page.abort, { once: true });
    const preparation = this.preparation;
    if (preparation?.lease.signal === lease.signal) {
      preparation.required.add(pageId);
      preparation.ready = false;
      this.broadcast('prepare');
    }
    return page.binding;
  }

  connection(pageId: string, lease: Lease, binding: string): void {
    if (!binding || this.page(pageId, lease).binding !== binding) throw refused();
  }

  subscribe(pageId: string, send: (event: AccountRefreshPageEvent) => void): () => void {
    const page = this.pages.get(pageId);
    if (!page || page.departed) throw refused();
    page.lease.assertCurrent();
    page.listeners.add(send);
    page.subscribedAt ??= this.now();
    page.disconnectedAt = undefined;
    if (page.stale) {
      // The stream came back after this page was dropped as crashed; it is a live participant again and must
      // acknowledge drafts with everyone else in the current preparation.
      page.stale = false;
      const preparation = this.preparation;
      if (preparation?.lease.signal === page.lease.signal && !preparation.required.has(pageId)) {
        preparation.required.add(pageId);
        preparation.ready = false;
        this.broadcast('prepare');
      }
    }
    diagnostics.publish({ event: 'connected', pageId });
    try { send({ type: this.preparation ? 'prepare' : 'changed', preparation: this.snapshot(page.lease) }); }
    catch (error) {
      page.listeners.delete(send);
      if (this.preparation?.required.has(pageId)) this.clear('cancelled', 'delivery-failed');
      throw error;
    }
    return () => {
      page.listeners.delete(send);
      diagnostics.publish({ event: 'disconnected', pageId });
      const preparation = this.preparation;
      if (!page.listeners.size) page.disconnectedAt = this.now();
      if (this.pages.get(pageId) === page && !page.listeners.size && preparation?.lease.signal === page.lease.signal && preparation.required.has(pageId)) this.clear('cancelled', 'connection-lost');
    };
  }

  snapshot(lease: Lease): AccountRefreshPreparation | null {
    lease.assertCurrent();
    const current = this.preparation;
    return current?.lease.signal === lease.signal
      ? { id: current.id, ownerPageId: current.ownerPageId, intent: current.intent, ready: current.ready } : null;
  }

  /** A subscribed page whose stream has been gone beyond the reconnect window, or was dropped by a timed-out preparation. */
  private crashed(page: Page): boolean {
    return !page.stale && page.subscribedAt !== undefined && page.listeners.size === 0
      && page.disconnectedAt !== undefined && this.now() - page.disconnectedAt > CRASHED_AFTER_MS;
  }

  start(pageId: string, lease: Lease, intent: Intent): AccountRefreshPreparation {
    this.page(pageId, lease);
    if (intent !== 'switch' && intent !== 'logout') throw refused();
    if (this.preparation) {
      const current = this.snapshot(lease);
      if (!current || current.intent !== intent) throw refused();
      return current;
    }
    // A closed or crashed tab cannot acknowledge; dropping it here keeps a later retry from waiting for it again.
    for (const page of this.pages.values()) if (page.lease.signal === lease.signal && !page.departed && this.crashed(page)) page.stale = true;
    const required = new Set([...this.pages].filter(([, page]) => page.lease.signal === lease.signal && !page.departed && !page.stale).map(([id]) => id));
    const timer = setTimeout(() => { if (!this.preparation?.committing) this.clear('cancelled', 'timeout'); }, this.timeoutMs);
    timer.unref();
    this.preparation = { id: randomUUID(), ownerPageId: pageId, intent, ready: false, lease, required, acknowledged: new Set(), committing: false, timer };
    this.broadcast('prepare');
    const snapshot = this.snapshot(lease);
    if (!snapshot) throw refused();
    return snapshot;
  }

  acknowledge(pageId: string, lease: Lease, id: string): AccountRefreshPreparation {
    const current = this.current(pageId, lease, id);
    if (current.committing) throw refused();
    current.acknowledged.add(pageId);
    current.ready = [...current.required].every(page => current.acknowledged.has(page));
    this.broadcast('changed');
    const snapshot = this.snapshot(lease);
    if (!snapshot) throw refused();
    return snapshot;
  }

  requirePrepared(pageId: string, lease: Lease, id: string, intent: Intent): void {
    const current = this.current(pageId, lease, id);
    if (!current.ready || current.ownerPageId !== pageId || current.intent !== intent || current.committing) throw refused();
    current.committing = true;
    clearTimeout(current.timer);
  }

  cancel(pageId: string, lease: Lease, id?: string): void {
    this.page(pageId, lease);
    if (this.preparation && (id === undefined || this.preparation.id === id) && this.preparation.lease.signal === lease.signal) this.clear('cancelled');
  }

  leave(pageId: string, lease: Lease): void {
    lease.assertCurrent();
    const existing = this.pages.get(pageId);
    if (existing?.lease.signal === lease.signal && existing.departed) return;
    // pagehide can arrive before an in-flight initial status request registers this document.
    if (!existing) this.register(pageId, lease);
    const page = this.page(pageId, lease);
    if (this.preparation?.required.has(pageId)) this.clear('cancelled', 'page-left');
    page.departed = true;
    page.listeners.clear();
    diagnostics.publish({ event: 'left', pageId });
  }

  close(): void {
    this.clear('revoked');
    for (const [id, page] of this.pages) this.remove(id, page);
  }

  private page(pageId: string, lease: Lease): Page {
    lease.assertCurrent();
    const page = this.pages.get(pageId);
    if (!page || page.departed || page.lease.signal !== lease.signal) throw refused();
    page.lease.assertCurrent();
    return page;
  }
  private current(pageId: string, lease: Lease, id: string): Preparation {
    this.page(pageId, lease);
    const current = this.preparation;
    if (!current || current.id !== id || current.lease.signal !== lease.signal || !current.required.has(pageId)) throw refused();
    return current;
  }
  private emit(page: Page, event: AccountRefreshPageEvent): boolean {
    let delivered = true;
    for (const send of page.listeners) {
      try { send(event); } catch { page.listeners.delete(send); delivered = false; }
    }
    return delivered;
  }
  private broadcast(type: AccountRefreshPageEvent['type']): void {
    const current = this.preparation;
    if (!current) return;
    const preparation = this.snapshot(current.lease);
    let delivered = true;
    for (const pageId of current.required) { const page = this.pages.get(pageId); if (page && !this.emit(page, { type, preparation })) delivered = false; }
    if (!delivered) this.clear('cancelled', 'delivery-failed');
  }
  private clear(type: 'cancelled' | 'revoked', reason: string = type): void {
    const current = this.preparation;
    if (!current) return;
    // Invalidate the original OAuth attempt before any old page is allowed to resume editing.
    if (type === 'cancelled' && current.committing) this.onCancel();
    clearTimeout(current.timer);
    this.preparation = null;
    diagnostics.publish({ event: type, reason, pageId: current.ownerPageId });
    for (const id of current.required) { const page = this.pages.get(id); if (page) this.emit(page, { type, reason, preparation: null }); }
    // A page whose stream was already gone when the preparation failed cannot acknowledge a retry either.
    // Drop it now (a reconnect clears the flag and joins again) instead of waiting for the next full timeout.
    if (type === 'cancelled' && (reason === 'timeout' || reason === 'connection-lost')) {
      for (const id of current.required) {
        const page = this.pages.get(id);
        if (page && page.subscribedAt !== undefined && page.listeners.size === 0) page.stale = true;
      }
    }
  }
  private remove(id: string, page: Page): void { page.lease.signal.removeEventListener('abort', page.abort); this.pages.delete(id); }
}
