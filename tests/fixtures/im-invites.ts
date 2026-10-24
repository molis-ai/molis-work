import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { openServerDatabase, Identity, ServerEvents, ContinuityService, createImDomain, startServer } from "@molis-ai/molis-work-server";
import type { ImMember, ImRoom } from "@molis-ai/molis-work-contracts/services/im";

/** A real HTTP transport, shared identity and durable server owner, in a throwaway Home. */
export async function inviteFixture(t: Pick<TestContext, "after">, options: { home?: string; imAssets?: NonNullable<Parameters<typeof startServer>[0]["imAssets"]> } = {}) {
  const home = options.home ?? await mkdtemp(join(tmpdir(), "molis-invite-"));
  const boot = async () => {
    const storage = openServerDatabase(join(home, "server")), identity = new Identity(storage.db), events = new ServerEvents(storage.db);
    const continuity = new ContinuityService(storage.db, identity, events, () => { throw new Error("No Goal operation is expected"); });
    try { return { ...await startServer({ identity, events, continuity, im: createImDomain({ db: storage.db, identity, events }), port: 0, imAssets: options.imAssets }), storage }; }
    catch (error) { storage.close(); throw error; }
  };
  let current = await boot();
  t.after(async () => { try { await current.close(); } finally { current.storage.close(); await rm(home, { recursive: true, force: true }); } });
  const call = async <T = Record<string, unknown>>(cookie: string, route: string, body?: Record<string, unknown>) => {
    const response = await fetch(current.origin + "/im/api" + route, { method: body ? "POST" : "GET",
      headers: { cookie, origin: current.origin, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as T, headers: response.headers };
  };
  const person = async (name: string) => {
    const response = await call("", "/session"), cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    const named = await call<{ member: ImMember }>(cookie, "/session", { client_id: randomUUID(), display_name: name });
    assert.equal(named.status, 200);
    return { cookie, member: named.body.member };
  };
  return { home, call, person, get origin() { return current.origin; }, get storage() { return current.storage; },
    room: async (cookie: string) => { const result = await call<{ room: ImRoom }>(cookie, "/rooms", { client_id: randomUUID(), title: "Invitations" }); assert.equal(result.status, 200); return result.body.room; },
    post: <T = Record<string, unknown>>(cookie: string, route: string, body: Record<string, unknown> = {}) => call<T>(cookie, route, { client_id: randomUUID(), ...body }),
    restart: async () => { await current.close(); current.storage.close(); current = await boot(); },
    loseAnswer: (cookie: string, route: string, body: Record<string, unknown>) => new Promise<void>((resolve, reject) => {
      const request = http.request(current.origin + "/im/api" + route, { method: "POST",
        headers: { cookie, origin: current.origin, "content-type": "application/json" } }, response => {
        if (response.statusCode !== 200) { response.resume(); reject(new Error(`Expected a committed response, got ${response.statusCode}`)); return; }
        response.destroy(); resolve();
      });
      request.once("error", reject); request.end(JSON.stringify(body));
    }),
  };
}
