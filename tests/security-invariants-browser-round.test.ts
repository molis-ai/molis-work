import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createBrowserSurfaceDriver } from "@molis-ai/molis-work-app-local-host";
import { isHostSurfaceRefusal, type HostSurfaceContext } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { browserTransport, focusResponse } from "./fixtures/surface-transport.js";
import { observeSurface, performSurface, surfaceTarget } from "./fixtures/surface-target.js";

function context() {
  let current = true;
  const denial = new Error("original round revoked");
  const control: HostSurfaceContext = { session_id: "same-session", beforeEffect() { control.assertCurrent(); }, assertCurrent() { if (!current) throw denial; } };
  return { control, denial, revoke() { current = false; } };
}

async function fixture(t: TestContext, blocked: (origin: string) => boolean = () => false) {
  const f = await browserTransport(t);
  let serial = 0;
  f.respondWith(frame => {
    if (frame.method === "Page.getFrameTree") return { frameTree: { frame: { id: "original-frame" } } };
    if (frame.method === "Page.createIsolatedWorld") return { executionContextId: 12 };
    if (frame.method === "Runtime.evaluate" && frame.params.serializationOptions) return focusResponse({ objectId: `object-${++serial}` });
    if (frame.method === "Page.getNavigationHistory") return { currentIndex: -1, entries: [] };
    if (frame.method === "Runtime.evaluate") {
      if (frame.params.returnByValue === false) return { result: { objectId: `object-${++serial}` } };
      const expression = String(frame.params.expression);
      if (expression.includes("document.elementFromPoint")) return { result: { value: "Original button" } };
      if (expression.includes("const selected")) return { result: { value: JSON.stringify({ title: "Original page", selection: false, text: "Original content" }) } };
      return {};
    }
    if (frame.method === "Runtime.callFunctionOn") return frame.params.arguments
      ? { result: { value: { x: 12, y: 24, label: "Original button" } } }
      : { result: { value: { path: "/", title: "Original page", vw: 1024, vh: 720, sy: 0, max: 0,
        elements: [{ role: "button", name: "Original button", value: "", states: [], x: 12, y: 24, href: "" }], text: ["Original content"] } } };
    if (frame.method === "Page.captureScreenshot") return { data: Buffer.from("masked screenshot").toString("base64") };
    return undefined;
  });
  await f.page.ensure();
  f.page.targetInfo({ targetId: (await f.page.session()).targetId, title: "Original page", url: "https://original.example/" });
  const surface = createBrowserSurfaceDriver(f.page, blocked); t.after(() => surface.close());
  return { ...f, surface, inputs: () => f.frames.filter(frame => frame.method.startsWith("Input.") || frame.method === "Page.navigate" || frame.method === "DOM.setFileInputFiles") };
}

const partial = (error: unknown) => isHostSurfaceRefusal(error) && error.partial === true;
const tokenOf = (bytes: Uint8Array) => { const match = /node=(node_\w+)/u.exec(new TextDecoder().decode(bytes)); assert.ok(match); return match[1]!; };

test("APR-11: browser startup cannot lend a revoked original round to a later page", { timeout: 15_000 }, async t => {
  const f = await browserTransport(t), original = context(), barrier = f.holdNext("Target.attachToTarget");
  const surface = createBrowserSurfaceDriver(f.page); t.after(() => surface.close());
  const rejected = assert.rejects(observeSurface(surface, "dom", original.control), error => error === original.denial);
  await barrier.reached; original.revoke(); barrier.release(); await rejected;
  assert.equal(f.frames.filter(frame => frame.method === "Runtime.evaluate" || frame.method.startsWith("Input.")).length, 0);
  assert.equal(f.page.snapshot().control.mode, "person");
});

test("APR-11: the CDP send fence runs after serialization and refuses an asynchronous guard", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), session = await f.page.session();
  await assert.rejects(session.send("Input.insertText", { toJSON() { original.revoke(); return { text: "must not send" }; } }, original.control.assertCurrent), error => error === original.denial);
  await assert.rejects(session.send("Input.insertText", { text: "must not send" }, async () => {}), { code: "actions.async_required" });
  assert.deepEqual(f.inputs(), []);
});

