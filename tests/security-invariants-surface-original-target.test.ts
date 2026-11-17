import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os, { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { ComputerDesk, ComputerRecords, ComputerSettings, createBrowserSurfaceDriver } from "@molis-ai/molis-work-app-local-host";
import { isHostSurfaceRefusal, type HostSurfaceDriver, type HostSurfaceExpectedTarget } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { desktopState, surfaceContext, surfaceTarget } from "./fixtures/surface-target.js";
import { browserTransport, focusResponse, helperTransport } from "./fixtures/surface-transport.js";

function latch() {
  let release!: () => void;
  const reached = new Promise<void>(resolve => { release = resolve; });
  return { reached, release };
}

async function browser(t: TestContext) {
  const fixture = await browserTransport(t);
  let focus = 7, sensitive = false, hidden = false;
  fixture.respondWith(frame => {
    if (frame.method === "Page.getFrameTree") return { frameTree: { frame: { id: "frame" } } };
    if (frame.method === "Page.getNavigationHistory") return { currentIndex: -1, entries: [] };
    if (frame.method === "Page.createIsolatedWorld") return { executionContextId: 12 };
    if (frame.method === "Runtime.evaluate") {
      if (frame.params.serializationOptions) return focusResponse({ node: focus, sensitive, hidden });
      return { result: { value: JSON.stringify({ title: "Original", text: "original content", selection: false }) } };
    }
    return undefined;
  });
  const session = await fixture.page.session();
  fixture.page.targetInfo({ targetId: session.targetId, title: "Original", url: "https://original.example/" });
  const surface = createBrowserSurfaceDriver(fixture.page);
  t.after(() => surface.close());
  return { ...fixture, surface, session, replaceFocus() { focus++; }, makeSensitive() { sensitive = true; }, hideFocus() { hidden = true; } };
}

for (const next of ["document", "popup"] as const) test(`APR-11/13: the browser refuses the original observation after a replacement ${next} before entering the driver`, { timeout: 15_000 }, async t => {
  const f = await browser(t), control = surfaceContext("original");
  const original = await surfaceTarget(f.surface, control);
  if (next === "popup") {
    await f.page.adoptPopup("replacement");
    f.page.targetInfo({ targetId: "replacement", title: "Other", url: "https://other.example/" });
  } else {
    f.event("Page.frameNavigated", { frame: { id: "frame", loaderId: "replacement", url: "https://original.example/" } });
  }
  for (let n = 0; n < 100 && (await f.surface.identity(control)) === original.identity; n++) await setImmediate();
  assert.notEqual(await f.surface.identity(control), original.identity);
  const before = f.frames.length;
  await assert.rejects(f.surface.observe("dom", control, original), /原观察的页面或来源已变化/u);
  await assert.rejects(f.surface.focusedField!(control, original), /原观察的页面或来源已变化/u);
  await assert.rejects(f.surface.perform({ what: "text", text: "never send to replacement" }, control, original), /原观察的页面或来源已变化/u);
  assert.equal(f.frames.slice(before).some(frame => frame.method.startsWith("Input.") || frame.method.startsWith("Runtime.")), false);
  assert.match(new TextDecoder().decode(await f.surface.observe("dom", control, await surfaceTarget(f.surface, control))), /original content/u);
});

test("APR-11: browser text dispatches after the final focus read and before waiting for object release", { timeout: 15_000 }, async t => {
  const f = await browser(t), control = surfaceContext("original");
  const original = await surfaceTarget(f.surface, control), cleanup = f.holdNext("Runtime.releaseObject");
  const operation = f.surface.perform({ what: "text", text: "original only" }, control, { ...original, approved_focus: "7" });
  await cleanup.reached;
  const dispatched = f.frames.filter(frame => frame.method === "Input.insertText");
  f.replaceFocus();
  cleanup.release();
  await operation;
  assert.deepEqual(dispatched.map(frame => frame.params), [{ text: "original only" }]);
  assert.equal(f.frames.filter(frame => frame.method === "Input.insertText").length, 1);
});

for (const change of ["sensitive", "hidden"] as const) test(`APR-11: the final browser focus read refuses a field that became ${change}`, { timeout: 15_000 }, async t => {
  const f = await browser(t), control = surfaceContext("original");
  const original = await surfaceTarget(f.surface, control), early = f.holdNext("Page.createIsolatedWorld");
  const refused = assert.rejects(f.surface.perform({ what: "text", text: "focus refusal" }, control, { ...original, approved_focus: "7" }), /密码类输入框|无法核对原输入框/u);
  await early.reached;
  if (change === "sensitive") f.makeSensitive(); else f.hideFocus();
  early.release();
  await refused;
  assert.equal(f.frames.some(frame => frame.method === "Input.insertText"), false);
});

async function desktop(t: TestContext, open = true, document = "") {
  const fixture = await helperTransport(t);
  const started = fixture.helper.ensure();
  await fixture.connected; fixture.hello(); await started;
  const settings = new ComputerSettings(fixture.home), records = new ComputerRecords(fixture.home);
  settings.setEnabled(true);
  const desk = new ComputerDesk({ helper: fixture.helper, settings, records });
  const surface = desk.driver(), control = surfaceContext("original");
  const original = desktopState({ bundle_id: "com.apple.TextEdit", name: "TextEdit", pid: 42, front_pid: 42, active: true, hidden: false,
    window: { title: "Same title", frame: [100, 100, 500, 400], window_id: 7, document } });
  const other = desktopState({ ...original, bundle_id: "com.apple.Notes", name: "Notes", pid: 51, front_pid: 51,
    window: { ...original.window, title: "Other app", window_id: 11 } });
  let live: Omit<typeof original, "window"> & { window?: typeof original.window } = original;
  let opensWithoutWindow = false, label = "Save", fingerprint = "save-fingerprint", nameTruncated = false;
  fixture.respondWith((op, params) => {
    if (op === "monitor") return { watching: params.on === true };
    if (op === "app.open") {
      if (params.bundle_id === other.bundle_id) { live = other; return live; }
      live = original;
      return opensWithoutWindow ? { ...original, window: undefined, target: undefined } : live;
    }
    if (op === "app.state") return live;
    if (op === "apps.installed" || op === "apps.running") return { apps: [original, other] };
    if (op === "focused.field") return { name: "Same field", secure: false };
    if (op === "observe.tree") return { window: live.window, nodes: [{ role: "AXButton", name: label, depth: 0, frame: [110, 110, 40, 20] }], truncated: false, menus: [] };
    if (op === "probe.point") return { window: { id: live.window?.window_id, pid: live.pid }, element: { pid: live.pid, name: label, fingerprint, name_truncated: nameTruncated } };
    if (op === "observe.ocr") return { lines: [] };
    if (op === "observe.screenshot") return { png: Buffer.from("fixture").toString("base64"), included_pids: [live.pid], password_fields: 0, masked: 0 };
    if (op.startsWith("input.")) return { done: true };
    return {};
  });
  t.after(async () => { await surface.close(); desk.close(); });
  if (open) await surface.perform({ what: "app", app: original.bundle_id }, control, await surfaceTarget(surface, control));
  return { ...fixture, desk, records, settings, surface, control, original, other,
    replaceWindow() { live = desktopState({ ...original, window: { ...original.window, window_id: 8 } }); },
    renameWindow(title: string) { live = desktopState({ ...original, window: { ...original.window, title } }); },
    noFirstWindow() { opensWithoutWindow = true; },
    closeWindow() { live = { ...original, window: undefined, target: undefined }; },
    changeControl() { label = "Send"; fingerprint = "send-fingerprint"; },
    truncateControl() { nameTruncated = true; },
  };
}

test("APR-11/13: same desktop PID, title and frame do not let a replacement window supply observation or approval", { timeout: 15_000 }, async t => {
  const f = await desktop(t), original = await surfaceTarget(f.surface, f.control);
  const before = f.frames.length;
  f.replaceWindow();
  const refusal = (error: unknown) => isHostSurfaceRefusal(error) && error.refusal === "outside-target" && error.partial === false;
  await assert.rejects(f.surface.observe("accessibility-tree", f.control, original), refusal);
  await assert.rejects(f.surface.focusedField!(f.control, original), refusal);
  await assert.rejects(f.surface.perform({ what: "key", keys: ["Enter"] }, f.control, original), refusal);
  assert.deepEqual(f.frames.slice(before).map(frame => frame.op), ["app.state", "app.state", "app.state"]);
  const next = await surfaceTarget(f.surface, f.control);
  assert.notEqual(next.identity, original.identity);
  assert.deepEqual(await f.surface.focusedField!(f.control, next), { label: "Same field", sensitive: false });
});

test("APR-11: an accepted desktop input returns no picture or tree from a replacement window", { timeout: 15_000 }, async t => {
  const f = await desktop(t), original = await surfaceTarget(f.surface, f.control), sent = f.holdNext("input.key");
  const result = f.surface.perform({ what: "key", keys: ["Enter"] }, f.control, original);
  await sent.reached;
  const before = f.frames.length;
  f.replaceWindow(); sent.release({ done: true });
  const receipt = await result;
  assert.ok(receipt);
  assert.equal(receipt.model_image, undefined);
  assert.doesNotMatch(receipt.tree, /Same title/u);
  assert.equal(f.frames.slice(before).some(frame => frame.op.startsWith("observe.")), false);
  assert.equal(f.records.get(f.desk.state().record_id!)?.steps.at(-1)?.kind, "act");
});

for (const barrier of ["title", "capture"] as const) test(`APR-11: accepted desktop input stays complete when its ${barrier} makes the follow-up view unsafe`, { timeout: 15_000 }, async t => {
  const f = await desktop(t), original = await surfaceTarget(f.surface, f.control);
  const held = f.holdNext(barrier === "title" ? "input.key" : "observe.screenshot");
  const operation = f.surface.perform({ what: "key", keys: ["Enter"] }, f.control, original);
  await held.reached;
  if (barrier === "title") { f.renameWindow("Molis Work"); held.release({ done: true }); }
  else held.reject("capture.password", "sensitive screenshot");
  const receipt = await operation;
  assert.deepEqual(receipt, { tree: "操作已完成，请重新观察窗口。" });
  const steps = f.records.get(f.desk.state().record_id!)?.steps;
  assert.equal(steps?.at(-1)?.kind, "act");
  assert.equal(steps?.some(step => step.kind === "refused"), false);
});

test("APR-11: a changed desktop window during capture does not publish a new observation", { timeout: 15_000 }, async t => {
  const f = await desktop(t), original = await surfaceTarget(f.surface, f.control), capture = f.holdNext("observe.screenshot");
  const rejected = assert.rejects(f.surface.observe("accessibility-tree", f.control, original),
    error => isHostSurfaceRefusal(error) && error.refusal === "outside-target" && error.partial === false);
  await capture.reached;
  f.replaceWindow(); capture.reject("window.changed", "original window changed", false);
  await rejected;
  const steps = f.records.get(f.desk.state().record_id!)?.steps;
  assert.equal(steps?.some(step => step.kind === "look"), false);
  assert.equal(steps?.at(-1)?.kind, "refused");
});

for (const point of ["input.key", "app.state"] as const) test(`APR-11: the exact desktop acknowledgment survives revoke during ${point} without a late record`, { timeout: 15_000 }, async t => {
  const f = await desktop(t), original = await surfaceTarget(f.surface, f.control);
  const saved = f.records.get(f.desk.state().record_id!), baseline = f.frames.length;
  const input = f.holdNext("input.key");
  const operation = f.surface.perform({ what: "key", keys: ["Enter"] }, f.control, original);
  await input.reached;
  if (point === "app.state") {
    const followUp = f.holdNext(point);
    input.release({ done: true });
    await followUp.reached;
    f.settings.setEnabled(false); followUp.release(f.original);
  } else {
    f.settings.setEnabled(false); input.release({ done: true });
  }
  assert.deepEqual(await operation, { tree: "操作已完成，请重新观察窗口。" });
  assert.equal(f.frames.slice(baseline).filter(frame => frame.op === "input.key").length, 1);
  assert.equal(f.frames.slice(baseline).some(frame => frame.op.startsWith("observe.")), false);
  assert.deepEqual(f.records.get(saved!.id), saved);
});

test("APR-11: a selected app losing its last window can return to the list and switch again", { timeout: 15_000 }, async t => {
  const f = await desktop(t), before = await surfaceTarget(f.surface, f.control);
  f.closeWindow();
  const listTarget = await surfaceTarget(f.surface, f.control);
  assert.notEqual(listTarget.identity, before.identity);
  assert.equal(listTarget.scope, "desktop:no-app");
  assert.match(new TextDecoder().decode(await f.surface.observe("accessibility-tree", f.control, listTarget)), /Notes/u);
  await assert.rejects(f.surface.perform({ what: "key", keys: ["Enter"] }, f.control, before), /原应用已变化/u);
  await f.surface.perform({ what: "app", app: f.other.bundle_id }, f.control, listTarget);
  assert.deepEqual(f.frames.filter(frame => frame.op === "app.open").at(-1)?.params, { bundle_id: f.other.bundle_id, expected_window: null });
});

test("APR-11: desktop download refuses another document in the same observed window before copying", { timeout: 15_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-original-document-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  t.mock.method(os, "homedir", () => home);
  const originalPath = join(home, "original.txt"), replacementPath = join(home, "replacement.txt");
  await mkdir(join(home, "Downloads"));
  await writeFile(originalPath, "original"); await writeFile(replacementPath, "replacement");
  const f = await desktop(t, true, originalPath), original = await surfaceTarget(f.surface, f.control);
  const held = f.holdNext("document"), before = f.desk.holding()?.lastInjectAt;
  const rejected = assert.rejects(f.surface.perform({ what: "download", to: ["copied.txt"] }, f.control, original),
    error => isHostSurfaceRefusal(error) && error.refusal === "outside-target" && error.partial === false);
  await held.reached;
  assert.deepEqual(f.frames.at(-1)?.params.expected_window, f.original.target);
  held.release({ path: replacementPath });
  await rejected;
  await assert.rejects(readFile(join(home, "Downloads", "copied.txt")), { code: "ENOENT" });
  assert.equal(f.desk.holding()?.lastInjectAt, before);
});

test("APR-11: closing the original helper settles an accepted request whose response is still outstanding", { timeout: 15_000 }, async t => {
  const fixture = await helperTransport(t), started = fixture.helper.ensure();
  await fixture.connected; fixture.hello(); await started;
  const pending = fixture.holdNext("status");
  const refused = assert.rejects(fixture.helper.call("status"), { code: "computer.crashed" });
  await pending.reached;
  await Promise.all([fixture.helper.close(), refused]);
});

test("APR-11: the helper receives the original window for input after the last Host read", { timeout: 15_000 }, async t => {
  const f = await desktop(t), original = await surfaceTarget(f.surface, f.control), read = f.holdNext("focused.field");
  const saved = f.records.get(f.desk.state().record_id!);
  const result = assert.rejects(f.surface.perform({ what: "text", text: "original only" }, f.control, original),
    error => isHostSurfaceRefusal(error) && error.refusal === "outside-target" && error.partial === false);
  await read.reached;
  f.replaceWindow();
  const input = f.holdNext("input.text");
  read.release({ name: "Same field", secure: false });
  await input.reached;
  assert.deepEqual(f.frames.at(-1)?.params.expected_window, f.original.target);
  assert.equal(f.frames.at(-1)?.params.pid, f.original.pid);
  input.reject("window.changed", "original window changed", false);
  await result;
  assert.deepEqual(f.records.get(f.desk.state().record_id!), saved);
});

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toolOutput(body: Record<string, unknown>): string {
  const messages = body.messages;
  if (Array.isArray(messages)) {
    for (const message of [...messages].reverse()) {
      if (!object(message) || !Array.isArray(message.content)) continue;
      const result = message.content.find(item => object(item) && item.type === "tool_result");
      if (result) return JSON.stringify(result.content);
    }
  }
  assert.fail("SDK tool result missing");
}

const textAction = { do: "text", text: "original approved text" };

async function realRun(t: TestContext, surface: HostSurfaceDriver, actions: readonly Readonly<Record<string, unknown>>[] = [textAction]) {
  const root = await mkdtemp(join(tmpdir(), "molis-original-surface-")), queue = new AgentReviewQueue();
  let turn = 0, target: string | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    const raw = init.body;
    assert.ok(typeof raw === "string" || raw instanceof Uint8Array);
    const body: unknown = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    assert.ok(object(body));
    const currentTurn = turn++;
    if (currentTurn > actions.length * 2) return cogniaScriptedResponse();
    const step = currentTurn === 0 ? 0 : currentTurn % 2 === 1 ? 1 : 2;
    switch (step) {
      case 0: return cogniaScriptedResponse({ name: "surface-list", input: {} });
      case 1: {
        if (currentTurn === 1) {
          target = new RegExp(`([A-Za-z0-9_-]+) — ${surface.kind}`, "u").exec(toolOutput(body))?.[1];
          assert.ok(target);
        }
        assert.ok(target);
        return cogniaScriptedResponse({ name: "surface-observe", input: { target, kind: surface.kind === "desktop" ? "accessibility-tree" : "dom" } });
      }
      case 2: {
        const observation = /observation ([A-Za-z0-9_-]+)/u.exec(toolOutput(body))?.[1];
        assert.ok(observation);
        return cogniaScriptedResponse({ name: "surface-act", input: { observation, ...actions[(currentTurn - 2) / 2] } });
      }
      default: return cogniaScriptedResponse();
    }
  });
  const adapter = await createPrologueNodeAdapter({
    app: { appId: "io.molis.work.surface-original", appVersion: "1.0.0" }, storageRoot: root, reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only", surfaces: { driverFor: () => surface.kind === "browser" ? surface : null,
      ...(surface.kind === "desktop" ? { desktop: () => surface } : {}), siteDecisions: () => [] },
  });
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "project", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
  const session = await adapter.createSession({ ...owner, workspace: "business", role_id: "helper", title: "Original Surface" });
  const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: [] };
  const run = await adapter.start({ ...owner, session, workspace: "business", role_id: role.role_id, role, task: "Use the attached interface.", budget: { max_turns: Math.max(8, actions.length * 2 + 3) } });
  const pending = async (after?: string) => {
    for (let n = 0; n < 500; n++) {
      const item = queue.list(owner.project_id, "pending").find(review => review.review_id !== after);
      if (item) return item;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail("real Surface review missing");
  };
  const completed = async () => {
    for (let n = 0; n < 500; n++) {
      if ((await adapter.read(run.ref)).phase === "completed") return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail("the surface run did not settle");
  };
  return { adapter, run, queue, pending, completed };
}

for (const hasWindow of [true, false]) test(`APR-13: real desktop reviews allow a second app switch ${hasWindow ? "from the original window" : "after opening a windowless app"}`, { timeout: 30_000 }, async t => {
  const f = await desktop(t, false);
  if (!hasWindow) f.noFirstWindow();
  const apps = [f.original, f.other];
  const real = await realRun(t, f.surface, apps.map(app => ({ do: "app", app: app.bundle_id })));
  let previous: string | undefined;
  for (const app of apps) {
    const review = await real.pending(previous);
    assert.equal(review.document.kind, "tool-operation");
    assert.match(JSON.stringify(review.document), new RegExp(app.bundle_id, "u"));
    assert.equal(review.document.round_allow, undefined);
    assert.equal((await real.queue.decisions(review.review_id)).approve.available, true);
    await real.queue.respond({ review_id: review.review_id, version: review.reference.version, actor_id: "person", decision: "approve" });
    previous = review.review_id;
  }
  await real.completed();
  assert.deepEqual(f.frames.filter(frame => frame.op === "app.open").map(frame => frame.params), [
    { bundle_id: f.original.bundle_id, expected_window: null },
    { bundle_id: f.other.bundle_id, expected_window: hasWindow ? f.original.target : null },
  ]);
});

test("APR-13: a browser coordinate review displays the exact position without borrowing a live label", { timeout: 30_000 }, async t => {
  const f = await browser(t);
  const real = await realRun(t, f.surface, [{ do: "pointer", x: 24, y: 39, button: "right", clicks: 1 }]);
  const review = await real.pending();
  assert.equal(review.document.kind, "tool-operation");
  assert.ok(review.document.fields?.some(field => field.value === "右键点击页面上的位置（24, 39）"));
  assert.equal(f.frames.some(frame => typeof frame.params.expression === "string" && frame.params.expression.includes("elementFromPoint")), false);
  await real.queue.respond({ review_id: review.review_id, version: review.reference.version, actor_id: "person", decision: "reject" });
  assert.equal(f.frames.some(frame => frame.method === "Input.dispatchMouseEvent"), false);
});

for (const outcome of ["same", "changed", "truncated"] as const) test(`APR-11/13: a desktop round grant ${outcome === "changed" ? "refuses a replaced assessed control" : outcome === "truncated" ? "asks again for a truncated label" : "dispatches the assessed control"}`, { timeout: 30_000 }, async t => {
  const f = await desktop(t, false), entered = latch(), resume = latch();
  t.after(() => resume.release());
  let proof: HostSurfaceExpectedTarget["assessed_pointer"];
  const surface: HostSurfaceDriver = { ...f.surface, async perform(action, context, expected) {
    if (action.what === "pointer") { proof = expected.assessed_pointer; entered.release(); await resume.reached; }
    return f.surface.perform(action, context, expected);
  } };
  const real = await realRun(t, surface, [
    { do: "app", app: f.original.bundle_id }, textAction, { do: "pointer", node: "[1]" },
  ]);
  const app = await real.pending();
  await real.queue.respond({ review_id: app.review_id, version: app.reference.version, actor_id: "person", decision: "approve" });
  const text = await real.pending(app.review_id);
  assert.equal(text.document.kind, "tool-operation");
  assert.ok(text.document.round_allow);
  if (outcome === "truncated") f.truncateControl();
  await real.queue.respond({ review_id: text.review_id, version: text.reference.version, actor_id: "person", decision: "approve", remember: "app-this-round" });
  if (outcome === "truncated") {
    const click = await real.pending(text.review_id);
    assert.equal(click.document.kind, "tool-operation");
    assert.equal(click.document.round_allow, undefined);
    assert.match(JSON.stringify(click.document), /控件名称过长/u);
    await real.queue.respond({ review_id: click.review_id, version: click.reference.version, actor_id: "person", decision: "reject" });
    await real.completed();
    assert.equal(f.frames.some(frame => frame.op === "input.pointer"), false);
    return;
  }
  await entered.reached;
  assert.deepEqual(proof, { x: 30, y: 20, fingerprint: "save-fingerprint" });
  if (outcome === "changed") f.changeControl();
  resume.release();
  await real.completed();
  assert.deepEqual(f.frames.filter(frame => frame.op === "input.pointer").map(frame => frame.params.expected_control), outcome === "changed" ? [] : ["save-fingerprint"]);
});

test("APR-13: an original browser approval rejects a same-address replacement before writing a decision", { timeout: 30_000 }, async t => {
  const f = await browser(t);
  const real = await realRun(t, f.surface), review = await real.pending();
  assert.match(JSON.stringify(review.document), /original approved text/u);
  assert.equal((await real.queue.decisions(review.review_id)).approve.available, true);
  f.event("Page.frameNavigated", { frame: { id: "frame", loaderId: "replaced-before-approval", url: "https://original.example/" } });
  await setImmediate(); await setImmediate();
  const decision = { review_id: review.review_id, version: review.reference.version, actor_id: "person" };
  await assert.rejects(real.queue.respond({ ...decision, decision: "approve" }), /原观察的页面或窗口已变化/u);
  assert.equal(real.queue.receipt(review.review_id)?.status, "pending");
  assert.equal(real.queue.receipt(review.review_id)?.decided_at, null);
  assert.equal(f.frames.some(frame => frame.method === "Input.insertText"), false);
  assert.equal((await real.queue.respond({ ...decision, decision: "reject" })).status, "rejected");
});

test("APR-13: browser approval and its input do not wait for the temporary focus object release", { timeout: 30_000 }, async t => {
  const f = await browser(t), real = await realRun(t, f.surface), review = await real.pending();
  const release = f.holdNext("Runtime.releaseObject");
  const decision = real.queue.respond({ review_id: review.review_id, version: review.reference.version, actor_id: "person", decision: "approve" });
  await release.reached;
  const sent = f.holdNext("Input.insertText");
  try {
    assert.equal((await decision).status, "approved");
    await sent.reached;
    assert.equal(f.frames.filter(frame => frame.method === "Input.insertText").length, 1);
    sent.release();
  } finally { release.release(); }
  await real.completed();
});

for (const replacement of ["document", "same-label-focus"] as const) test(`APR-11: SDK dispatch and the Host binding retain the original ${replacement} proof for browser text`, { timeout: 30_000 }, async t => {
  const f = await browser(t), entered = latch(), resume = latch();
  let dispatchTarget: HostSurfaceExpectedTarget | undefined, observedTarget: HostSurfaceExpectedTarget | undefined;
  const observe = f.surface.observe.bind(f.surface), perform = f.surface.perform.bind(f.surface);
  t.after(() => resume.release());
  const surface: HostSurfaceDriver = {
    ...f.surface,
    observe(kind, control, expected) {
      observedTarget = expected;
      return observe(kind, control, expected);
    },
    async perform(action, control, expected) {
      dispatchTarget = expected;
      entered.release();
      await resume.reached;
      return perform(action, control, expected);
    },
  };
  const real = await realRun(t, surface), review = await real.pending();
  await real.queue.respond({ review_id: review.review_id, version: review.reference.version, actor_id: "person", decision: "approve" });
  await entered.reached;
  assert.equal(dispatchTarget?.identity, observedTarget?.identity);
  assert.equal(dispatchTarget?.scope, "https://original.example");
  assert.equal(Object.isFrozen(dispatchTarget), true);
  const baseline = f.frames.length;
  if (replacement === "same-label-focus") {
    assert.equal(dispatchTarget?.approved_focus, "7");
    f.replaceFocus();
  } else {
    f.event("Page.frameNavigated", { frame: { id: "frame", loaderId: "replaced-at-input", url: "https://original.example/" } });
  }
  await setImmediate(); await setImmediate();
  resume.release();
  for (let n = 0; n < 500; n++) {
    const view = await real.adapter.read(real.run.ref);
    if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) {
      assert.equal(f.frames.slice(baseline).some(frame => frame.method === "Input.insertText"), false);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("SDK did not settle the refused input");
});
