// RAC-20, RAC-21, RAC-22: protocol, request-body refusal and bounded progress over real HTTP.
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { streamLines, streamProbe } from "./fixtures/plugin-stream.js";

for (const scope of ["home", "project"] as const) {
  test(`W5-01-STREAM-01 ${scope} HTTP hands action progress on before its sole result and preserves JSON`, { timeout: 60_000 }, async t => {
    const probe = streamProbe(scope), release = deferred(), entered = deferred();
    const { request, project } = await serveHomeRuntime(t, { pluginFixtures: { [scope]: [probe.definition] } });
    const current = scope === "project" ? await project("Stream project") : undefined;
    const prefix = `${current ? `/projects/${current.project_id}` : ""}/api/plugins/${probe.id}`;
    const original = probe.behavior.action;
    probe.behavior.action = async (caller, context) => {
      caller.on_progress?.({ stage: "entered", progress: 0 }); entered.resolve(); await release.promise;
      return original(caller, context);
    };
    try {
      const response = await request(`${prefix}/run`, { method: "POST", body: {} });
      await entered.promise;
      const reader = response.body!.getReader(), first = await reader.read();
      assert.deepEqual(JSON.parse(new TextDecoder().decode(first.value)), { type: "progress", stage: "entered", progress: 0 });
      release.resolve();
      let rest = "";
      for (;;) { const part = await reader.read(); if (part.done) break; rest += new TextDecoder().decode(part.value); }
      const lines = rest.trim().split("\n").map(line => JSON.parse(line));
      assert.deepEqual(lines.map(line => line.type), ["progress", "result"]);
      assert.equal(lines[0].text_delta, "正文");
      assert.deepEqual(lines[1].result, { project_id: current?.project_id ?? null, value: "saved" });
      assert.equal(probe.contexts.at(-1)!.services!.storage!.get("result"), "saved");
      probe.behavior.action = original;
      const plain = await request(`${prefix}/json`, { method: "POST", body: {} });
      assert.match(plain.headers.get("content-type")!, /application\/json/);
      assert.deepEqual(await plain.json(), lines[1].result);
    } finally { release.resolve(); }
  });
}

test("W5-01-STREAM-02 SYS-15 manifest accepts only POST ndjson and a bounded explicit body size", () => {
  const { manifest } = streamProbe().definition;
  assert.equal(parsePluginManifest(manifest).routes?.at(-1)?.max_body_bytes, 36_000_000);
  // SYS-15 permits a declared 64 MiB folder encoded as JSON/base64, within the 96 MiB transport bound.
  assert.equal(parsePluginManifest({ ...manifest, routes: [{ route_id: "upload", method: "POST", path: "/upload",
    max_body_bytes: 96 * 1024 * 1024 }] }).routes?.[0]?.max_body_bytes, 96 * 1024 * 1024);
  for (const route of [
    { stream: "sse" }, { stream: true }, { stream: "ndjson", method: "GET" },
    { max_body_bytes: 96 * 1024 * 1024 + 1 }, { max_body_bytes: 0 }, { max_body_bytes: 1.5 },
  ]) assert.throws(() => parsePluginManifest({ ...manifest, routes: [{ route_id: "bad", method: "POST", path: "/bad", ...route }] }));
});

test("S-03 W5-01-STREAM-02 oversized body is refused before streaming or running the handler", { timeout: 60_000 }, async t => {
  const probe = streamProbe(), { request } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const path = `/api/plugins/${probe.id}/direct`, raw = '"' + "x".repeat(35_999_998) + '"';
  const accepted = await request(path, { method: "POST", raw });
  assert.deepEqual((await streamLines(accepted)).at(-1), { type: "result", result: { value: "direct" } });
  assert.equal(probe.requests.length, 1);
  const rejected = await request(path, { method: "POST", raw: raw + " " });
  assert.equal(rejected.status, 413); assert.match(rejected.headers.get("content-type")!, /application\/json/);
  assert.equal(probe.requests.length, 1, "the oversized request never entered the route");
});