test("APR-11: a delayed old node release leaves the new same-session round's nodes and activity intact", { timeout: 15_000 }, async t => {
  const f = await fixture(t), old = context(), next = context();
  const oldToken = tokenOf(await observeSurface(f.surface, "accessibility-tree", old.control));
  await assert.rejects(f.surface.identity(next.control), /另一个轮次/u);
  const barrier = f.holdNext("Runtime.releaseObjectGroup"), released = f.surface.release!(old.control);
  await barrier.reached;
  const newToken = tokenOf(await observeSurface(f.surface, "accessibility-tree", next.control));
  assert.notEqual(oldToken, newToken); barrier.release(); await released;
  assert.equal(f.page.snapshot().control.mode, "assistant");
  assert.equal(await surfaceTarget(f.surface, next.control).then(expected => f.surface.describeNode!(newToken, next.control, expected)), "Original button");
  await assert.rejects(surfaceTarget(f.surface, old.control).then(expected => f.surface.describeNode!(oldToken, old.control, expected)), /已释放/u);
  await f.surface.release!(old.control);
  assert.equal(await surfaceTarget(f.surface, next.control).then(expected => f.surface.describeNode!(newToken, next.control, expected)), "Original button");
});

test("APR-11: an old screenshot removes only its own mask and cannot authorize bytes after release", { timeout: 15_000 }, async t => {
  const f = await fixture(t), old = context(), next = context();
  const capture = f.holdNext("Page.captureScreenshot");
  const rejected = assert.rejects(observeSurface(f.surface, "screenshot", old.control), /已释放/u);
  await capture.reached; await f.surface.release!(old.control);
  const later = f.holdNext("Page.captureScreenshot"), shown = observeSurface(f.surface, "screenshot", next.control);
  await later.reached;
  const masks = f.frames.filter(frame => frame.method === "Runtime.evaluate" && String(frame.params.expression).includes("s.id ="))
    .map(frame => /s.id = '([^']+)'/u.exec(String(frame.params.expression))?.[1]);
  assert.equal(masks.length, 2); assert.notEqual(masks[0], masks[1]);
  capture.release({ data: Buffer.from("old screenshot").toString("base64") }); await rejected;
  const removed = f.frames.filter(frame => String(frame.params.expression).includes("?.remove()"));
  assert.equal(removed.length, 1); assert.ok(String(removed[0]!.params.expression).includes(masks[0]!));
  assert.equal(f.surface.masked(new TextEncoder().encode("old screenshot")), false);
  later.release({ data: Buffer.from("new screenshot").toString("base64") });
  const bytes = await shown; assert.equal(f.surface.masked(bytes), true);
});

test("APR-13: unreadable or sensitive browser focus never silently becomes a safe empty field", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context();
  const barrier = f.holdNext("Runtime.evaluate");
  const read = assert.rejects(surfaceTarget(f.surface, original.control).then(expected => f.surface.focusedField!(original.control, expected)), /无法读取/u);
  await barrier.reached; barrier.release({ exceptionDetails: { text: "denied" } }); await read;
  const sensitive = f.holdNext("Runtime.evaluate", frame => Boolean(frame.params.serializationOptions)), focused = surfaceTarget(f.surface, original.control).then(expected => f.surface.focusedField!(original.control, expected));
  await sensitive.reached; sensitive.release(focusResponse({ sensitive: true }));
  assert.deepEqual(await focused, { label: "Original field", sensitive: true, focus: "7" }); assert.deepEqual(f.inputs(), []);
  const closedShadow = f.holdNext("Runtime.evaluate", frame => Boolean(frame.params.serializationOptions));
  const hidden = assert.rejects(surfaceTarget(f.surface, original.control).then(expected => f.surface.focusedField!(original.control, expected)), /无法核对/u);
  await closedShadow.reached; closedShadow.release(focusResponse({ hidden: true })); await hidden;
});

