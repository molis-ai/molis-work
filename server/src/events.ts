import type { ServerResponse } from "node:http";
import type { ServerDatabase } from "./database.js";
export interface Change { scopeKind: "project" | "room"; scopeId: string; kind: string; entityId: string; threadId?: string | null }
/** Appends in the caller's transaction; notify only after commit. */
export class ServerEvents {
  private readonly streams = new Set<() => void>();
  private readonly closers = new Set<() => void>();
  constructor(readonly db: ServerDatabase) {}
  append(change: Change): number {
    return Number(this.db.prepare("INSERT INTO mw_events(scope_kind,scope_id,kind,entity_id,thread_id) VALUES (?,?,?,?,?)")
      .run(change.scopeKind, change.scopeId, change.kind, change.entityId, change.threadId ?? null).lastInsertRowid);
  }
  list(scopeKind: string, scopeId: string, after: number) {
    return this.db.prepare("SELECT cursor,kind,entity_id,thread_id FROM mw_events WHERE scope_kind=? AND scope_id=? AND cursor>? ORDER BY cursor LIMIT 100")
      .all(scopeKind, scopeId, after) as {cursor:number;kind:string;entity_id:string;thread_id:string|null}[];
  }
  open(response: ServerResponse, scopeKind: string, scopeId: string, cursor: number, authorize: () => void): void {
    authorize();
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    response.write(`event: ready\ndata: ${JSON.stringify({cursor})}\n\n`);
    const flush = () => {
      try {
        authorize();
        for (const change of this.list(scopeKind, scopeId, cursor)) { response.write(`id: ${change.cursor}\nevent: change\ndata: ${JSON.stringify({...change,...(scopeKind === "room" ? {room_id:scopeId} : {})})}\n\n`); cursor = change.cursor; }
      } catch { response.write("event: revoked\ndata: {}\n\n"); response.end(); }
    };
    const timer = setInterval(() => { flush(); if (!response.writableEnded) response.write(": heartbeat\n\n"); }, 5000);
    timer.unref(); this.streams.add(flush); flush();
    const close = () => {clearInterval(timer);this.streams.delete(flush);this.closers.delete(close);response.end();};
    this.closers.add(close);
    response.on("close", close);
  }
  notify(): void { for (const flush of this.streams) flush(); }
  close(): void { for (const close of this.closers) close(); }
}
