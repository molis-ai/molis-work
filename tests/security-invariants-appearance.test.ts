import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

const endpoint = "/api/ui/appearance";
const pageProof = "x-molis-work-page-session";

test("FSS-08 FSS-19 FSS-20 FSS-27 FSS-28 the real Host binds appearance invalidation and effects to the original page", { timeout: 30_000 }, async t => {
  const fixture = await serveHomeRuntime(t);
  const newPage = async () => {
    const response = await fetch(fixture.origin + "/settings/appearance");
    const html = await response.text();
    assert.equal(response.status, 200);
    const cookie = response.headers.getSetCookie().find(value => value.startsWith("molis-work-web-"))?.split(";")[0];
    const proof = /<meta name="molis-work-page-session" content="([^"]+)"/u.exec(html)?.[1];
    assert.ok(cookie && proof);
    return { cookie, [pageProof]: proof };
  };
  const first = await newPage(), second = await newPage();
  const streamPath = fixture.origin + endpoint + "/events";
  for (const headers of [{ cookie: first.cookie }, { [pageProof]: first[pageProof] },
    { ...second, [pageProof]: first[pageProof] }, { ...first, origin: "http://127.0.0.1:1" },
    { ...first, "sec-fetch-site": "cross-site" }, { "x-molis-work-control-token": fixture.token }]) {
    const response = await fetch(streamPath, { headers, signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 403);
    await response.text();
  }

  const connection = new AbortController();
  t.after(() => connection.abort());
  const events = await fetch(streamPath, { headers: first, signal: connection.signal });
  assert.equal(events.status, 200);
  assert.match(events.headers.get("content-type") ?? "", /^text\/event-stream/u);
  const reader = events.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const next = async () => {
    while (!buffer.includes("\n\n")) {
      const part = await reader.read();
      assert.equal(part.done, false);
      buffer += decoder.decode(part.value, { stream: true });
    }
    const end = buffer.indexOf("\n\n"), data = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    assert.match(data, /^data: /u);
    return JSON.parse(data.slice(6));
  };
  assert.deepEqual(await next(), { selection_revision: 0 });

  const command = (path: string, body?: unknown, headers = second) => fetch(fixture.origin + path, {
    method: path === "/api/web-session" ? "DELETE" : "POST",
    headers: { ...headers, origin: fixture.origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const request_id = "select-folio-from-another-page";
  const selection = { skin: { id: "folio", revision: 1 }, font: { policy: "follow-skin" }, mono: null };
  const grant = await command("/api/host/plugin-pages", { plugin_id: "io.molis.work.issues" });
  assert.equal(grant.status, 200, (await grant.clone().text()).slice(0, 300));
  const { page_id } = await grant.json();
  assert.equal(typeof page_id, "string");
  for (const source of ["x-molis-plugin-page", "x-molis-context-page"]) {
    const framed = { ...second, [source]: page_id };
    const readerPaths = [endpoint, endpoint + "/events"];
    for (const path of readerPaths) {
      const denied = await fetch(fixture.origin + path, { headers: framed, signal: AbortSignal.timeout(2000) });
      assert.equal(denied.status, 403);
      await denied.text();
    }
    const forgedApply = await command(endpoint, { expected_revision: 0, request_id, choice: { kind: "selection", selection } }, framed);
    assert.equal(forgedApply.status, 403);
    await forgedApply.text();
    const forgedUndo = await command(endpoint + "/undo", { expected_revision: 1, applied_request_id: request_id }, framed);
    assert.equal(forgedUndo.status, 403);
    await forgedUndo.text();
  }
  const untouched = await fetch(fixture.origin + endpoint + "?request_id=" + request_id, { headers: second });
  const before = await untouched.json();
  assert.equal(before.current.selection_revision, 0);
  assert.equal(before.recovery, undefined);
  const apply = await command(endpoint, { expected_revision: 0, request_id, choice: { kind: "selection", selection } });
  assert.equal(apply.status, 200, (await apply.clone().text()).slice(0, 500));
  const result = await apply.json();
  assert.deepEqual(result.receipt, { selection_revision: 1, request_id, selection });
  assert.deepEqual(await next(), { selection_revision: 1 });
  const state = JSON.parse(await readFile(join(fixture.home, "interface", "state.json"), "utf8"));
  assert.equal(state.selection_revision, 1);
  assert.deepEqual(state.selection, selection);
  const retry = await fetch(fixture.origin + endpoint + "?request_id=" + request_id, { headers: second });
  assert.deepEqual((await retry.json()).recovery.applied, result.receipt);

  const revoked = await command("/api/web-session", undefined, first);
  assert.equal(revoked.status, 200);
  await revoked.text();
  const closed = await reader.read().then(part => part.done, () => true);
  assert.equal(closed, true);
  const old = await fetch(streamPath, { headers: { ...second, [pageProof]: first[pageProof] }, signal: AbortSignal.timeout(2000) });
  assert.equal(old.status, 403);
  await old.text();
  const undo = await command(endpoint + "/undo", { expected_revision: 1, applied_request_id: request_id });
  assert.equal(undo.status, 200);
  assert.equal((await undo.json()).receipt.selection.skin.id, "soft-workbench");
});