test("APR-11: authority lost during original node resolution sends no point or fallback input", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), node = tokenOf(await observeSurface(f.surface, "accessibility-tree", original.control));
  const barrier = f.holdNext("Runtime.evaluate", frame => frame.params.expression === "document");
  const rejected = assert.rejects(performSurface(f.surface, { what: "pointer", node, x: 999, y: 999, button: "left", clicks: 1 }, original.control), error => error === original.denial);
  await barrier.reached; original.revoke(); barrier.release({ result: { objectId: "original-document" } }); await rejected;
  assert.deepEqual(f.inputs(), []);
  assert.ok(f.frames.some(frame => frame.method === "Runtime.releaseObject" && frame.params.objectId === "original-document"));
});

test("APR-11: revocation after a mouse press releases only its original session without clicking a new popup", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), barrier = f.holdNext("Input.dispatchMouseEvent", frame => frame.params.type === "mousePressed");
  const rejected = assert.rejects(performSurface(f.surface, { what: "pointer", x: 12, y: 24, button: "left", clicks: 2 }, original.control), partial);
  await barrier.reached; original.revoke(); await f.page.adoptPopup("new-popup"); barrier.release(); await rejected;
  const inputs = f.inputs();
  assert.deepEqual(inputs.map(frame => frame.params.type), ["mouseMoved", "mousePressed", "mouseReleased"]);
  assert.equal(inputs[2]!.sessionId, inputs[1]!.sessionId);
  assert.deepEqual(inputs[2]!.params, { type: "mouseReleased", x: -1, y: -1, button: "left", buttons: 0, clickCount: 0 });
});

test("APR-11: a lost key-down response still releases that original key without text or editing commands", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), barrier = f.holdNext("Input.dispatchKeyEvent", frame => frame.params.type !== "keyUp");
  const setTimer = globalThis.setTimeout;
  t.mock.method(globalThis, "setTimeout", (...args: Parameters<typeof setTimer>) => setTimer(args[0], args[1] === 30_000 ? 200 : args[1], ...args.slice(2)));
  const rejected = assert.rejects(performSurface(f.surface, { what: "key", keys: ["Control", "a"] }, original.control), partial);
  await barrier.reached; original.revoke(); await rejected;
  const inputs = f.inputs();
  assert.equal(inputs.length, 2); assert.equal(inputs[1]!.params.type, "keyUp");
  assert.equal(inputs[1]!.sessionId, inputs[0]!.sessionId);
  assert.equal(inputs[1]!.params.modifiers, 0);
  assert.equal(Object.hasOwn(inputs[1]!.params, "text"), false); assert.equal(Object.hasOwn(inputs[1]!.params, "commands"), false);
  barrier.release();
});

test("APR-11: a popup appearing during a text field read cannot receive the old input", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), barrier = f.holdNext("Runtime.evaluate");
  const rejected = assert.rejects(performSurface(f.surface, { what: "text", text: "original-only" }, original.control), /原页面/u);
  await barrier.reached; await f.page.adoptPopup("later-popup");
  barrier.release({ result: { value: JSON.stringify({ label: "Old field", sensitive: false }) } }); await rejected;
  assert.deepEqual(f.inputs(), []);
});

test("APR-11: a successful original browser round observes, types, selects files and releases", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context();
  assert.match(new TextDecoder().decode(await observeSurface(f.surface, "dom", original.control)), /Original content/u);
  await performSurface(f.surface, { what: "text", text: "complete input" }, original.control);
  f.chooser(); for (let n = 0; !f.page.snapshot().file_chooser && n < 1000; n++) await setImmediate();
  assert.ok(f.page.snapshot().file_chooser);
  await performSurface(f.surface, { what: "upload", from: ["private", "original.txt"] }, original.control);
  assert.deepEqual(f.inputs().map(frame => [frame.method, frame.params]), [
    ["Input.insertText", { text: "complete input" }], ["DOM.setFileInputFiles", { files: ["/private/original.txt"], backendNodeId: 9 }],
  ]);
  await f.surface.release!(original.control); assert.equal(f.page.snapshot().control.mode, "person");
  await assert.rejects(performSurface(f.surface, { what: "key", keys: ["Enter"] }, original.control), /已释放/u);
});

