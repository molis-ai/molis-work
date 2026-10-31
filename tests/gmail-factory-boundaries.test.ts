import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createGmailProvider } from "@molis-ai/molis-work-integration-gmail";

test("RAC-127 / RAC-128: provider preserves resolver receivers, per-call tokens, clocks and ordered fetch context through mapping", async () => {
  const paths: string[] = [];
  const nowMs = 1800000000000;
  let clockReads = 0;
  let phase = "health";
  let syncReceiver: unknown;
  const options = {
    calls: 0,
    getNowMs: () => { clockReads += 1; return nowMs; },
    async resolveUsableToken(input: { nowMs?: number }) {
      assert.equal(input.nowMs, nowMs);
      this.calls += 1;
      return { ok: true as const, accessToken: `access-${this.calls}` };
    },
    async fetchImpl(this: unknown, input: string, init?: RequestInit) {
      // W5-10 equivalence guards preserve health's bare fetch call and sync's shared receiver from before the split.
      // They are not public plugin contracts; reassess them if an accepted W5-11 spec changes the behavior.
      if (phase === "health") assert.equal(this, undefined, "health invokes the captured fetch as a bare function");
      else {
        assert.ok(this && typeof this === "object");
        syncReceiver ??= this;
        assert.equal(this, syncReceiver, "all sync requests share the original context");
      }
      assert.equal(new Headers(init?.headers).get("Authorization"), phase === "health" ? "Bearer access-1" : "Bearer access-2");
      const url = new URL(input);
      paths.push(url.pathname);
      if (url.pathname.endsWith("/profile")) return Response.json({ historyId: "200", emailAddress: "ME@example.test" });
      if (url.pathname.endsWith("/messages")) {
        assert.equal(url.searchParams.get("maxResults"), "50");
        return Response.json({ messages: [{ id: "m1" }, { id: "m1" }] });
      }
      assert.equal(url.searchParams.get("format"), "metadata");
      return Response.json({ id: "m1", snippet: "Read the document", labelIds: ["INBOX", "UNREAD", "STARRED"], payload: { headers: [{ name: "Subject", value: "A decision" }, { name: "From", value: "colleague@example.test" }, { name: "To", value: "me@example.test" }] } });
    },
  };
  const provider = createGmailProvider(options);
  assert.equal((await provider.health(connectorControl())).ok, true);
  phase = "sync";
  const result = await provider.sync({ cursor: null }, connectorControl());
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) assert.fail("full sync failed");
  assert.deepEqual(paths, ["/gmail/v1/users/me/profile", "/gmail/v1/users/me/profile", "/gmail/v1/users/me/messages", "/gmail/v1/users/me/messages/m1"]);
  assert.equal(options.calls, 2);
  // W5-10 equivalence guard preserves the original count of clock reads, not a public plugin contract.
  // Reassess this count if an accepted W5-11 spec changes the behavior.
  assert.equal(clockReads, 3);
  const cursor = result.cursor;
  assert.ok(cursor && typeof cursor === "object" && "historyId" in cursor);
  assert.equal(cursor.historyId, "200");
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.externalId, "gmail-msg-m1");
  assert.equal(item.title, "A decision");
  assert.equal(item.occurredAt, new Date(nowMs).toISOString());
  assert.equal(item.priority, "high");
  assert.deepEqual(item.tags, ["gmail", "label:inbox", "label:unread", "label:starred"]);
  assert.doesNotMatch(JSON.stringify(result), /access-[12]/);
});

test("RAC-127: auth-ref methods remain instance-bound and absent optional resolvers do not read the clock", async () => {
  const options = {
    authRef: "ref-a", reads: 0,
    resolveAuthRef(ref: string) { assert.equal(ref, this.authRef); this.reads += 1; return null; },
  };
  const provider = createGmailProvider(options);
  assert.equal((await provider.health(connectorControl())).ok, false);
  assert.equal((await provider.sync({ cursor: null }, connectorControl())).ok, false);
  assert.equal(options.reads, 2);
  const absent = createGmailProvider({ getNowMs: () => assert.fail("absent resolver evaluated its arguments") });
  assert.equal((await absent.health(connectorControl())).ok, false);
  assert.equal((await absent.sync({ cursor: null }, connectorControl())).ok, false);
});
