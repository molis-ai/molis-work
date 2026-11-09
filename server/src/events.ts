import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ServerResponse } from "node:http";
import type { ServerDatabase } from "./database.js";
const streamErrors = defineErrorCodes("im", { stream_limit: "rate_limited" });
interface Change { scopeKind: "project" | "room"; scopeId: string; kind: string; entityId: string; threadId?: string | null }
/** Appends in the caller's transaction; notify only after commit. */
export class ServerEvents {
  private readonly streams = new Set<() => void>();
  private readonly closers = new Set<() => void>();
  private readonly members = new Map<string, number>();
  constructor(readonly db: ServerDatabase) {}
  append(change: Change): number {
    return Number(this.db.prepare("INSERT INTO mw_events(scope_kind,scope_id,kind,entity_id,thread_id) VALUES (?,?,?,?,?)")
      .run(change.scopeKind, change.scopeId, change.kind, change.entityId, change.threadId ?? null).lastInsertRowid);
  }
  list(scopeKind: string, scopeId: string, after: number) {
    return this.db.prepare("SELECT cursor,kind,entity_id,thread_id FROM mw_events WHERE scope_kind=? AND scope_id=? AND cursor>? ORDER BY cursor LIMIT 100")
      .all(scopeKind, scopeId, after) as {cursor:number;kind:string;entity_id:string;thread_id:string|null}[];
  }
  open(response: ServerResponse, scopeKind: string, scopeId: string, cursor: number, authorize: () => void, memberId: string): void {
    authorize();
    const held = this.members.get(memberId) ?? 0;
    if (held >= 8) throw streamErrors.stream_limit("实时连接已达上限，请关闭其他标签页后重试");
    this.members.set(memberId, held + 1);
    let closed = false, timer: ReturnType<typeof setInterval> | undefined;
    const close = () => {
      if (closed) return; closed = true;
      clearInterval(timer); this.streams.delete(flush); this.closers.delete(close);
      const count = (this.members.get(memberId) ?? 1) - 1;
      if (count) this.members.set(memberId, count); else this.members.delete(memberId);
      if (!response.writableEnded && !response.destroyed) response.end();
    };
    const flush = () => {
      if (closed) return;
      try {
        authorize();
        for (const change of this.list(scopeKind, scopeId, cursor)) { response.write(`id: ${change.cursor}\nevent: change\ndata: ${JSON.stringify({...change,...(scopeKind === "room" ? {room_id:scopeId} : {})})}\n\n`); cursor = change.cursor; }
      } catch {
        try { if (!response.destroyed) response.write("event: revoked\ndata: {}\n\n"); }
        catch { /* A disconnected client has no channel left for the revocation notice. */ }
        close();
      }
    };
    response.once("close", close); response.once("error", close);
    this.streams.add(flush); this.closers.add(close);
    try {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      response.write(`event: ready\ndata: ${JSON.stringify({cursor})}\n\n`);
      timer = setInterval(() => { flush(); if (!closed) { try { response.write(": heartbeat\n\n"); } catch { close(); } } }, 5000); timer.unref();
      flush();
    } catch (error) { close(); throw error; }
  }
  notify(): void { for (const flush of this.streams) flush(); }
  close(): void { for (const close of this.closers) close(); }
}