test("APR-13: browser text, printable keys and paste refuse a sensitive focus at actual dispatch", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context();
  for (const action of [{ what: "text", text: "secret" }, { what: "key", keys: ["a"] }, { what: "key", keys: ["Control", "v"] }] as const) {
    const barrier = f.holdNext("Runtime.evaluate", frame => Boolean(frame.params.serializationOptions)), rejected = assert.rejects(performSurface(f.surface, action, original.control), /密码类/u);
    await barrier.reached; barrier.release(focusResponse({ sensitive: true })); await rejected;
  }
  assert.deepEqual(f.inputs(), []);
  const absent = f.holdNext("Runtime.evaluate"), rejected = assert.rejects(performSurface(f.surface, { what: "text", text: "secret" }, original.control), /无法核对/u);
  await absent.reached; absent.release({ result: { value: "null" } }); await rejected; assert.deepEqual(f.inputs(), []);
});

test("APR-11: a same-URL document replacement invalidates an original field and identity", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), identity = await f.surface.identity(original.control);
  const barrier = f.holdNext("Runtime.evaluate"), rejected = assert.rejects(performSurface(f.surface, { what: "text", text: "old document only" }, original.control), /文档/u);
  await barrier.reached;
  const before = f.page.documentGeneration, target = (await f.page.session()).targetId;
  f.event("Page.frameNavigated", { frame: { id: target, url: "https://original.example/" } });
  for (let n = 0; f.page.documentGeneration === before && n < 1000; n++) await setImmediate();
  assert.ok(f.page.documentGeneration > before);
  barrier.release({ result: { value: JSON.stringify({ label: "Old field", sensitive: false }) } }); await rejected;
  assert.deepEqual(f.inputs(), []); assert.notEqual(await f.surface.identity(original.control), identity);
});

test("APR-11: explicit blocked destinations send no navigation and a known navigation rejection keeps its receipt", { timeout: 15_000 }, async t => {
  const f = await fixture(t, origin => origin === "https://blocked.example"), original = context();
  await assert.rejects(performSurface(f.surface, { what: "navigate", url: "https://blocked.example/" }, original.control), /禁止/u);
  assert.deepEqual(f.inputs(), []);
  const barrier = f.holdNext("Page.navigate");
  const rejected = assert.rejects(performSurface(f.surface, { what: "navigate", url: "https://allowed.example/" }, original.control), error => error instanceof Error && error.message === "net::ERR_NAME_NOT_RESOLVED" && !partial(error));
  await barrier.reached; barrier.release({ errorText: "net::ERR_NAME_NOT_RESOLVED" }); await rejected;
  assert.equal(f.page.snapshot().loading, false); assert.ok(f.page.snapshot().problem);
  assert.equal(f.inputs().filter(frame => frame.method === "Page.navigate").length, 1);
});

test("APR-11: a new round cannot press its key until the old round's key-up cleanup has drained", { timeout: 15_000 }, async t => {
  const f = await fixture(t), old = context(), next = context(), barrier = f.holdNext("Input.dispatchKeyEvent", frame => frame.params.type !== "keyUp");
  const rejected = assert.rejects(performSurface(f.surface, { what: "key", keys: ["Control", "a"] }, old.control), partial);
  await barrier.reached;
  const released = f.surface.release!(old.control), later = performSurface(f.surface, { what: "key", keys: ["Control", "a"] }, next.control);
  await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(f.inputs().length, 1);
  barrier.release(); await rejected; await released; await later;
  assert.deepEqual(f.inputs().map(frame => [frame.params.type, frame.params.modifiers]), [["rawKeyDown", 2], ["keyUp", 0], ["rawKeyDown", 2], ["keyUp", 2]]);
});


