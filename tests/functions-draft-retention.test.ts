import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WebSocket } from "ws";

import { MICRO_INTERACTION_CLIENT_SCRIPT } from "../packages/design-system/src/styles/micro-interactions.ts";
import { FUNCTIONS_CLIENT_FACTORY_SCRIPT } from "../apps/workbench/src/functions/client.ts";
import { renderFunctionsWorkbench } from "../apps/workbench/src/functions/ui.ts";

const primitives = {
  escape: (value: unknown) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;"),
  text: (value: string) => value,
};

function pageHtml(): string {
  const embed = (source: string) => source.replace(/<\/script/gi, "<\\/script");
  const workbench = renderFunctionsWorkbench({ primitives });
  return `<!doctype html><meta charset="utf-8"><body>${workbench}
<script>
${embed(MICRO_INTERACTION_CLIENT_SCRIPT)}
var records = {
  "fn-1": { id: "fn-1", name: "旧名称", function_key: "old_key", instructions: "旧说明", status: "draft", primitive: "choice", criteria: [{ key: "yes", description: "是" }, { key: "no", description: "否" }], updated_at: "t0", scene_id: null, subject_kinds: [], scene_map: {}, samples: [], last_preview: null },
  "fn-2": { id: "fn-2", name: "另一条", function_key: "other_key", instructions: "另一说明", status: "draft", primitive: "choice", criteria: [{ key: "yes", description: "是" }, { key: "no", description: "否" }], updated_at: "t0", scene_id: null, subject_kinds: [], scene_map: {}, samples: [], last_preview: null }
};
window.__posts = [];
window.__delay = null;
window.__handle = async (method, path, body) => {
  if (method === "GET" && path === "/api/functions/catalog") return { status: 200, body: { catalog: { subjects: [], destinations: [], behaviors: [] } } };
  if (method === "GET" && path === "/api/functions") return { status: 200, body: { functions: Object.values(records) } };
  const one = path.match(/^\\/api\\/functions\\/([^/]+)$/);
  if (method === "GET" && one && records[decodeURIComponent(one[1])]) return { status: 200, body: { function: records[decodeURIComponent(one[1])] } };
  if (method === "POST" && path === "/api/functions") {
    window.__posts.push({ path, body });
    const created = { id: "fn-created-" + window.__posts.length, name: body.primitive, function_key: body.primitive + window.__posts.length, instructions: "", status: "draft", primitive: body.primitive, criteria: body.primitive === "score" ? ["低", "高"] : body.primitive === "noul" ? { true_description: "", false_description: "" } : [{ key: "yes", description: "" }, { key: "no", description: "" }], updated_at: "t-created", scene_id: null, subject_kinds: [], scene_map: {}, samples: [], last_preview: null };
    records[created.id] = created;
    return { status: 200, body: { function: created } };
  }
  const preview = path.match(/^\\/api\\/functions\\/([^/]+)\\/preview$/);
  if (method === "POST" && preview) {
    const id = decodeURIComponent(preview[1]);
    window.__posts.push({ path, body });
    if (window.__previewDelay) await window.__previewDelay;
    const current = records[id];
    if (!current) return { status: 404, body: { error: "missing preview" } };
    current.last_preview = { input: body && body.input || "", outcome: "needs_review", primitive: current.primitive, probabilities: {}, model: "fixture" };
    return { status: 200, body: { function: current } };
  }
  if (method === "POST" && one && records[decodeURIComponent(one[1])]) {
    const id = decodeURIComponent(one[1]);
    window.__posts.push({ path, body });
    if (window.__delay) await window.__delay;
    const current = records[id];
    if (!String(body.name || "").trim()) return { status: 400, body: { error: "名称须为 1 到 80 个字", code: "functions.invalid" } };
    if (body.updated_at !== current.updated_at) return { status: 409, body: { error: "草稿已被更新，请刷新后再试", code: "functions.conflict" } };
    current.name = body.name;
    current.function_key = body.function_key;
    current.instructions = body.instructions;
    current.criteria = body.criteria;
    current.updated_at = "t-saved-" + window.__posts.length;
    return { status: 200, body: { function: current } };
  }
  return { status: 404, body: { error: "missing " + method + " " + path } };
};
window.fetch = async (url, init) => {
  const path = new URL(url, location.origin).pathname;
  const method = (init && init.method) || "GET";
  const body = init && init.body ? JSON.parse(init.body) : undefined;
  const result = await window.__handle(method, path, body);
  return new Response(JSON.stringify(result.body), { status: result.status, headers: { "content-type": "application/json" } });
};
try {
  (${embed(FUNCTIONS_CLIENT_FACTORY_SCRIPT)})({ translate: (value) => value, feedApi: null });
  window.__booted = true;
} catch (error) {
  window.__bootError = String(error && error.stack || error);
}
window.__read = () => ({
  name: document.querySelector("[data-functions-name]").value,
  key: document.querySelector("[data-functions-key]").value,
  instructions: document.querySelector("[data-functions-instructions]").value,
  note: document.querySelector("[data-functions-note]").textContent,
  noteHidden: document.querySelector("[data-functions-note]").hidden,
  posts: window.__posts.map((post) => post.body),
  revision: records["fn-1"] && records["fn-1"].updated_at,
  dialog: Boolean(document.querySelector("[data-functions-create-dialog]").open)
});
window.__type = (field, value) => {
  const input = document.querySelector(field === "instructions" ? "[data-functions-instructions]" : "[data-functions-name]");
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return input.value;
};
window.__conflict = () => {
  records["fn-1"].name = "别人改的";
  records["fn-1"].updated_at = "t-other";
  return records["fn-1"].updated_at;
};
window.__clickRow = (id) => {
  document.querySelector('[data-function-id="' + id + '"]').click();
  return document.querySelector("[data-functions-name]").value;
};
window.__armDelay = () => {
  window.__delay = new Promise((resolve) => { window.__releaseDelay = resolve; });
  return true;
};
window.__release = () => {
  const release = window.__releaseDelay;
  window.__releaseDelay = null;
  if (release) release();
  return true;
};
window.__openCreate = () => {
  const dialog = document.querySelector("[data-functions-create-dialog]");
  try { document.querySelector("[data-functions-new]").click(); } catch (error) {}
  if (!dialog.open) {
    try { dialog.showModal(); } catch (error) { dialog.setAttribute("open", ""); }
  }
  return Boolean(dialog.open);
};
window.__shortcut = (primitive) => {
  const button = document.querySelector('[data-functions-create-form] button[value="' + primitive + '"]');
  button.disabled = false;
  button.focus();
  button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true, cancelable: true }));
  return document.activeElement === button;
};
window.__shortcutDisabled = () => {
  const form = document.querySelector("[data-functions-create-form]");
  form.querySelectorAll('button[type="submit"]').forEach((button) => { button.disabled = true; });
  const noul = form.querySelector('button[value="noul"]');
  noul.disabled = false;
  noul.focus();
  noul.disabled = true;
  noul.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true, cancelable: true }));
  return true;
};
</script></body>`;
}

