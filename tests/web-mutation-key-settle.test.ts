import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";

import { authorizeLocalWebRequest, sendLocalWebJson, type LocalMutationState } from "@molis-ai/molis-work-app-local-host";

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
    if (!authorizeLocalWebRequest(request, response, url, token, keys)) return;
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
    // An event command path allows replay once it completed (the domain's own idempotency key decides).
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
    const retry = await web.send(path, "abandoned-key-1");
    assert.equal(retry.status, 200, "the retry of an idempotent command reaches the command again");
    assert.equal(web.executions(), 2);
  } finally { await web.close(); }
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
  } finally { await web.close(); }
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
