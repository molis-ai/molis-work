import { observePluginFrames } from "./plugin-frame-browser.js";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Socket } from "node:net";
import type { TestContext } from "node:test";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import { DEMO_PROJECT_ID, seedDemoBoard, MolisWorkLocalHost, projectActionAvailability, type HostCompleteText, type WebServerOptions } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { PROJECT_SCOPED_PLUGIN_IDS } from "@molis-ai/molis-work-app-workbench";
import { createMolisWorkWebServer } from "../../apps/desktop/launchers/web/server.js";
import { webServerProcess } from "./web-server-process.js";

/** The control token every Goals browser fixture serves with; e2e files that call the server by hand use this one (`controlToken` in the return). */
const CONTROL_TOKEN = "goals-risk-test-control-token-0123456789";

/** Both modes share the same browser driver; only the process mode owns an independently restartable Host. */
async function browserServer(options: WebServerOptions, separateProcess: boolean | undefined, connections: Set<Socket>) {
  if (separateProcess) {
    assert.ok(!options.databasePath && !options.localHost && !options.chooseDirectory, "process launcher uses the persisted catalog and production Host");
    const processServer = await webServerProcess(options.homeDirectory!, CONTROL_TOKEN);
    return { processServer, server: undefined, setFrameInitScript: (_source: string) => { throw new Error("Process launcher does not inject plugin frame scripts"); } };
  }
  const server = createMolisWorkWebServer(options), setFrameInitScript = observePluginFrames(server);
  server.on("connection", connection => {
    connections.add(connection);
    connection.once("close", () => connections.delete(connection));
  });
  return { server, processServer: undefined, setFrameInitScript };
}