test("APR-11: a same-address document replacement during node resolution refuses before any input", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), node = tokenOf(await observeSurface(f.surface, "accessibility-tree", original.control));
  const barrier = f.holdNext("Runtime.evaluate", frame => frame.params.expression === "document");
  const rejected = assert.rejects(performSurface(f.surface, { what: "pointer", node, x: 999, y: 999, button: "left", clicks: 1 }, original.control), /原页面文档/u);
  await barrier.reached;
  f.event("Page.frameNavigated", { frame: { id: "replacement-document", url: "https://original.example/" } });
  await setImmediate(); await setImmediate(); barrier.release({ result: { objectId: "original-document" } }); await rejected;
  assert.deepEqual(f.inputs(), []);
});


test("APR-11: an unconfirmed popup cannot borrow the old origin and its late reply cannot overwrite the restored page", { timeout: 15_000 }, async t => {
  const f = await fixture(t, origin => origin === "https://blocked.example"), original = context();
  const before = await f.surface.identity(original.control), pending = f.holdNext("Target.getTargetInfo");
  const popup = f.page.adoptPopup("popup-one"); await pending.reached;
  const reads = f.frames.filter(frame => frame.method === "Runtime.evaluate").length;
  await assert.rejects(observeSurface(f.surface, "dom", original.control), /原页面文档/u);
  await assert.rejects(f.surface.scope(original.control), /来源尚未确认/u);
  assert.equal(f.frames.filter(frame => frame.method === "Runtime.evaluate").length, reads);
  const restore = f.holdNext("Target.getTargetInfo"); f.page.targetGone("popup-one", false); await restore.reached;
  restore.release({ targetInfo: { url: "https://original.example/", title: "Original page" } });
  await setImmediate(); await setImmediate();
  pending.release({ targetInfo: { url: "https://blocked.example/", title: "Late blocked popup" } }); await popup;
  assert.equal(f.page.snapshot().origin, "https://original.example");
  assert.notEqual(await f.surface.identity(original.control), before);
  const blocked = f.holdNext("Target.getTargetInfo"), another = f.page.adoptPopup("popup-two"); await blocked.reached;
  blocked.release({ targetInfo: { url: "https://blocked.example/", title: "Blocked popup" } }); await another;
  await assert.rejects(observeSurface(f.surface, "dom", original.control), /禁止/u);
  assert.equal(f.frames.filter(frame => frame.method === "Runtime.evaluate").length, reads); assert.deepEqual(f.inputs(), []);
});

test("APR-11: a known navigation refusal stays known when authority is lost with its response", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), barrier = f.holdNext("Page.navigate");
  const rejected = assert.rejects(performSurface(f.surface, { what: "navigate", url: "https://original.example/missing" }, original.control), error =>
    error instanceof Error && error.message === "net::ERR_BLOCKED_BY_CLIENT" && !isHostSurfaceRefusal(error));
  await barrier.reached; const saved = f.page.snapshot(); original.revoke();
  barrier.release({ errorText: "net::ERR_BLOCKED_BY_CLIENT" }); await rejected;
  assert.deepEqual(f.page.snapshot(), saved);
});


test("APR-11: agent session acquisition never restores a forbidden retained address before its target fence", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(); await f.page.navigate("https://original.example/"); await f.host.restart();
  const before = f.inputs().length;
  await assert.rejects(observeSurface(f.surface, "dom", original.control), /原页面文档/u);
  assert.equal(f.inputs().length, before);
  await f.page.ensure();
  assert.equal(f.inputs().length, before + 1); assert.equal(f.inputs().at(-1)?.params.url, "https://original.example/");
});

test("APR-11: opaque internal popup sources are not treated as an approved blank page", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context();
  for (const url of ["data:text/html,private", "file:///private/example.html", "about:srcdoc"]) {
    const session = await f.page.session(); f.page.targetInfo({ targetId: session.targetId, url, title: "Opaque" });
    await assert.rejects(observeSurface(f.surface, "screenshot", original.control), /来源/u);
  }
  assert.equal(f.frames.some(frame => frame.method === "Page.captureScreenshot"), false);
});