test("failed function saves keep the typed fields and shortcut submit uses the focused type", { timeout: 60_000 }, async (t) => {
  const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"]
    .find((path) => existsSync(path));
  if (!chrome) { t.skip("Chrome is required for the Functions draft retention check"); return; }
  const directory = await mkdtemp(join(tmpdir(), "molis-functions-draft-"));
  const html = pageHtml();
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}/`;
  let child: ChildProcess | undefined;
  let socket: WebSocket | undefined;
  t.after(async () => {
    socket?.close();
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill("SIGTERM");
      await closed;
    }
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${join(directory, "chrome")}`, "about:blank"],
  { stdio: ["ignore", "ignore", "pipe"] });
  const debuggerUrl = await new Promise<string>((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error("Chrome debugger did not start")), 8_000);
    child!.stderr!.on("data", (chunk) => {
      stderr += String(chunk);
      const url = stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];
      if (url) { clearTimeout(timer); resolve(url); }
    });
    child!.once("exit", () => { clearTimeout(timer); reject(new Error(stderr.slice(-500))); });
  });
  socket = new WebSocket(debuggerUrl);
  await once(socket, "open");
  let nextId = 0;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  socket.on("message", (raw) => {
    const response = JSON.parse(String(raw));
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.error) entry.reject(new Error(JSON.stringify(response.error)));
    else entry.resolve(response.result);
  });
  const command = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<any>((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("CDP timeout: " + method));
    }, 8_000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await command("Target.createTarget", { url: origin });
  const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
  const evaluate = async <T>(expression: string): Promise<T> => {
    const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value as T;
  };
  const waitFor = async (expression: string) => {
    const started = Date.now();
    while (Date.now() - started < 5_000) {
      if (await evaluate<boolean>(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error("timeout: " + expression + " boot=" + await evaluate("window.__bootError || ''"));
  };
  await waitFor("window.__booted === true && document.querySelector('[data-function-id=\"fn-1\"]')");
  assert.equal(await evaluate("window.__bootError || ''"), "");
  await evaluate("window.__clickRow('fn-1')");
  assert.equal(await evaluate("window.__type('name', '')"), "");
  await new Promise((resolve) => setTimeout(resolve, 700));
  const kept = await evaluate<any>("window.__read()");
  assert.equal(kept.name, "");
  assert.equal(kept.key, "old_key");
  assert.equal(kept.instructions, "旧说明");
  assert.match(kept.note, /名称/);
  assert.equal(kept.posts.at(-1).name, "");

  assert.equal(await evaluate("window.__type('name', '修好了')"), "修好了");
  await new Promise((resolve) => setTimeout(resolve, 700));
  const fixed = await evaluate<any>("window.__read()");
  assert.equal(fixed.name, "修好了");
  assert.equal(fixed.posts.at(-1).name, "修好了");
  assert.equal(fixed.noteHidden, true);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const read = () => evaluate<any>("window.__read()");
  await evaluate("(() => { window.__previewDelay = new Promise((resolve) => { window.__releasePreview = resolve; }); return true; })()");
  await evaluate("(() => { const input = document.querySelector('[data-functions-preview-input]'); input.value = '一段不计费的试跑'; return input.value; })()");
  await evaluate(`(() => {
    const button = document.querySelector('[data-functions-preview]');
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`);
  await sleep(400);
  const duringPreview = await read();
  assert.equal(duringPreview.posts.filter((post) => post.input === "一段不计费的试跑").length, 1);
  assert.equal(await evaluate("document.querySelector('[data-functions-preview]').disabled"), true);
  await evaluate("window.__releasePreview()");
  await sleep(500);
  const previewed = await read();
  assert.equal(previewed.posts.filter((post) => post.input === "一段不计费的试跑").length, 1);
  assert.equal(await evaluate("document.querySelector('[data-functions-preview]').disabled"), false);

  const revision = previewed.revision;
  await evaluate("window.__conflict()");
  await evaluate("window.__type('name', '我的新名称')");
  await sleep(700);
  const conflicted = await read();
  assert.equal(conflicted.name, "我的新名称");
  assert.equal(conflicted.instructions, "旧说明");
  assert.match(conflicted.note, /草稿已被更新/);
  assert.equal(conflicted.posts.at(-1).updated_at, revision);
  await evaluate("window.__type('instructions', '我还留着的说明')");
  await sleep(700);
  const stillLocal = await read();
  assert.equal(stillLocal.name, "我的新名称");
  assert.equal(stillLocal.instructions, "我还留着的说明");
  assert.equal(stillLocal.posts.at(-1).updated_at, revision);
  assert.equal(stillLocal.posts.at(-1).instructions, "我还留着的说明");

  // Navigation must retain a conflicting draft until the user resolves it.
  await evaluate("window.__clickRow('fn-2')");
  await sleep(400);
  assert.equal((await read()).name, "我的新名称");
  assert.match((await read()).note, /草稿已被更新/);

  // Start the independent in-flight-save scenario with fresh fixture data.
  await command("Page.reload", {}, sessionId);
  await waitFor("window.__booted === true && window.__posts.length === 0 && document.querySelector('[data-function-id=\"fn-1\"]')");
  const beforeRace = (await read()).posts.length;
  await evaluate("window.__armDelay()");
  await evaluate("window.__clickRow('fn-1')");
  await evaluate("window.__type('name', 'A草稿')");
  await sleep(700);
  const racing = await read();
  assert.ok(racing.posts.length > beforeRace);
  assert.equal(await evaluate("window.__clickRow('fn-2')"), "A草稿");
  await evaluate("window.__release()");
  await sleep(400);
  const switched = await read();
  assert.equal(switched.name, "另一条");
  assert.equal(switched.instructions, "另一说明");

  for (const primitive of ["noul", "score", "choice"] as const) {
    assert.equal(await evaluate("window.__openCreate()"), true);
    const before = (await read()).posts.length;
    await evaluate(`window.__shortcut(${JSON.stringify(primitive)})`);
    await sleep(500);
    const created = await read();
    assert.equal(created.posts.at(-1).primitive, primitive);
    assert.ok(created.posts.length > before);
  }
  assert.equal(await evaluate("window.__openCreate()"), true);
  const blocked = (await read()).posts.length;
  await evaluate("window.__shortcutDisabled()");
  await sleep(250);
  assert.equal((await read()).posts.length, blocked);
});