/** One isolated project and Chrome profile; no user services or Runtime bindings. */
export async function openGoalBrowser(t: TestContext, catalogMode: boolean | "empty" | "seeded" | "user" = false, seed: (databasePath: string, projectId?: string) => void = seedDemoBoard, completion?: HostCompleteText | null,
  runtimeSessionTransport?: NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]>["runtimeSessionTransport"],
  functions?: NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]>["functions"], workspaceFor?: NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]>["workspaceFor"],
  webOptions: Pick<WebServerOptions, "chooseDirectory"> & { processServer?: boolean } = {},
  pluginFixtures?: NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]>["pluginFixtures"], chromeArgs?: readonly string[]) {
  const chrome = locateTestChrome();
  if (!chrome) { t.skip("Chrome is required for Goals UI E2E"); return null; }
  const directory = await mkdtemp(join(tmpdir(), "molis-work-goals-browser-"));
  let store: LocalProjectDatabase | undefined;
  let localHost: MolisWorkLocalHost | undefined;
  let harness: ChromeHarness | undefined;
  let server: ReturnType<typeof createMolisWorkWebServer> | undefined;
  let processServer: Awaited<ReturnType<typeof webServerProcess>> | undefined;
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
      if (processServer) return processServer.close();
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
  } else {
    await new MolisWorkLocalHost({ homeDirectory: directory, completeText: null }).close();
    seed(databasePath);
  }
  store = new LocalProjectDatabase(databasePath);
  localHost = completion === undefined && !runtimeSessionTransport && !functions && !workspaceFor && !pluginFixtures ? undefined : new MolisWorkLocalHost({ homeDirectory: directory, completeText: completion, runtimeSessionTransport, functions, workspaceFor, pluginFixtures,
    ...(projectId ? { actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, directory) } : {}) });
  const { processServer: separateProcess, ...serverOptions } = webOptions;
  const started = await browserServer({ ...(catalogMode ? {} : { databasePath, projectId: DEMO_PROJECT_ID }), homeDirectory: directory,
    ...(localHost ? { localHost } : {}), controlToken: CONTROL_TOKEN, ...serverOptions }, separateProcess, connections);
  server = started.server; processServer = started.processServer;
  const { setFrameInitScript } = started;
  // The limits stop a hang; they are not speed checks. They are sized for the Linux CI runner, which runs these pages about
  // 2.5 times slower than a development Mac (one command or wait that takes 4 s there takes 10 s here).
  const browser = await ChromeHarness.start(directory, { executable: chrome, commandTimeoutMs: 15_000, ...(chromeArgs ? { extraArgs: chromeArgs } : {}) });
  harness = browser;
  /** A page load may take far longer than any other command. */
  function command<T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = method === "Page.navigate" || method === "Page.reload" ? 30_000 : undefined): Promise<T> {
    return browser.command<T>(method, params, sessionId, timeoutMs);
  }
  if (server) await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server?.address();
  assert.ok(processServer || address && typeof address === "object");
  const origin = processServer?.origin ?? `http://127.0.0.1:${(address as { port: number }).port}`;
  await (await fetch(origin + "/health")).text();
  const before = store.snapshot(projectId ?? DEMO_PROJECT_ID);
  const { targetId } = await command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  await command("Target.activateTarget", { targetId });
  await command("Page.enable", {}, sessionId);
  async function setViewport(width: number, height: number, mobile = false): Promise<void> {
    // Emulation alone leaves the native window small: pointer events outside it can miss plugin frames.
    // Size this window for the current scenario before applying its layout and mobile emulation.
    const { windowId } = await command<{ windowId: number }>("Browser.getWindowForTarget", { targetId });
    await command("Browser.setWindowBounds", { windowId, bounds: { width, height } });
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }, sessionId);
  }
  // The product shows tool names by default; these journeys measure content at a given width, so they
  // start from the icon rail unless a test chooses otherwise.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "try { if (localStorage.getItem('molis-work-navigation-labels') === null) localStorage.setItem('molis-work-navigation-labels', 'false'); } catch {}" }, sessionId);
  async function evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression: string, timeoutMs = 10_000): Promise<void> {
    const result = await command<{ result: { value: unknown }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression: `new Promise((resolve, reject) => {
      const deadline = Date.now() + ${timeoutMs};
      const check = () => { if (${expression}) resolve(true); else if (Date.now() >= deadline) reject(new Error('DOM condition timeout: ' + ${JSON.stringify(expression.slice(0, 200))} + '; toast=' + document.querySelector('[data-toast]')?.textContent + '; focused=' + document.activeElement?.outerHTML.slice(0,300))); else setTimeout(check, 16); }; check();
    })`, awaitPromise: true, returnByValue: true }, sessionId, timeoutMs + 2_000);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
  }
  /** No shown plugin surface is still loading its client; one whose client failed to load shows its own retry. */
  const SURFACES_SETTLED = `!document.querySelector('[data-ui-client-state="loading"]')
    && ![...document.querySelectorAll('[data-deferred-surface]')].some(surface => !surface.closest('[hidden]') && surface.dataset.uiClientState !== 'failed')`;
  async function click(selector: string, options: { allowDisabled?: boolean } = {}): Promise<void> {
    // Negative interaction tests may deliberately press a disabled control; visibility and hit checks still apply.
    // A person waits while a plugin surface they opened is still loading its client (#150): it is inert until then.
    await waitFor(SURFACES_SETTLED, 10_000);
    const point = await evaluate<{ x: number; y: number; covered: boolean }>(`(async () => { let element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing click target: ' + ${JSON.stringify(selector)});
      // Reach an entry the way a person would: the side panel, the full plugin list, a collapsed source drawer, or the menu it sits in.
      // Each step looks at the current state, so it is safe to repeat (a list closing from the previous choice, say).
      const reveal = (element) => {
        const picker = element.closest('[data-plugin-picker-popover]');
        if (picker && picker.hidden) document.querySelector('[data-plugin-picker-toggle]')?.click();
        const sidePanel = element.closest('[data-side-panel]');
        if (sidePanel && sidePanel.hidden) document.querySelector('[data-side-toggle]')?.click();
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
      // A background refresh can disable and replace a button after the caller's ready check. Wait at most 5 s,
      // reacquiring the current node after layout, before sending any pointer event (ASC-38, ASC-39).
      const deadline = performance.now() + 5_000;
      while (true) {
        element = document.querySelector(${JSON.stringify(selector)});
        if (!element) throw new Error('Click target disappeared: ' + ${JSON.stringify(selector)});
        reveal(element);
        if (element.getClientRects().length) {
          element.scrollIntoView({block:'nearest',behavior:'instant'});
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          element = document.querySelector(${JSON.stringify(selector)});
          if (!element) throw new Error('Click target disappeared: ' + ${JSON.stringify(selector)});
          const rect = element.getBoundingClientRect();
          if (rect.width && rect.height && (${options.allowDisabled === true} || !element.matches(':disabled'))) {
            const hit = document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
            return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,covered:!element.contains(hit)};
          }
        }
        if (performance.now() >= deadline) throw new Error((element.matches(':disabled') ? 'Disabled' : 'Hidden') + ' click target: ' + ${JSON.stringify(selector)});
        await new Promise(resolve => setTimeout(resolve, 33));
      } })()`);
    if (point.covered) {
      // What shows only while the pointer is on its row (a row's own buttons) shows once the pointer is there, as for a person;
      // what is still covered then really is.
      await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y }, sessionId);
      const hit = await evaluate<string | null>(`(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const element = document.querySelector(${JSON.stringify(selector)}); const hit = document.elementFromPoint(${point.x}, ${point.y});
        if (!element || element.contains(hit)) return null;
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return (hit?.outerHTML.slice(0, 400) ?? 'nothing') + ' (target: pointer-events ' + style.pointerEvents + ', visibility ' + style.visibility
          + ', rect ' + [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(',') + ', viewport ' + innerWidth + 'x' + innerHeight + ')'; })()`);
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
      stopListening = browser.on("Page.domContentEventFired", (_event, eventSession) => { if (eventSession === sessionId) resolve(); });
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
  return { store, localHost, server, restartServer: processServer?.restart, databasePath, origin, controlToken: CONTROL_TOKEN, web, before, sessionId, command, setViewport, setFrameInitScript, on: browser.on.bind(browser), evaluate, waitFor, click, surfaceReady, openGoalFrame, openGoalWork, reloadPage, navigate, showGoalStageList, projectId, homeDirectory: directory };
}
