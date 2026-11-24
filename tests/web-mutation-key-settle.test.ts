import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";

import { authorizeLocalWebRequest, finalizeLocalMutation, installHostUiText, markMutationResponseFailed, runWithLocale, sendLocalWebJson, type LocalMutationState } from "@molis-ai/molis-work-app-local-host";

test.before(installHostUiText);

/**
 * A one-time request key is settled by what the handler ends up answering, not by whether the socket was still there to
 * receive it. A page that gives up on a slow request (a closed dialog, a timeout) must not leave its key "in flight"
 * for good: the retry the page really makes would be refused until the process restarts.
 */
const token = "t".repeat(40);
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

/** Polls until `ready` holds; on a loaded machine the server's side of a request lands later than any fixed sleep assumes. */
async function until(ready: () => boolean, what: string) {
  const deadline = Date.now() + 10_000;
  while (!ready()) { if (Date.now() > deadline) assert.fail(`timed out waiting: ${what}`); await delay(10); }
}

async function fixture(handlerStatus: () => number, handlerMilliseconds: number | (() => Promise<unknown>)) {
  const keys = new Map<string, LocalMutationState>();
  let executions = 0;
  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://127.0.0.1");
    if (!runWithLocale("zh", () => authorizeLocalWebRequest(request, response, url, token, keys))) return;
    executions++;
    await (typeof handlerMilliseconds === "number" ? delay(handlerMilliseconds) : handlerMilliseconds());
    sendLocalWebJson(response, handlerStatus(), { ok: handlerStatus() < 400 });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number }, origin = `http://127.0.0.1:${address.port}`;
  const send = (path: string, key: string, signal?: AbortSignal) => fetch(origin + path, { method: "POST", signal,
    headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": key }, body: "{}" });
  return { keys, send, executions: () => executions, close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}

test("a request the client abandons keeps its key in flight while the handler runs, then settles with the handler's answer", async () => {
  // The first attempt's handler runs until the test lets it finish, so "still runs" holds however slow the machine is.
  let finish = () => {};
  const held = new Promise<void>(resolve => { finish = resolve; });
  const web = await fixture(() => 200, () => web.executions() === 1 ? held : Promise.resolve());
  try {
    // A Goals event command at its plugin address. No path allows a same-key replay (RAC-1805): the page's retry below spends a new key.
    const path = "/api/plugins/io.molis.work.goals/goals/g1/event-progress";
    const page = new AbortController();
    const abandoned = web.send(path, "abandoned-key-1", page.signal).then(() => assert.fail("the page gave up"), () => undefined);
    await until(() => web.executions() === 1, "the first attempt reaches its handler");
    page.abort();
    await abandoned;
    const during = await web.send(path, "abandoned-key-1");
    assert.equal(during.status, 409, "while the first attempt still runs, its key is taken");
    assert.equal((await during.json() as { code?: string }).code, "request.in_flight");
    finish();
    await until(() => web.keys.get("abandoned-key-1") === "complete", "the first attempt settles");
    assert.equal(web.keys.get("abandoned-key-1"), "complete", "the handler finished and answered 200 into the closed socket");
    // The page's retry spends a new Host one-time key; the settled key is not reused (the body's business key would be the same one).
    const retry = await web.send(path, "abandoned-key-1-retry");
    assert.equal(retry.status, 200, "the retry after the abandoned attempt reaches the handler");
    assert.equal(web.executions(), 2);
  } finally { finish(); await web.close(); }
});

test("an abandoned request whose handler failed frees its key for the retry", async () => {
  let status = 500;
  let finish = () => {};
  const held = new Promise<void>(resolve => { finish = resolve; });
  const web = await fixture(() => status, () => web.executions() === 1 ? held : Promise.resolve());
  try {
    const path = "/api/example/items";
    const page = new AbortController();
    const abandoned = web.send(path, "abandoned-key-2", page.signal).then(() => assert.fail("the page gave up"), () => undefined);
    await until(() => web.executions() === 1, "the first attempt reaches its handler");
    page.abort();
    await abandoned;
    finish();
    await until(() => !web.keys.has("abandoned-key-2"), "the failed attempt settles");
    assert.equal(web.keys.has("abandoned-key-2"), false, "a failed attempt does not hold its key");
    status = 200;
    const retry = await web.send(path, "abandoned-key-2");
    assert.equal(retry.status, 200);
    assert.equal(web.executions(), 2);
    assert.equal(web.keys.get("abandoned-key-2"), "complete");
  } finally { finish(); await web.close(); }
});

test("a request that was answered keeps the behaviour it had: complete on success, refused as a repeat, freed on failure", async () => {
  let status = 200;
  const web = await fixture(() => status, 0);
  try {
    const path = "/api/example/items";
    assert.equal((await web.send(path, "answered-key-3")).status, 200);
    assert.equal(web.keys.get("answered-key-3"), "complete");
    assert.equal((await web.send(path, "answered-key-3")).status, 409, "a repeat of a completed one-time operation is refused");
    status = 500;
    assert.equal((await web.send(path, "failed-key-4")).status, 500);
    assert.equal(web.keys.has("failed-key-4"), false);
  } finally { await web.close(); }
});

test("RAC-1805 a key that has been served is refused with 409 at the old Goals addresses too, and the refusal leaves it used", async () => {
  // The guard once let a served key through at these addresses so the old page could retry a Goals command with the same key. The page now sends
  // a fresh key for every attempt, to /api/plugins/io.molis.work.goals/…, and these addresses answer 404: no path is an exception any more.
  // The last one is another publisher's plugin route that merely ends the same way.
  const web = await fixture(() => 200, 0);
  try {
    const oldAddresses = [
      "/api/goals",
      "/api/goals/g1/event-progress",
      "/api/goals/g1/relations",
      "/api/relations/r1/deactivate",
      "/api/goal-tree-proposals/t1/decision",
      "/projects/p1/api/goals/g1/event-close",
      "/api/plugins/example.third-party/api/goals",
    ];
    for (const [index, path] of oldAddresses.entries()) {
      const key = `served-key-${index}`;
      assert.equal((await web.send("/api/example/items", key)).status, 200, `${path}: the key is served once, elsewhere`);
      await until(() => web.keys.get(key) === "complete", `${path}: the first use settles`);
      const replay = await web.send(path, key);
      assert.equal(replay.status, 409, `${path}: a served key is refused`);
      assert.equal(web.keys.get(key), "complete", `${path}: the refusal leaves the key used`);
    }
    assert.equal(web.executions(), oldAddresses.length, "no replay reached a handler");
  } finally { await web.close(); }
});

test("an abandoned handler that exits without ending the response releases its in_flight key via finalizeLocalMutation", async () => {
  const keys = new Map<string, LocalMutationState>();
  let releaseHandler = () => {};
  const held = new Promise<void>(resolve => { releaseHandler = resolve; });
  let executions = 0;
  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url!, "http://127.0.0.1");
    try {
      if (!runWithLocale("zh", () => authorizeLocalWebRequest(request, response, url, token, keys))) return;
      executions += 1;
      if (executions === 1) {
        await held;
        // Simulates sendUnhandledWebError returning early on ECONNRESET without calling response.end().
        return;
      }
      sendLocalWebJson(response, 200, { ok: true });
    } finally {
      finalizeLocalMutation(response, keys);
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const send = (key: string, signal?: AbortSignal) => fetch(origin + "/api/example/items", {
    method: "POST", signal,
    headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": key },
    body: "{}",
  });
  try {
    const page = new AbortController();
    const first = send("leak-guard-key-1", page.signal).then(() => assert.fail("expected abort"), () => undefined);
    await until(() => executions === 1, "first attempt enters handler");
    page.abort();
    await first;
    assert.equal(keys.get("leak-guard-key-1"), "in_flight", "still in flight until handler exits");
    releaseHandler();
    await until(() => !keys.has("leak-guard-key-1"), "finalizeLocalMutation clears abandoned in_flight key");
    const retry = await send("leak-guard-key-1");
    assert.equal(retry.status, 200, "retry with the same key succeeds after abandoned exit");
    assert.equal(keys.get("leak-guard-key-1"), "complete");
  } finally {
    releaseHandler();
    await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
  }
});

test("mutationKeys FIFO eviction preserves active in_flight keys and NDJSON failed streams release their key", async () => {
  const keys = new Map<string, LocalMutationState>();
  // Seed an active in_flight entry at the front, followed by 4096 completed entries.
  keys.set("slow-in-flight-key", "in_flight");
  for (let i = 0; i < 4096; i += 1) keys.set(`done-key-${i}`, "complete");
  let failStream = true;
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url!, "http://127.0.0.1");
    try {
      if (!runWithLocale("zh", () => authorizeLocalWebRequest(request, response, url, token, keys))) return;
      if (url.pathname === "/api/stream") {
        response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8" });
        if (failStream) {
          markMutationResponseFailed(response);
          response.end('{"type":"error","status":500,"code":"actions.execution_failed","error":"failed"}\n');
        } else {
          response.end('{"type":"result","result":{"ok":true}}\n');
        }
        return;
      }
      sendLocalWebJson(response, 200, { ok: true });
    } finally {
      finalizeLocalMutation(response, keys);
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (path: string, key: string) => fetch(origin + path, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": key },
    body: "{}",
  });
  try {
    assert.equal((await post("/api/example/items", "overflow-key-1")).status, 200);
    assert.equal(keys.get("slow-in-flight-key"), "in_flight", "active in_flight key must never be evicted by FIFO cap");
    assert.equal(keys.has("done-key-0"), false, "oldest complete key is evicted instead");
    // NDJSON stream that writes HTTP 200 headers then an error line must free its key for retry.
    const failed = await post("/api/stream", "stream-key-1");
    assert.equal(failed.status, 200);
    await failed.text();
    await until(() => !keys.has("stream-key-1"), "failed NDJSON stream releases key");
    failStream = false;
    const retry = await post("/api/stream", "stream-key-1");
    assert.equal(retry.status, 200);
    await retry.text();
    await until(() => keys.get("stream-key-1") === "complete", "succeeded NDJSON stream marks key complete");
  } finally {
    await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
  }
});
