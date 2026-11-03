import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createGmailConnector, createGithubConnector, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import { fromBetterSqlite, SignalsModule } from "@molis-ai/molis-work-plugin-feed/store";
import { withIntegrationHome } from "./fixtures/integration-home.js";

const AT = "2026-08-30T10:00:00.000Z";
const gmailCursor = { v: 1, historyId: "100", mode: "live", at: AT, provenance: "full_sync", scope: "in:inbox is:unread", account_email: "owner@example.com" };
const json = (value: unknown, init?: ResponseInit) => new Response(JSON.stringify(value), init);
const sourceItems = (feed: FeedApplication, sourceId: string) => feed.snapshot(DEMO_PROJECT_ID).feed_items.filter(item => item.source_id === sourceId);
const sourceAttention = (feed: FeedApplication, sourceId: string) => {
  const ids = new Set(sourceItems(feed, sourceId).map(item => item.item_id));
  return feed.snapshot(DEMO_PROJECT_ID).inbox_entries.filter(entry => entry.subject_type === "feed_item" && ids.has(entry.subject_id));
};
const gmailMessage = (id: string) => ({ id, internalDate: String(Date.parse(AT)), labelIds: ["INBOX", "UNREAD"], snippet: `Literal ${id}`,
  payload: { headers: [{ name: "Subject", value: `Message ${id}` }, { name: "From", value: "sender@example.com" }, { name: "To", value: "owner@example.com" }] } });

test("W2-18-GMAIL-01 + W2-18-GMAIL-02: one large history record drains across durable batches and restart; a detail failure retains its exact offset", async () => {
  await withIntegrationHome(async home => {
    const ids = Array.from({ length: 52 }, (_, index) => `m-${index + 1}`), reads: string[] = [];
    let fail = false, bootstrapped = false;
    const provider = () => createGmailConnector({ accessToken: "dummy-fixture-token", getNowMs: () => Date.parse(AT), fetchImpl: async url => {
      if (url.includes("/profile")) return json({ historyId: bootstrapped ? "200" : "100", emailAddress: "owner@example.com" });
      if (url.includes("/messages?")) return json({ messages: [] });
      if (url.includes("/history?")) {
        const start = new URL(url).searchParams.get("startHistoryId");
        return json({ historyId: "200", history: start === "200" ? [] : [{ id: "101", messagesAdded: ids.map(id => ({ message: { id } })) }] });
      }
      const id = decodeURIComponent(new URL(url).pathname.split("/").at(-1)!); reads.push(id);
      return fail && id === "m-26" ? json({ error: "fixture failure" }, { status: 503 }) : json(gmailMessage(id));
    } });
    let chain = home.chain(provider());
    const source = chain.source("gmail");
    await chain.sync.sync(source.source_id, { idempotencyKey: "gmail-record-bootstrap" });
    assert.deepEqual(chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor, gmailCursor); bootstrapped = true;
    const first = await chain.sync.sync(source.source_id, { idempotencyKey: "gmail-record-first" });
    assert.equal(first.run.outcome, "completed");
    const progress = chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor;
    assert.deepEqual(progress, { ...gmailCursor, provenance: "history", position: { historyId: "101", offset: 25 } });
    assert.deepEqual(reads, ids.slice(0, 25));
    assert.equal(sourceItems(chain.feed, source.source_id).length, 25);
    home.reopen(); chain = home.chain(provider()); fail = true;
    await assert.rejects(chain.sync.sync(source.source_id, { idempotencyKey: "gmail-record-failed" }), error => error instanceof ActionError && error.code === "feed.connector_failed");
    assert.deepEqual(chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor, progress);
    assert.equal(sourceItems(chain.feed, source.source_id).length, 25);
    fail = false;
    await chain.sync.sync(source.source_id, { idempotencyKey: "gmail-record-second" });
    assert.deepEqual((chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor as { position: unknown }).position, { historyId: "101", offset: 50 });
    home.reopen(); chain = home.chain(provider());
    await chain.sync.sync(source.source_id, { idempotencyKey: "gmail-record-third" });
    assert.equal((chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor as { historyId: string }).historyId, "200");
    assert.equal("position" in (chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor as Record<string, unknown>), false);
    assert.deepEqual(sourceItems(chain.feed, source.source_id).map(item => item.external_id).sort(), ids.map(id => `${source.source_id}:gmail-msg-${id}`).sort());
    const signals = new SignalsModule(fromBetterSqlite(home.store().db)).query.list(DEMO_PROJECT_ID, source.source_id);
    assert.deepEqual(signals.map(signal => signal.provider_dedupe_id).sort(), ids.map(id => `gmail-msg-${id}`).sort());
    assert.equal(sourceAttention(chain.feed, source.source_id).length, 52);
    await chain.sync.sync(source.source_id, { idempotencyKey: "gmail-record-repeat" });
    assert.equal(sourceItems(chain.feed, source.source_id).length, 52);
  });
});