for (const overflow of ["line", "count", "total"] as const) {
  test(`S-03 W5-01-STREAM-03 ${overflow} progress overflow cancels and produces exactly one error`, { timeout: 60_000 }, async t => {
    const probe = streamProbe(); let cancelled = false;
    probe.behavior.route = async request => {
      request.execution!.signal!.addEventListener("abort", () => { cancelled = true; }, { once: true });
      const event = { stage: "working", progress: 0.5, text_delta: overflow === "line" ? "x".repeat(65_536) : overflow === "total" ? "x".repeat(60_000) : "" };
      for (let index = 0; index < (overflow === "line" ? 1 : overflow === "total" ? 18 : 10_001); index++) request.emit!(event);
      return { status: 200, body: { shouldNotAppear: true } };
    };
    const { request } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
    const lines = await streamLines(await request(`/api/plugins/${probe.id}/direct`, { method: "POST", body: {} }));
    assert.equal(cancelled, true);
    assert.equal(lines.filter(line => line.type !== "progress").length, 1);
    assert.equal(lines.at(-1)?.code, "actions.output_invalid");
    assert.equal(lines.at(-1)?.type, "error");
  });
}

test("W5-01-STREAM-03 a plugin cannot forge a result or extra fields in progress", { timeout: 60_000 }, async t => {
  const probe = streamProbe();
  probe.behavior.route = async request => {
    const forged = { type: "result", result: "forged", stage: "working", progress: 0.5, text_delta: "text", call_id: "forged" };
    request.emit!(forged); return { status: 200, body: "real result" };
  };
  const { request } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const lines = await streamLines(await request(`/api/plugins/${probe.id}/direct`, { method: "POST", body: {} }));
  assert.deepEqual(lines, [{ type: "progress", stage: "working", progress: 0.5, text_delta: "text" }, { type: "result", result: "real result" }]);
});

for (const exit of ["ndjson", "json"] as const) {
  test(`S-03 W5-01-STREAM-03 a plugin cannot name the call its ${exit} refusal belongs to`, { timeout: 60_000 }, async t => {
    const probe = streamProbe(); let ran = false;
    if (exit === "json") delete probe.definition.manifest.routes!.find(route => route.route_id === "direct")!.stream;
    probe.behavior.route = async request => {
      if (request.body === "after a call") { await probe.contexts.at(-1)!.services!.actions!.invoke(probe.action, {}); ran = true; }
      return { status: 409, body: { code: "stream-home.stale", error: "已变化", call_id: "forged" } };
    };
    const { request, host } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
    const refusal = async (body: string) => {
      const response = await request(`/api/plugins/${probe.id}/direct`, { method: "POST", body });
      if (exit === "json") { assert.equal(response.status, 409); return { ...await response.json() as Record<string, unknown>, header: response.headers.get("x-molis-work-call-id") }; }
      return (await streamLines(response)).at(-1)!;
    };
    const unrecorded = await refusal("no call");
    assert.equal(unrecorded.code, "stream-home.stale");
    assert.equal(Object.hasOwn(unrecorded, "call_id"), false, "a refusal that left no row carries no number");
    const recorded = await refusal("after a call");
    assert.equal(ran, true); assert.equal(recorded.code, "stream-home.stale");
    assert.equal(typeof recorded.call_id, "string"); assert.notEqual(recorded.call_id, "forged");
    assert.ok(host.callLog!.find(String(recorded.call_id)).some(row => row.capability_id === probe.action.capability_id), "only the Host's recorded number");
    if (exit === "json") assert.equal(recorded.call_id, recorded.header);
  });
}

test("W5-01-STREAM-01 an action failure after progress ends with the shared error and leaves no business value", { timeout: 60_000 }, async t => {
  const probe = streamProbe();
  probe.behavior.action = async caller => {
    caller.on_progress?.({ stage: "checking", progress: 0.2 });
    throw new ActionError("actions.input_invalid", "The input was refused");
  };
  const { request } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const lines = await streamLines(await request(`/api/plugins/${probe.id}/run`, { method: "POST", body: {} }));
  assert.deepEqual(lines.map(line => line.type), ["progress", "error"]);
  assert.equal(lines[1].code, "actions.input_invalid"); assert.equal(lines[1].status, 400);
  assert.equal(lines[1].error, "The input was refused");
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("result"), null);
});

