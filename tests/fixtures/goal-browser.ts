import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket } from "node:net";
import type { TestContext } from "node:test";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import { DEMO_PROJECT_ID, seedDemoBoard, MolisWorkLocalHost, projectActionAvailability, type HostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { PROJECT_SCOPED_PLUGIN_IDS } from "@molis-ai/molis-work-app-workbench";
import { createMolisWorkWebServer } from "../../apps/desktop/launchers/web/server.js";

/** The control token every Goals browser fixture serves with; e2e files that call the server by hand use this one (`controlToken` in the return). */
const CONTROL_TOKEN = "goals-risk-test-control-token-0123456789";

/** One isolated project and Chrome profile; no user services or Runtime bindings. */
export async function openGoalBrowser(t: TestContext, catalogMode: boolean | "empty" | "seeded" | "user" = false, seed: (databasePath: string, projectId?: string) => void = seedDemoBoard, completion?: HostCompleteText | null,
  runtimeSessionTransport?: NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]>["runtimeSessionTransport"],
  functions?: NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]>["functions"]) {
  const chrome = locateTestChrome();
  if (!chrome) { t.skip("Chrome is required for Goals UI E2E"); return null; }
  const directory = await mkdtemp(join(tmpdir(), "molis-work-goals-browser-"));
  let store: LocalProjectDatabase | undefined;
  let localHost: MolisWorkLocalHost | undefined;
  let harness: ChromeHarness | undefined;
  let server: ReturnType<typeof createMolisWorkWebServer> | undefined;
  const connections = new Set<Socket>();
  t.after(async () => {
    const failures: unknown[] = [];
    const cleanup = async (name: string, action: () => Promise<unknown>) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([action(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Browser fixture cleanup timed out: ${name}; ${directory}`)), 5_000);
        })]);
      } catch (error) { failures.push(error); }
      finally { clearTimeout(timer); }
    };
    // The harness waits for Chrome's `exit` (never `close`: helpers can inherit stderr), forces it after a second
    // and releases the pipe.
    await cleanup("Chrome exit", async () => { await harness?.close(); });
    await cleanup("HTTP server", async () => {
      if (!server?.listening) return;
      const closed = new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      server.closeAllConnections();
      // Upgraded sockets are not covered by closeAllConnections.
      for (const connection of connections) connection.destroy();
      await closed;
    });
    await cleanup("Local Host", async () => { await localHost?.close(); });
    await cleanup("project database", async () => { store?.close(); });
    // BROWSER-CLEAN-01: retry only this fixture's temporary Home; the 5s bound and final AggregateError still apply.
    await cleanup("temporary Home", () => rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
    if (failures.length) throw new AggregateError(failures, "Browser fixture cleanup failed");
  });
  let databasePath = join(directory, "fixture.db");
  let projectId: string | null = null;
  if (catalogMode === true || catalogMode === "seeded" || catalogMode === "user") {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
    try {
      if (catalogMode === "seeded" || catalogMode === "user") {
        const project = await catalog.createProject({ display_name: "目录交互验证", actor_id: "browser-test" });
        if (catalogMode === "seeded") {
          for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) {
            catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "browser-test" });
          }
        }
        databasePath = project.database_path;
        projectId = project.project_id;
      } else {
        const project = (await catalog.ensureDemoProject({ actor_id: "browser-test", user_confirmed: true })).project;
        databasePath = project.database_path;
        projectId = project.project_id;
      }
    } finally { catalog.close(); }
    // A created project's database is replaced by the seed, under the project's own id.
    if ((catalogMode === "seeded" || catalogMode === "user") && projectId) {
      await rm(databasePath, { force: true });
      await rm(`${databasePath}-wal`, { force: true });
      await rm(`${databasePath}-shm`, { force: true });
      seed(databasePath, projectId);
    }
  } else seed(databasePath);
  store = new LocalProjectDatabase(databasePath);
  localHost = completion === undefined && !runtimeSessionTransport && !functions ? undefined : new MolisWorkLocalHost({ homeDirectory: directory, completeText: completion, runtimeSessionTransport, functions,
    ...(projectId ? { actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, directory) } : {}) });
  server = createMolisWorkWebServer({ ...(catalogMode ? {} : { databasePath, projectId: DEMO_PROJECT_ID }), homeDirectory: directory, ...(localHost ? { localHost } : {}),
    controlToken: CONTROL_TOKEN });
  server.on("connection", connection => {
    connections.add(connection);
    connection.once("close", () => connections.delete(connection));
  });
  const browser = await ChromeHarness.start(directory, { executable: chrome, commandTimeoutMs: 5_000 });
  harness = browser;
  /** A page load may take far longer than any other command. */
  function command<T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = method === "Page.navigate" || method === "Page.reload" ? 30_000 : undefined): Promise<T> {
    return browser.command<T>(method, params, sessionId, timeoutMs);
  }
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  await (await fetch(origin + "/health")).text();
  const before = store.snapshot(projectId ?? DEMO_PROJECT_ID);
  const { targetId } = await command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  await command("Target.activateTarget", { targetId });
  await command("Page.enable", {}, sessionId);
  // The product shows tool names by default; these journeys measure content at a given width, so they
  // start from the icon rail unless a test chooses otherwise.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "try { if (localStorage.getItem('molis-work-navigation-labels') === null) localStorage.setItem('molis-work-navigation-labels', 'false'); } catch {}" }, sessionId);
  async function evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression: string, timeoutMs = 4000): Promise<void> {
    const result = await command<{ result: { value: unknown }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression: `new Promise((resolve, reject) => {
      const deadline = Date.now() + ${timeoutMs};
      const check = () => { if (${expression}) resolve(true); else if (Date.now() >= deadline) reject(new Error('DOM condition timeout: ' + ${JSON.stringify(expression.slice(0, 200))} + '; toast=' + document.querySelector('[data-toast]')?.textContent + '; focused=' + document.activeElement?.outerHTML.slice(0,300))); else setTimeout(check, 16); }; check();
    })`, awaitPromise: true, returnByValue: true }, sessionId, timeoutMs + 2_000);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
  }
  /** No shown plugin surface is still loading its client; one whose client failed to load shows its own retry. */
  const SURFACES_SETTLED = `!document.querySelector('[data-ui-client-state="loading"]')
    && ![...document.querySelectorAll('[data-deferred-surface]')].some(surface => !surface.closest('[hidden]') && surface.dataset.uiClientState !== 'failed')`;
  async function click(selector: string): Promise<void> {
    // A person waits while a plugin surface they opened is still loading its client (#150): it is inert until then.
    await waitFor(SURFACES_SETTLED, 10_000);
    const point = await evaluate<{ x: number; y: number; covered: boolean }>(`(async () => { let element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing click target: ' + ${JSON.stringify(selector)});
      // Reach an entry the way a person would: its Dock window, the full plugin list, a collapsed source drawer, or the menu it sits in.
      // Each step looks at the current state, so it is safe to repeat (a list closing from the previous choice, say).
      const reveal = (element) => {
        const picker = element.closest('[data-plugin-picker-popover]');
        if (picker && picker.hidden) document.querySelector('[data-plugin-picker-toggle]')?.click();
        const dockWindow = element.closest('[data-dock-window]');
        if (dockWindow && dockWindow.hidden) document.querySelector('[data-dock-toggle="' + dockWindow.dataset.dockWindow + '"]')?.click();
        const rail = element.closest('.plugin-rail-items');
        if (rail && !element.getClientRects().length && !rail.classList.contains('is-tools-open')) rail.querySelector('[data-rail-tools-toggle]')?.click();
        // A Goal tab opens on its Frame; its workspace (directory, records, timeline) is behind 打开工作区.
        const goalWork = element.closest('[data-goal-node-workspace], [data-goal-event-document], [data-goal-stage-list]');
        const workEntry = [...document.querySelectorAll('[data-frame-goal-work]')].find(button => button.getClientRects().length);
        if (goalWork && !element.getClientRects().length && workEntry) workEntry.click();
        const sourceRail = element.closest('[data-feed-source-rail]');
        if (sourceRail && !sourceRail.getClientRects().length) sourceRail.parentElement?.querySelector('[data-feed-rail-toggle]')?.click();
        const menu = element.closest('details:not([open])');
        if (menu && !menu.querySelector(':scope > summary')?.contains(element)) menu.querySelector(':scope > summary')?.click();
      };
      reveal(element);
      await new Promise(resolve => requestAnimationFrame(resolve));
      // A list may still be closing from the previous choice, or take a few frames to open on a busy machine.
      for (let tries = 0; tries < 30; tries++) {
        const current = document.querySelector(${JSON.stringify(selector)}) || element;
        if (current.getClientRects().length) break;
        reveal(current);
        await new Promise(resolve => setTimeout(resolve, 33));
      }
      element = document.querySelector(${JSON.stringify(selector)}) || element;
      element.scrollIntoView({block:'nearest',behavior:'instant'});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      // A completed request may repaint the list during the two layout frames.
      element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Click target disappeared: ' + ${JSON.stringify(selector)});
      const rect = element.getBoundingClientRect(); if (!rect.width || !rect.height) throw new Error('Hidden click target: ' + ${JSON.stringify(selector)});
      const hit = document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,covered:!element.contains(hit)}; })()`);
    if (point.covered) {
      // What shows only while the pointer is on its row (a row's own buttons) shows once the pointer is there, as for a person;
      // what is still covered then really is.
      await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, sessionId);
      const hit = await evaluate<string | null>(`(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const element = document.querySelector(${JSON.stringify(selector)}); const hit = document.elementFromPoint(${point.x}, ${point.y});
        return element && element.contains(hit) ? null : (hit?.outerHTML.slice(0, 400) ?? 'nothing'); })()`);
      if (hit !== null) throw new Error("Click target " + selector + " is covered by " + hit);
    }
    await command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, sessionId);
    await command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }, sessionId);
  }
  async function navigate(action: () => Promise<unknown>) {
    const timeoutError = new Error("Navigation did not finish");
    let timer: ReturnType<typeof setTimeout>;
    let stopListening = () => {};
    // Hidden plugin frames and optional external assets must not block interaction with an initialized page.
    // Feature tests below still wait for the state they operate on (loaded rows, saved results, etc.).
    const loaded = new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(timeoutError), 30_000);
      stopListening = browser.on("Page.domContentEventFired", () => resolve());
    });
    try {
      await Promise.all([loaded, action()]);
    } catch (error) {
      if (error === timeoutError) {
        try {
          timeoutError.message += "; " + await evaluate("JSON.stringify({url:location.pathname,error:document.querySelector('[role=alert]:not([hidden])')?.textContent,invalid:Array.from(document.querySelectorAll(':invalid')).map(x=>x.name)})");
        } catch (diagnosticError) {
          timeoutError.message += "; page diagnostics unavailable: " + String(diagnosticError);
        }
      }
      throw error;
    } finally {
      clearTimeout(timer!);
      stopListening();
    }
  }
  const reloadPage = () => navigate(() => command("Page.reload", { ignoreCache: true }, sessionId));
  async function openGoalFrame(selector: string) {
    await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) throw new Error("Missing Goal for Frame: " + ${JSON.stringify(selector)});
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, detail: 1 }));
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, detail: 2 }));
    })()`);
  }
  /** Open the current Goal tab's workspace view, the way a person clicks 打开工作区 on its Frame. */
  async function openGoalWork() {
    await evaluate(`[...document.querySelectorAll('[data-frame-goal-work]')].find(button => button.getClientRects().length)?.click()`);
    await waitFor("Boolean(document.querySelector('[data-goal-node-workspace]')?.getClientRects().length) && Boolean(document.querySelector('[data-goal-node-workspace]').dataset.expandedGoal)");
  }
  async function showGoalStageList() {
    await evaluate(`(() => {
      document.querySelector('[data-plugin-strip] [data-plugin-id="goals"]')?.click();
      document.querySelector("[data-board-view-tab=list]")?.click();
    })()`);
    await waitFor("document.querySelector('[data-goal-canvas-shell]') && !document.querySelector('[data-goal-canvas-shell]').hidden && document.querySelector('[data-goal-stage-chrome] [data-open-create]')?.getBoundingClientRect().width > 0");
  }
  /** A plugin surface whose client loads when it first opens (#150) is ready for a person to use. */
  async function surfaceReady(id: string, timeoutMs = 10_000): Promise<void> {
    await waitFor(`(() => { const surface = document.querySelector('[data-work-surface=${JSON.stringify(id)}]');
      return Boolean(surface) && !surface.hasAttribute('data-deferred-surface') && surface.dataset.uiClientState !== 'loading'; })()`, timeoutMs);
  }
  /** The person's side of the Host's local HTTP interface, for settings the page does not need to show (grants, projects). */
  const web = new LocalHostHttpClient({ origin, controlToken: CONTROL_TOKEN });
  return { store, localHost, databasePath, origin, controlToken: CONTROL_TOKEN, web, before, sessionId, command, evaluate, waitFor, click, surfaceReady, openGoalFrame, openGoalWork, reloadPage, navigate, showGoalStageList, projectId, homeDirectory: directory };
}