test("W2-18-GMAIL-01: page-boundary progress does not skip the 26th message; failure and duplicate history entries recover", async () => {
  await withIntegrationHome(async home => {
    const ids = Array.from({ length: 26 }, (_, index) => `p-${index + 1}`);
    let failPage = true, bootstrapped = false;
    const port = createGmailConnector({ accessToken: "dummy-fixture-token", getNowMs: () => Date.parse(AT), fetchImpl: async url => {
      if (url.includes("/profile")) return json({ historyId: bootstrapped ? "300" : "100", emailAddress: "owner@example.com" });
      if (url.includes("/messages?")) return json({ messages: [] });
      if (url.includes("/history?")) {
        const query = new URL(url).searchParams;
        if (query.get("startHistoryId") === "300") return json({ historyId: "300", history: [] });
        if (query.get("startHistoryId") === "101" || query.has("pageToken")) return failPage ? json({}, { status: 503 })
          : json({ historyId: "300", history: [{ id: "102", messagesAdded: [{ message: { id: "p-26" } }, { message: { id: "p-25" } }] }] });
        return json({ historyId: "300", nextPageToken: "second", history: [{ id: "101", messagesAdded: ids.slice(0, 25).map(id => ({ message: { id } })) }] });
      }
      return json(gmailMessage(new URL(url).pathname.split("/").at(-1)!));
    } });
    const chain = home.chain(port), source = chain.source("gmail");
    await chain.sync.sync(source.source_id, { idempotencyKey: "gmail-page-bootstrap" }); bootstrapped = true;
    await chain.sync.sync(source.source_id, { idempotencyKey: "gmail-page-first" });
    const progress = chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor;
    assert.equal((progress as { historyId: string }).historyId, "101");
    await assert.rejects(chain.sync.sync(source.source_id, { idempotencyKey: "gmail-page-fail" }));
    assert.deepEqual(chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor, progress);
    failPage = false;
    await chain.sync.sync(source.source_id, { idempotencyKey: "gmail-page-recovery" });
    assert.deepEqual(sourceItems(chain.feed, source.source_id).map(item => item.external_id).sort(), ids.map(id => `${source.source_id}:gmail-msg-${id}`).sort());
    assert.equal(sourceAttention(chain.feed, source.source_id).length, 26);
  });
});