test("W5-01-STREAM-01 a route without the stream declaration never receives emit", { timeout: 60_000 }, async t => {
  const probe = streamProbe();
  delete probe.definition.manifest.routes!.find(route => route.route_id === "direct")!.stream;
  probe.behavior.route = async request => { assert.equal(request.emit, undefined); return { status: 200, body: "plain" }; };
  const { request } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const response = await request(`/api/plugins/${probe.id}/direct`, { method: "POST", body: {} });
  assert.match(response.headers.get("content-type")!, /application\/json/); assert.equal(await response.json(), "plain");
});

test("W5-01-STREAM-07 NDJSON 2xx commit after mid-flight client disconnect keeps idempotency key complete while failed stream releases it", { timeout: 60_000 }, async t => {
  const probe = streamProbe();
  let entered = deferred();
  let release = deferred();
  let finished = deferred();
  let mode: "commit" | "fail" = "commit";
  let executions = 0;
  probe.behavior.route = async request => {
    executions += 1;
    request.emit?.({ stage: "started", progress: 0.1 });
    entered.resolve();
    try {
      await release.promise;
      if (mode === "fail") throw new ActionError("actions.execution_failed", "stream failed after disconnect");
      return { status: 200, body: { committed: true, run: executions } };
    } finally {
      finished.resolve();
    }
  };
  const { request } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const path = `/api/plugins/${probe.id}/direct`;

  // 1. Client disconnects mid-flight, then handler commits 200: key must settle as complete and reject same-key replay with 409.
  const commitAbort = new AbortController();
  const commitKey = "ndjson-disconnect-commit-key";
  const droppedCommit = request(path, {
    method: "POST",
    body: {},
    headers: { "x-molis-work-idempotency-key": commitKey },
    signal: commitAbort.signal,
  }).then(async res => {
    const reader = res.body?.getReader();
    if (reader) {
      await reader.read();
      await reader.cancel();
    }
  }, () => undefined);
  await entered.promise;
  commitAbort.abort();
  await droppedCommit;
  release.resolve();
  await finished.promise;
  // Poll briefly for response.end() settlement to land before retrying the same key.
  let replay = await request(path, { method: "POST", body: {}, headers: { "x-molis-work-idempotency-key": commitKey } });
  for (let i = 0; i < 20 && replay.status === 409; i += 1) {
    const payload = await replay.clone().json() as { code?: string };
    if (payload.code !== "request.in_flight") break;
    await new Promise(resolve => setTimeout(resolve, 15));
    replay = await request(path, { method: "POST", body: {}, headers: { "x-molis-work-idempotency-key": commitKey } });
  }
  assert.equal(replay.status, 409, "retrying a committed NDJSON mutation key after disconnect is refused");
  assert.notEqual((await replay.json() as { code?: string }).code, "request.in_flight", "key settled as complete, not stuck in_flight");
  assert.equal(executions, 1, "committed NDJSON mutation did not run a second time");

  // 2. Client disconnects mid-flight and handler throws: key is released so retry with the same key executes and succeeds.
  entered = deferred();
  release = deferred();
  finished = deferred();
  mode = "fail";
  const failAbort = new AbortController();
  const failKey = "ndjson-disconnect-fail-key";
  const droppedFail = request(path, {
    method: "POST",
    body: {},
    headers: { "x-molis-work-idempotency-key": failKey },
    signal: failAbort.signal,
  }).then(async res => {
    const reader = res.body?.getReader();
    if (reader) {
      await reader.read();
      await reader.cancel();
    }
  }, () => undefined);
  await entered.promise;
  failAbort.abort();
  await droppedFail;
  release.resolve();
  await finished.promise;
  mode = "commit";
  release = deferred();
  release.resolve();
  let retried = await request(path, { method: "POST", body: {}, headers: { "x-molis-work-idempotency-key": failKey } });
  for (let i = 0; i < 20 && retried.status === 409; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 15));
    retried = await request(path, { method: "POST", body: {}, headers: { "x-molis-work-idempotency-key": failKey } });
  }
  assert.equal(retried.status, 200, "failed NDJSON stream after disconnect releases its key for retry");
  const retriedLines = await streamLines(retried);
  assert.equal(retriedLines.at(-1)?.type, "result");
  assert.equal(executions, 3);
});
