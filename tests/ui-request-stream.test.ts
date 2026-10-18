import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createUiRequest, UI_REQUEST_CLIENT_SCRIPT, type UiFetchInit } from "@molis-ai/molis-work-ui-host";
import type { ActionProgressEvent } from "@molis-ai/molis-work-contracts/platform/actions";

const progress = { type: "progress", stage: "writing", progress: 0, text_delta: "第一句 🌱" };
const line = (value: unknown) => JSON.stringify(value) + "\n";
const encoder = new TextEncoder();
function fixture(response: Response | (() => Response)) {
  const sent: UiFetchInit[] = [];
  const request = createUiRequest({ origin: "http://127.0.0.1:4173", token: () => "page-token", newKey: () => "new-intent", translate: text => text,
    fetch: async (_url, init) => { sent.push(init); return typeof response === "function" ? response() : response; } });
  return { request, sent };
}
function chunks(text: string, split: number, close = true) {
  const bytes = encoder.encode(text); let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    for (let offset = 0; offset < bytes.length; offset += split) controller.enqueue(bytes.slice(offset, offset + split));
    if (close) controller.close();
  }, cancel() { cancelled = true; } });
  return { response: new Response(body), cancelled: () => cancelled };
}

test("RAC-35 streamed UTF-8, CRLF, empty lines and a final line without newline preserve progress and the saved answer", async () => {
  const text = line(progress).replace("\n", "\r\n") + "\n" + JSON.stringify({ type: "result", result: { text: "保存的 🌱" } });
  for (const split of [1, 2, 7, 1024]) {
    const seen: ActionProgressEvent[] = [], f = fixture(chunks(text, split).response);
    assert.deepEqual(await f.request.stream("/reply", { body: { question: "继续" }, onProgress: event => seen.push(event) }), { text: "保存的 🌱" });
    assert.deepEqual(seen, [{ stage: "writing", progress: 0, text_delta: "第一句 🌱" }]);
    assert.equal(f.sent.length, 1);
  }
  assert.equal(await fixture(new Response(line({ type: "result", result: null }))).request.stream("/reply"), null);
});

test("RAC-35 stream uses the common POST controls, protects their casing and never retries", async () => {
  const f = fixture(new Response(line({ type: "result", result: 5 })));
  await f.request.stream("/reply", { body: { a: 1 }, headers: { "Content-Type": "text/plain", "X-Molis-Work-Control-Token": "spoof", "x-molis-work-idempotency-key": "spoof" } });
  assert.deepEqual(f.sent, [{ method: "POST", cache: "no-store", body: '{"a":1}', headers: {
    "content-type": "application/json", "x-molis-work-control-token": "page-token", "x-molis-work-idempotency-key": "new-intent",
  } }]);
});

test("RAC-35 HTTP and streamed failures retain code, status, details and body call_id", async () => {
  const body = { error: "需要下载语音模型", code: "material.model_required", call_id: "diagnostic-1", details: { approximate_bytes: 626000000 } };
  for (const response of [new Response(JSON.stringify(body), { status: 400 }), new Response(line({ type: "error", status: 400, ...body }))]) {
    await assert.rejects(fixture(response).request.stream("/read"), error => {
      assert.ok(error instanceof Error && "body" in error);
      assert.equal(error.message, body.error);
      assert.deepEqual([Reflect.get(error, "code"), Reflect.get(error, "status"), Reflect.get(error, "callId")], [body.code, 400, body.call_id]);
      assert.deepEqual(Reflect.get(error.body as object, "details"), body.details); return true;
    });
  }
  await assert.rejects(fixture(new Response("bad gateway", { status: 502 })).request.stream("/read", { fallback: "读取失败" }), { message: "读取失败", code: "ui_host.uncoded", body: "bad gateway" });
});

test("RAC-35 missing terminal, broken input, duplicate terminal and data after the terminal are refused", async () => {
  for (const text of ["", line(progress)]) await assert.rejects(fixture(new Response(text)).request.stream("/reply"), { code: "ui_host.outcome_unknown" });
  for (const text of ["not json\n", "null\n", "[]\n", line({ type: "result" }), line({ ...progress, progress: "0" }),
    line({ type: "error", code: "x" }), line({ type: "result", result: 1 }) + line(progress), line({ type: "result", result: 1 }).repeat(2)]) {
    await assert.rejects(fixture(new Response(text)).request.stream("/reply"), { code: "ui_host.invalid_response" });
  }
  for (const status of [200, 500]) {
    const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error("socket failed")); } }), { status });
    await assert.rejects(fixture(response).request.stream("/reply"), { code: "ui_host.outcome_unknown" });
  }
});

test("RAC-35 caller cancellation and unmounted scopes refuse queued progress/results and cancel the reader", async () => {
  for (const mode of ["signal", "scope", "callback"] as const) {
    const stream = chunks(line(progress) + line({ ...progress, text_delta: "late" }) + line({ type: "result", result: "late" }), 1024, false);
    const f = fixture(stream.response), controller = new AbortController(); let live = true, seen = 0;
    const scope = { fetch: async () => stream.response, assertCurrent: () => { if (!live) throw new DOMException("unmounted", "AbortError"); } };
    const pending = f.request.stream("/reply", { scope, signal: controller.signal, onProgress: () => {
      seen++; if (mode === "signal") controller.abort(); else if (mode === "scope") live = false; else throw new Error("view failed");
    } });
    await assert.rejects(pending, mode === "callback" ? /view failed/ : { name: "AbortError" });
    assert.equal(seen, 1); assert.equal(stream.cancelled(), true); assert.equal(stream.response.body!.locked, false);
  }
});

test("RAC-35 the serialized browser program exposes the same stream reader without module dependencies", async () => {
  const sandbox = vm.createContext({ URL, TextDecoder, setTimeout, clearTimeout, location: { origin: "http://127.0.0.1:4173" },
    crypto: { randomUUID: () => "fresh-key" }, navigator: {},
    document: { documentElement: { dataset: {} }, querySelector: () => ({ content: "page-token" }), createElement: () => ({}), addEventListener: () => {} },
    fetch: async () => chunks(line(progress) + line({ type: "result", result: "已保存" }), 1).response });
  vm.runInContext(UI_REQUEST_CLIENT_SCRIPT, sandbox);
  assert.equal(await vm.runInContext('molisWorkRequest.stream("/reply", { body: {} })', sandbox), "已保存");
});