test("W2-18-GMAIL-01 + W2-18-GMAIL-02: a later HTTP page failure retains the bootstrap checkpoint; recovery drains the partial record on that page", async () => {
  await withIntegrationHome(async home => {
    const ids = Array.from({ length: 30 }, (_, index) => `cross-${index + 1}`);
    let bootstrapped = false, failPage = true;
    const port = createGmailConnector({ accessToken: "dummy-fixture-token", getNowMs: () => Date.parse(AT), fetchImpl: async url => {
      if (url.includes("/profile")) return json({ historyId: bootstrapped ? "200" : "100", emailAddress: "owner@example.com" });
      if (url.includes("/messages?")) return json({ messages: [] });
      if (url.includes("/history?")) {
        const query = new URL(url).searchParams;
        if (query.get("startHistoryId") === "101" || query.has("pageToken")) return failPage ? json({}, { status: 503 })
          : json({ historyId: "200", history: [{ id: "102", messagesAdded: [...ids.slice(10), ids[0]!].map(id => ({ message: { id } })) }] });
        return json({ historyId: "200", nextPageToken: "second", history: [{ id: "101", messagesAdded: ids.slice(0, 10).map(id => ({ message: { id } })) }] });
      }
      return json(gmailMessage(new URL(url).pathname.split("/").at(-1)!));
    } });
    const chain = home.chain(port), source = chain.source("gmail");
    await chain.sync.sync(source.source_id, { idempotencyKey: "gmail-cross-bootstrap" }); bootstrapped = true;
    await assert.rejects(chain.sync.sync(source.source_id, { idempotencyKey: "gmail-cross-fail" }));
    assert.deepEqual(chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor, gmailCursor);
    assert.deepEqual(sourceItems(chain.feed, source.source_id), []);
    failPage = false;
    await chain.sync.sync(source.source_id, { idempotencyKey: "gmail-cross-first" });
    assert.deepEqual(chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor, { ...gmailCursor, provenance: "history", historyId: "101", position: { historyId: "102", offset: 15 } });
    assert.equal(sourceItems(chain.feed, source.source_id).length, 25);
    await chain.sync.sync(source.source_id, { idempotencyKey: "gmail-cross-tail" });
    assert.deepEqual(sourceItems(chain.feed, source.source_id).map(item => item.external_id).sort(), ids.map(id => `${source.source_id}:gmail-msg-${id}`).sort());
    assert.equal(sourceAttention(chain.feed, source.source_id).length, 30);
  });
});

test("W2-18-GMAIL-02: initial snapshot still fetches at most 25 details", async () => {
  let details = 0;
  const port = createGmailConnector({ accessToken: "dummy-fixture-token", getNowMs: () => Date.parse(AT), fetchImpl: async url => {
    if (url.includes("/profile")) return json({ historyId: "100", emailAddress: "owner@example.com" });
    if (url.includes("/messages?")) return json({ messages: Array.from({ length: 52 }, (_, index) => ({ id: `m-${index + 1}` })), nextPageToken: "unused" });
    details++; return json(gmailMessage(new URL(url).pathname.split("/").at(-1)!));
  } });
  const result = await port.sync({ cursor: null }, connectorControl());
  assert.equal(result.ok, true); assert.equal(details, 25);
  if (result.ok) assert.equal(result.items.length, 25);
});

const notifications = Array.from({ length: 51 }, (_, index) => ({ id: `n-${index + 1}`, repository: { full_name: "fixture/repo", html_url: "https://github.com/fixture/repo" },
  subject: { title: `Literal ${index + 1}`, type: "Issue", url: `https://api.github.com/repos/fixture/repo/issues/${index + 1}` }, reason: "mention", unread: true, updated_at: AT }));

test("W2-18-GITHUB-PAGES-01: the 20-page work bound rejects an unfinished response instead of issuing a complete cursor", async () => {
  let pages = 0;
  const port = createGithubConnector({ token: "dummy-fixture-token", fetchImpl: async url => {
    if (url.endsWith("/user")) return json({ login: "fixture" }, { headers: { "x-oauth-scopes": "notifications" } });
    const page = Number(new URL(url).searchParams.get("page") ?? 1); pages++;
    return json([], { headers: { link: `<https://api.github.com/notifications?page=${page + 1}&per_page=50>; rel="next"` } });
  } });
  const result = await port.sync({ cursor: {} }, connectorControl());
  assert.equal(pages, 20); assert.equal(result.ok, false); assert.equal("cursor" in result, false);
});

