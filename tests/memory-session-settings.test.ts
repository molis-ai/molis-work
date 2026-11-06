import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { createLocalHostWorkbenchRenderer, type buildMolisWorkWebView } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
import type { MolisWorkSettingsView } from "@molis-ai/molis-work-app-workbench";

const renderer = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);
const settings = (section: string): MolisWorkSettingsView => ({ section, runtimes: [], projects: [],
  web_service: { provider: "unsupported", state: "unsupported", supported: false, owned: false, running: false,
    label: "", plist_path: "", command: [], stdout_log: "", stderr_log: "", message: "" },
  diagnostics: { home_directory: "/tmp", installation_state: "ready", version: null, release_directory: null, project_count: 0, launchers: [] },
});
const project = { project_id: "project/a", display_name: "Session 路由检查" };
const view: ReturnType<typeof buildMolisWorkWebView> = {
  snapshot: { board: { project_id: project.project_id, active_goal_id: null, created_at: "2026-11-05T00:00:00Z", updated_at: "2026-11-05T00:00:00Z" },
    cursor: 0, goals: [], relations: [], goal_tree_proposals: [], planning_method_packs: [], project_guidance: [] },
  project, projects: [project], route_prefix: "/projects/" + encodeURIComponent(project.project_id), demo: false,
  active_goal_id: null, goals: [], archived_goals: [], trashed_goals: [],
  counts: { waiting_for_human: 0, executing: 0, execution_blocked: 0, execution_pending: 0, satisfied: 0, invalidated: 0, trashed: 0, archived: 0 },
  input_bindings: [], policy_bindings: [], events: [],
};

// Actual public renderer, browser DOM, binder and request helper; HTTP stays pending at the first read.
// This is routing engineering evidence, not Host/SDK authority or a product journey.
async function browserOpening(t: TestContext) {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the public Memory renderer routing checks");
  const directory = await mkdtemp(join(tmpdir(), "memory-session-settings-public-"));
  const personalHtml = renderer.renderMolisWorkSettings(settings("memory"));
  const carrierHtml = renderer.renderMolisWorkSettings(settings("appearance"));
  const projectHtml = renderer.renderMolisWorkProjectSettingsHub(view,
    { entries: [], inactive_entries: [], revisions: [], virtual_document: "", runtime_prompt_prefix: "" }, [], "", false, "memory");
  let requested: string[] = [], firstRead = Promise.withResolvers<void>();
  const server = createServer((request, response) => {
    const url = new URL(request.url!, "http://local");
    if (url.pathname.includes("/api/memory/")) { requested.push(url.pathname + url.search); firstRead.resolve(); return; }
    if (url.pathname.endsWith(".css")) { response.setHeader("content-type", "text/css"); response.end(renderer.renderMolisWorkSettingsStylesheet()); return; }
    if (url.pathname.endsWith(".js")) { response.setHeader("content-type", "application/javascript"); response.end(); return; }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(url.pathname === "/embedded" ? carrierHtml : url.pathname === "/project-fragment" ? projectHtml : personalHtml);
  });
  let browser: ChromeHarness | undefined;
  t.after(async () => { await browser?.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await ChromeHarness.start(directory, { executable, extraArgs: ["--use-mock-keychain", "--password-store=basic"] });
  const page = await browser.page();
  return {
    async opening(search: string, embedded = false) {
      requested = []; firstRead = Promise.withResolvers<void>();
      await page.command("Page.navigate", { url: origin + (embedded ? "/embedded?memory_session_kind=forged" : "/" + search) });
      await page.wait("document.readyState === 'complete' && typeof globalThis.molisWorkBindMemorySettings === 'function'");
      if (embedded) await page.evaluate(`(async () => {
        const html=await (await fetch('/project-fragment')).text(), doc=new DOMParser().parseFromString(html,'text/html');
        const root=document.adoptNode(doc.querySelector('[data-memory-settings]'));document.querySelector('.settings-content').replaceChildren(root);
        globalThis.molisWorkBindMemorySettings(root,{search:${JSON.stringify(search)}});
      })()`);
      await page.wait("document.querySelector('[data-memory-settings]')?.dataset.memoryBound === '1'");
      return {
        requested,
        async pendingRead() {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try { await Promise.race([firstRead.promise, new Promise<void>((_, reject) => { timer=setTimeout(() => reject(new Error('The first pending Memory HTTP read was not received')),14_000); })]); }
          finally { clearTimeout(timer); }
        },
        async error() {
          await page.wait("!document.querySelector('[data-memory-error]').hidden");
          return page.evaluate<{hidden:boolean;textContent:string}>("({hidden:document.querySelector('[data-memory-error]').hidden,textContent:document.querySelector('[data-memory-error]').textContent})");
        },
      };
    },
  };
}

test("A4-M the first Memory request uses the complete protected business selection, including embedded settings", async t => {
  const browser = await browserOpening(t);
  const personal = await browser.opening("?memory_session_kind=assistant&memory_session_id=work%2Fa"); await personal.pendingRead();
  assert.deepEqual(personal.requested, ["/api/memory/sessions/assistant/work%2Fa/overview?scope=personal"]);
  const embedded = await browser.opening("?memory_session_kind=coding&memory_session_id=session%2Fb", true); await embedded.pendingRead();
  assert.deepEqual(embedded.requested, ["/projects/project%2Fa/api/memory/sessions/coding/session%2Fb/overview?scope=project"]);
});

test("A4-M incomplete, unknown, duplicate and unscoped Coding selections fail before any request", async t => {
  const browser = await browserOpening(t);
  for (const search of ["?memory_session_kind=assistant", "?memory_session_id=a", "?memory_session_kind=other&memory_session_id=a",
    "?memory_session_kind=assistant&memory_session_id=", "?memory_session_kind=assistant&memory_session_id=a&memory_session_id=b",
    "?memory_session_kind=coding&memory_session_id=a"]) {
    const result = await browser.opening(search), error = await result.error();
    assert.deepEqual(result.requested, [], search); assert.equal(error.hidden, false, search); assert.match(error.textContent, /无效/, search);
  }
});

import { createSettingsAddressHarness } from "./fixtures/settings-address.js";

test("A4-M the existing cover filters global and project memory navigation without dropping the business target", () => {
  const cover = createSettingsAddressHarness();
  assert.equal(cover.open("/projects/p1/settings/memory?memory_session_kind=coding&memory_session_id=session-1&scope=all&actor=forged&other=1#raw"),
    "/projects/p1/settings/memory?memory_session_kind=coding&memory_session_id=session-1");
  assert.equal(cover.open("/settings/memory?memory_session_kind=assistant&memory_session_id=work-1&scope=all&actor=forged&other=1#raw"),
    "/settings/memory?memory_session_kind=assistant&memory_session_id=work-1");
  assert.equal(cover.open("/projects/p1/settings/memory?memory_session_id=session-1&other=1"), "/projects/p1/settings/memory?memory_session_id=session-1", "a missing kind still reaches the binder's rejection");
  assert.equal(cover.open("/projects/p1/settings/memory?memory_session_kind=unknown&other=1"), "/projects/p1/settings/memory?memory_session_kind=unknown", "an invalid partial target is never turned into a global scope page");
  assert.equal(cover.open("/projects/other/settings/memory?memory_session_kind=coding&memory_session_id=session-1"), null, "this project's cover cannot impersonate another project's target");
});