test("APR-11: an isolated focus object received after revocation is released only on its original session", { timeout: 15_000 }, async t => {
  const f = await fixture(t), original = context(), barrier = f.holdNext("Runtime.evaluate");
  const rejected = assert.rejects(surfaceTarget(f.surface, original.control).then(expected => f.surface.focusedField!(original.control, expected)), error => error === original.denial);
  await barrier.reached; original.revoke(); barrier.release({ result: { objectId: "late-isolated-focus" } }); await rejected;
  for (let n = 0; !f.frames.some(frame => frame.method === "Runtime.releaseObject") && n < 200; n++) await setImmediate();
  assert.equal(f.frames.filter(frame => frame.method === "Runtime.releaseObject" && frame.params.objectId === "late-isolated-focus").length, 1);
  assert.equal(f.frames.some(frame => frame.method === "DOM.describeNode"), false); assert.deepEqual(f.inputs(), []);
});


test("APR-11: an explicit destination never consumes a retained address even after Chrome confirms the replacement blank page", { timeout: 15_000 }, async t => {
  const f = await fixture(t, origin => origin === "https://previous.example"), original = context();
  await f.page.navigate("https://previous.example/"); await f.host.restart();
  await assert.rejects(f.page.session(), /原页面文档/u);
  const id = String(f.frames.filter(frame => frame.method === "Target.attachToTarget").at(-1)!.params.targetId);
  f.page.targetInfo({ targetId: id, url: "about:blank", title: "" });
  const before = f.inputs().length;
  await performSurface(f.surface, { what: "navigate", url: "https://permitted.example/" }, original.control);
  assert.deepEqual(f.inputs().slice(before).map(frame => frame.params.url), ["https://permitted.example/"]);
});

test("F-host-subsystems-w2-07 auto-attached popup enables Fetch interception before resuming debugger and closes unowned popups", { timeout: 15_000 }, async t => {
  const f = await fixture(t);
  t.mock.method(f.host, "forbiddenOrigins", () => ["http://127.0.0.1:4173"]);
  const mainTargetId = (await f.page.session()).targetId;
  assert.ok(f.frames.some(frame => frame.method === "Target.setAutoAttach" && frame.params.waitForDebuggerOnStart === true),
    "browser attaches Target.setAutoAttach with waitForDebuggerOnStart");

  const startIndex = f.frames.length;
  f.event("Target.attachedToTarget", {
    sessionId: "session-owned-popup",
    waitingForDebugger: true,
    targetInfo: { targetId: "owned-popup", type: "page", url: "https://popup.example/", openerId: mainTargetId },
  }, "");
  for (let n = 0; !f.frames.slice(startIndex).some(frame => frame.method === "Runtime.runIfWaitingForDebugger" && frame.sessionId === "session-owned-popup") && n < 200; n++) {
    await setImmediate();
  }
  const popupFrames = f.frames.slice(startIndex).filter(frame => frame.sessionId === "session-owned-popup");
  const fetchIndex = popupFrames.findIndex(frame => frame.method === "Fetch.enable");
  const resumeIndex = popupFrames.findIndex(frame => frame.method === "Runtime.runIfWaitingForDebugger");
  assert.ok(fetchIndex >= 0, "Fetch.enable is installed on auto-attached popup session");
  assert.ok(resumeIndex > fetchIndex, "Fetch.enable runs before Runtime.runIfWaitingForDebugger");

  const foreignIndex = f.frames.length;
  f.event("Target.attachedToTarget", {
    sessionId: "session-foreign-popup",
    waitingForDebugger: true,
    targetInfo: { targetId: "foreign-popup", type: "page", url: "https://evil.example/", openerId: "unknown-opener" },
  }, "");
  for (let n = 0; !f.frames.slice(foreignIndex).some(frame => frame.method === "Target.closeTarget" && frame.params.targetId === "foreign-popup") && n < 200; n++) {
    await setImmediate();
  }
  assert.ok(
    f.frames.slice(foreignIndex).some(frame => frame.method === "Target.closeTarget" && frame.params.targetId === "foreign-popup"),
    "unowned auto-attached popup is closed via Target.closeTarget",
  );
});