test("W2-18-GITHUB-PAGES-01: all pages reach Signals and Feed; a later page failure leaves the old cursor and recovers once", async () => {
  await withIntegrationHome(async home => {
    let fail = true, clock = Date.parse(AT);
    const calls: Array<{ url: string; conditional?: string }> = [];
    const port = createGithubConnector({ token: "dummy-fixture-token", now: () => new Date(clock), fetchImpl: async (url, init) => {
      assert.equal(new URL(url).origin, "https://api.github.com"); assert.equal(init?.redirect, "error"); assert.equal(init?.method ?? "GET", "GET");
      if (url.endsWith("/user")) return json({ login: "fixture" }, { headers: { "x-oauth-scopes": "notifications" } });
      const headers = init!.headers as Record<string, string>; calls.push({ url, conditional: headers["If-Modified-Since"] });
      if (new URL(url).searchParams.get("page") === "2") return fail ? json({}, { status: 503 }) : json(notifications.slice(50));
      if (headers["If-Modified-Since"]) return new Response(null, { status: 304 });
      return json(notifications.slice(0, 50), { headers: { "last-modified": "Sun, 30 Aug 2026 10:00:00 GMT", link: '<https://api.github.com/notifications?page=2&per_page=50>; rel="next"' } });
    } });
    const chain = home.chain(port), source = chain.source("github");
    await assert.rejects(chain.sync.sync(source.source_id, { idempotencyKey: "github-pages-fail" }));
    assert.deepEqual(chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor, {});
    assert.equal(sourceItems(chain.feed, source.source_id).length, 0);
    fail = false;
    await chain.sync.sync(source.source_id, { idempotencyKey: "github-pages-ok" });
    assert.deepEqual(sourceItems(chain.feed, source.source_id).map(item => item.external_id).sort(), notifications.map(row => `${source.source_id}:github-notification-${row.id}`).sort());
    assert.deepEqual(new SignalsModule(fromBetterSqlite(home.store().db)).query.list(DEMO_PROJECT_ID, source.source_id).map(signal => signal.provider_dedupe_id).sort(), notifications.map(row => `github-notification-${row.id}`).sort());
    assert.equal(sourceAttention(chain.feed, source.source_id).length, 51);
    const cursor = chain.feed.sources.get(DEMO_PROJECT_ID, source.source_id).cursor as { last_modified: string };
    assert.equal(cursor.last_modified, "Sun, 30 Aug 2026 10:00:00 GMT");
    assert.equal(calls.filter(call => new URL(call.url).searchParams.get("page") === "2").every(call => !call.conditional), true);
    clock += 120_000;
    await chain.sync.sync(source.source_id, { idempotencyKey: "github-pages-304" });
    assert.equal(sourceItems(chain.feed, source.source_id).length, 51);
    assert.equal(calls.at(-1)?.conditional, cursor.last_modified);
  });
});

test("W2-18-GITHUB-PAGES-01: hostile Link destinations and later-page rate limits cannot receive credentials or publish partial progress", async () => {
  for (const link of ['<https://evil.example/notifications?page=2>; rel="next"', '<http://api.github.com/notifications?page=2>; rel="next"',
    '<https://api.github.com/notifications?page=1>; rel="next"', '<https://api.github.com/user?page=2>; rel="next"', '<https://api.github.com/notifications?page=2>; rel="next"']) {
    const calls: string[] = [];
    const port = createGithubConnector({ token: "dummy-fixture-token", now: () => new Date(AT), fetchImpl: async url => {
      calls.push(url);
      if (url.endsWith("/user")) return json({ login: "fixture" }, { headers: { "x-oauth-scopes": "notifications" } });
      if (new URL(url).searchParams.get("page") === "2") return json({}, { status: 429, headers: { "retry-after": "120" } });
      return json(notifications.slice(0, 50), { headers: { link } });
    } });
    const result = await port.sync({ cursor: {} }, connectorControl()); assert.equal(result.ok, false);
    assert.equal(calls.every(url => new URL(url).origin === "https://api.github.com"), true);
    if (!result.ok && link.includes('page=2>;') && link.includes('https://api.github.com/notifications')) {
      assert.equal(result.failure, "rate_limited"); assert.equal(result.retryAfterAt, "2026-08-30T10:02:00.000Z");
    }
    assert.equal(JSON.stringify(result).includes("dummy-fixture-token"), false);
  }
});
