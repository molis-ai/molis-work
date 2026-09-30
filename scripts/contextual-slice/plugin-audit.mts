/**
 * Per-plugin audit for context-driven interaction (specs/contextual-interaction §2, §10 P2): in a running Molis Work
 * app, open every plugin surface the way a person would and record whether its content can be read and interacted with:
 * - frame: the surface renders in the workbench document or inside an iframe (selection must then cross frames);
 * - context: the surface root declares `data-assistant-context` (plugin, object, version) before / after opening an item;
 * - text: how much readable text is on screen; select: whether a real DOM selection of that text succeeds.
 *
 *   pnpm exec tsx scripts/contextual-slice/plugin-audit.mts --origin http://127.0.0.1:4297 [--out file.json]
 *
 * It creates the regenerable demo project through the same control-token request as the settings page button.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

const arg = (name: string) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
const origin = arg("--origin") ?? "http://127.0.0.1:4297";
const chromePath = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
if (!chromePath) throw new Error("需要 Chrome");

const profile = mkdtempSync(join(tmpdir(), "molis-plugin-audit-"));
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--window-size=1440,900", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"],
  { stdio: ["ignore", "ignore", "pipe"] });
const debuggerUrl = await new Promise<string>((resolve, reject) => {
  let stderr = "";
  const timer = setTimeout(() => reject(new Error("Chrome 调试口没有起来")), 10_000);
  chrome.stderr!.on("data", chunk => { stderr += String(chunk); const url = /DevTools listening on (ws:\/\/\S+)/.exec(stderr)?.[1]; if (url) { clearTimeout(timer); resolve(url); } });
});
const socket = new WebSocket(debuggerUrl);
await once(socket, "open");
let nextId = 0;
const pending = new Map<number, (value: { result?: unknown; error?: unknown }) => void>();
socket.on("message", raw => { const message = JSON.parse(String(raw)); pending.get(message.id)?.(message); pending.delete(message.id); });
const command = <T,>(method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<T>((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP 超时：${method}`)); }, 30_000);
  pending.set(id, message => { clearTimeout(timer); if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result as T); });
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const { targetId } = await command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
const { sessionId } = await command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
await command("Page.enable", {}, sessionId);
await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
// window.confirm on the demo button path is answered by the audit (it only creates the regenerable demo).
await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.confirm = () => true;" }, sessionId);
const evaluate = async <T,>(expression: string): Promise<T> => {
  const out = await command<{ result: { value: T }; exceptionDetails?: { exception?: { description?: string } } }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description ?? "页面脚本出错");
  return out.result.value;
};
const navigate = async (url: string) => { await command("Page.navigate", { url }, sessionId); await evaluate(`new Promise(r => { if (document.readyState === "complete") r(1); else addEventListener("load", () => r(1)); })`); await sleep(800); };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

try {
  await navigate(`${origin}/settings/appearance`);
  const projects = await evaluate<{ projects?: { project_id: string; data_class?: string }[] }>(`fetch("/api/projects").then(r => r.json()).catch(() => ({}))`);
  let demo = projects.projects?.find(project => project.data_class === "regenerable_demo")?.project_id;
  if (!demo) {
    const created = await evaluate<Record<string, unknown>>(`fetch("/api/settings/demo", { method: "POST", headers: molisWorkControlHeaders(), body: JSON.stringify({ action: "create", user_confirmed: true }) }).then(r => r.json())`);
    demo = String((created.project as { project_id?: string } | undefined)?.project_id ?? created.project_id ?? "");
    if (!demo) {
      const again = await evaluate<{ projects?: { project_id: string; data_class?: string }[] }>(`fetch("/api/projects").then(r => r.json())`);
      demo = again.projects?.find(project => project.data_class === "regenerable_demo")?.project_id;
    }
  }
  if (!demo) throw new Error("没有建成示例项目");
  await navigate(`${origin}/projects/${encodeURIComponent(demo)}/`);
  await sleep(1500);
  // Mode 2 (--targets file.json from the read audit): open each plugin's sample object the way search opens a hit,
  // then check the surface declares that object and its text can be selected.
  const targetsFile = arg("--targets");
  if (targetsFile) {
    const { readFileSync } = await import("node:fs");
    const targets = (JSON.parse(readFileSync(targetsFile, "utf8")) as { provider: string; scope: string; sample?: { title: string; kind: string } }[])
      .filter(item => item.scope === "project" && item.sample);
    const itemTabs = ["goals", "sessions", "inbox", "feed", "pages", "lingguang", "workflows", "coding", "shelf", "artifacts"];
    const opened: Record<string, unknown>[] = [];
    for (const target of targets) {
      const base = `${origin}/projects/${encodeURIComponent(demo)}/`;
      await navigate(base);
      const hit = await evaluate<{ hit?: { hit_id: string; plugin_id: string; subject: { kind: string; id: string } }; error?: string }>(`(async () => {
        const post = (path, body) => fetch(path, { method: "POST", headers: molisWorkControlHeaders(), body: JSON.stringify(body) }).then(r => r.json());
        const out = await post("/projects/${encodeURIComponent(demo)}/api/search/query", { query: ${JSON.stringify(target.sample!.title)}, limit: 20 });
        const hit = (out.hits || []).find(item => item.subject.kind === ${JSON.stringify(target.sample!.kind)});
        return hit ? { hit } : { error: "搜索不到：" + (out.error || (out.hits || []).map(h => h.subject.kind).join(",")) };
      })()`);
      if (!hit.hit) { opened.push({ provider: target.provider, kind: target.sample!.kind, error: hit.error }); console.log(`${target.sample!.kind.padEnd(18)} ${hit.error}`); continue; }
      const open = await evaluate<{ open?: { surface: string; id: string } }>(`fetch("/projects/${encodeURIComponent(demo)}/api/search/open", { method: "POST", headers: molisWorkControlHeaders(), body: JSON.stringify({ hit_id: ${JSON.stringify(hit.hit.hit_id)} }) }).then(r => r.json())`);
      const where = open.open;
      if (!where) { opened.push({ provider: target.provider, kind: target.sample!.kind, error: "没有打开目标" }); console.log(`${target.sample!.kind.padEnd(18)} 没有打开目标`); continue; }
      const url = new URL(base);
      url.searchParams.set("openPlugin", where.surface);
      if (itemTabs.includes(where.surface)) { url.searchParams.set("openItem", where.id); url.searchParams.set("openTitle", target.sample!.title); }
      else url.searchParams.set("openRecord", where.id);
      await navigate(url.toString());
      await sleep(2500);
      const probe = await evaluate<Record<string, unknown>>(String.raw`(() => {
        const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
        const surface = document.querySelector('[data-work-surface="${where.surface}"]:not([hidden])') || [...document.querySelectorAll("[data-work-surface]")].find(visible);
        const frames = [...document.querySelectorAll("iframe")].filter(visible);
        const docs = [document, ...frames.map(f => { try { return f.contentDocument; } catch { return null; } }).filter(Boolean)];
        const contexts = docs.flatMap(doc => [...doc.querySelectorAll("[data-assistant-context]")].filter(el => doc !== document || (surface && (surface.contains(el) || el.contains(surface)))).map(el => { try { return JSON.parse(el.getAttribute("data-assistant-context")); } catch { return { invalid: true }; } }));
        const object = contexts.map(item => item.object).find(Boolean) || null;
        const root = surface || document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent.trim().length >= 8 && node.parentElement && visible(node.parentElement) && !node.parentElement.closest("button, input, textarea, select, nav, header, [data-dock], .workbench-bar") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
        let node = walker.nextNode(), selected = "", userSelect = "", editable = false, inputs = 0;
        if (node) { const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, Math.min(12, node.textContent.length)); const s = getSelection(); s.removeAllRanges(); s.addRange(range); selected = s.toString(); s.removeAllRanges(); userSelect = getComputedStyle(node.parentElement).userSelect; editable = !!node.parentElement.closest('[contenteditable="true"], .ProseMirror'); }
        inputs = root.querySelectorAll('textarea, [contenteditable="true"]').length;
        return { surface: surface ? surface.getAttribute("data-work-surface") : null, frames: frames.length, declared: contexts.length, object, selected, userSelect, editable, text_inputs: inputs };
      })()`);
      const row = { provider: target.provider, kind: target.sample!.kind, open: where, ...probe };
      opened.push(row);
      const object = probe.object as { kind?: string; id?: string } | null;
      console.log(`${target.sample!.kind.padEnd(18)} surface=${String(probe.surface).padEnd(11)} 声明=${probe.declared ? (object ? `对象 ${object.kind}${object.id === where.id ? "（一致）" : `（id 不一致：${String(object.id).slice(0, 12)}）`}` : "只有页面") : "无"} 选中=${probe.selected ? "可" : "否"}${probe.editable ? " 编辑器" : ""} 文本框=${probe.text_inputs}`);
    }
    const out = arg("--out");
    if (out) writeFileSync(out, JSON.stringify({ origin, demo, audited_at: new Date().toISOString(), opened }, null, 2) + "\n");
    process.exitCode = 0;
    throw Object.assign(new Error("done"), { done: true });
  }
  const surfaces = await evaluate<{ surface: string; plugin: string; label: string }[]>(`[...document.querySelectorAll("[data-work-surface-open]")].map(node => ({ surface: node.dataset.workSurfaceOpen, plugin: node.dataset.pluginId || node.dataset.workSurfaceOpen, label: (node.getAttribute("aria-label") || node.textContent || "").trim().slice(0, 40) }))
    .filter((item, index, all) => all.findIndex(other => other.surface === item.surface) === index)`);
  const rows: Record<string, unknown>[] = [];
  for (const surface of surfaces) {
    await evaluate(`(async () => {
      const node = document.querySelector('[data-work-surface-open="${surface.surface}"]');
      const picker = node?.closest('[data-plugin-picker-popover]');
      if (picker && picker.hidden) document.querySelector('[data-plugin-picker-toggle]')?.click();
      await new Promise(r => setTimeout(r, 150));
      node?.click();
    })()`);
    await sleep(2200);
    const probe = String.raw`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const frames = [...document.querySelectorAll("iframe")].filter(visible);
      const stage = [...document.querySelectorAll("[data-plugin-stage], .immersive-plugin-stage, [data-work-surface], [data-tab-workspace] [data-pane]")].find(visible) || document.querySelector("main") || document.body;
      const docs = [{ doc: document, frame: false }, ...frames.map(frame => { try { return { doc: frame.contentDocument, frame: true, src: frame.getAttribute("src") || "" }; } catch { return null; } }).filter(Boolean)];
      const readContext = () => docs.flatMap(({ doc, frame }) => doc ? [...doc.querySelectorAll("[data-assistant-context]")].filter(el => frame || visible(el)).map(el => { try { const value = JSON.parse(el.getAttribute("data-assistant-context")); return { plugin_id: value.plugin_id, object: value.object ? { kind: value.object.kind, id: String(value.object.id).slice(0, 24), version: value.object.version ?? null } : null, starters: (value.starters || []).length, frame }; } catch { return { invalid: true, frame }; } }) : []);
      const textOf = doc => { const root = doc === document ? stage : doc.body; return root ? (root.innerText || "").replace(/\s+/g, " ").trim().length : 0; };
      const pickText = doc => { const root = doc === document ? stage : doc.body; if (!root) return null;
        const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent.trim().length >= 12 && node.parentElement && !node.parentElement.closest("button, input, textarea, select, nav, header, [data-dock], .workbench-bar") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
        const node = walker.nextNode(); return node; };
      const selectIn = doc => { const node = pickText(doc); if (!node) return { ok: false, reason: "没有可选的正文" };
        const style = getComputedStyle(node.parentElement); const range = doc.createRange(); range.setStart(node, 0); range.setEnd(node, Math.min(node.textContent.length, 20));
        const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        const text = selection.toString(); selection.removeAllRanges();
        return { ok: text.trim().length > 0 && style.userSelect !== "none", sample: text.slice(0, 20), userSelect: style.userSelect, editable: !!node.parentElement.closest("[contenteditable=true], .ProseMirror") }; };
      const before = readContext();
      const selection = docs.map(({ doc, frame }) => ({ frame, ...(doc ? selectIn(doc) : { ok: false }) }));
      // Open the first item the way a person would, when the surface is a list, and read the context again.
      let opened = null;
      for (const { doc } of docs) { if (!doc) continue;
        const root = doc === document ? stage : doc.body;
        const row = root && [...root.querySelectorAll("[data-pages-row], [data-feed-item], [data-inbox-entry], [data-row-open], [data-record-open], [data-open-item], .tree-row button, [role=listitem] button, [data-item-id], [data-note-id], [data-spark-id]")].find(visible);
        if (row) { opened = (row.innerText || row.getAttribute("aria-label") || "").trim().slice(0, 30); row.click(); break; } }
      if (opened !== null) await sleep(1500);
      const after = opened !== null ? readContext() : before;
      return { frames: frames.length, frameSources: frames.map(f => (f.getAttribute("src") || "").slice(0, 60)), text: docs.map(({ doc }) => doc ? textOf(doc) : 0), before, opened, after, selection };
    })()`;
    let result: unknown;
    try { result = await evaluate(probe); } catch (error) { result = { error: error instanceof Error ? error.message : String(error) }; }
    rows.push({ ...surface, ...(result as object) });
    const r = result as { frames?: number; before?: { object: unknown }[]; after?: { object: unknown; plugin_id: string }[]; selection?: { ok: boolean }[]; opened?: string | null; error?: string };
    console.log(`${surface.surface.padEnd(16)} frames=${r.frames ?? "?"} context(before)=${(r.before ?? []).length ? (r.before ?? []).map(c => (c as { object: unknown }).object ? "对象" : "页面").join("/") : "无"} context(after)=${(r.after ?? []).length ? (r.after ?? []).map(c => c.object ? "对象" : "页面").join("/") : "无"} select=${(r.selection ?? []).map(s => s.ok ? "可" : "否").join("/")} opened=${r.opened ?? "—"}${r.error ? "  ERR " + r.error : ""}`);
  }
  const out = arg("--out");
  if (out) writeFileSync(out, JSON.stringify({ origin, demo, audited_at: new Date().toISOString(), rows }, null, 2) + "\n");
} catch (error) {
  if (!(error as { done?: boolean }).done) throw error;
} finally {
  socket.close();
  chrome.kill("SIGTERM");
}
