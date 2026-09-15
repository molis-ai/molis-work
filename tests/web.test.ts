import { buildMolisWorkWebView, cachedMolisWorkWebView } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Script } from "node:vm";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { type MolisWorkProjectCatalog, normalizeRuntimeWorkContext } from "@molis-ai/molis-work-app-local-host";
import { RuntimeIntegrationService } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkWebServiceManager } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import {
  GOAL_TREE_STATUS_ORDER,
  activeOutgoingDependsOn,
  countGoalDecisions,
  displayedPassedCriterionIds,
  firstBlockedDescendant,
  goalTreeReferenceLabel,
  renderMolisWorkMomentumFragment,
  renderFeedWorkbenchFragment,
  goalTreeReferenceLabels,
  renderGoalDocumentFragment,
  renderMolisWorkWorkbenchClientScript,
  renderMolisWorkWorkbenchStylesheet,
  renderMolisWorkProjectSettings,
  WORK_TAB_VISIBILITY_CLIENT_SCRIPT,
  renderMolisWorkWeb,
  renderPersistedFeedItemDetail,
  sortGoalTreeItems,
  unsatisfiedOutgoingDependencies,
  WEB_GOAL_STATUSES,
} from "./workbench-renderer-fixture.js";
import { createMolisWorkWebServer as createBaseMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const WEB_TEST_CONTROL_TOKEN = "molis-work-web-test-control-token-0123456789abcdef";
const WORKBENCH_CLIENT_SCRIPT = renderMolisWorkWorkbenchClientScript();
const WORKBENCH_STYLES = renderMolisWorkWorkbenchStylesheet();
let webRequestSequence = 0;

type GoalTreeBrowserLayout = {
  paneWidth: number;
  titleWhiteSpace: string;
  titleLineCount: number;
  titleClientWidth: number;
  titleScrollWidth: number;
  titleClientHeight: number;
  titleScrollHeight: number;
  parentCollapsedLineCount: number;
  parentCollapsedTitleHeight: number;
  parentCollapsedWhiteSpace: string;
  parentCollapsedRowHeight: number;
  parentCollapsedProgressDisplay: string;
  parentExpandedLineCount: number;
  parentExpandedTitleHeight: number;
  parentExpandedWhiteSpace: string;
  parentExpandedRowHeight: number;
  parentExpandedProgressDisplay: string;
  parentRestoredLineCount: number;
  parentRestoredRowHeight: number;
  parentRestoredProgressDisplay: string;
};

type DecisionDeepLinkBrowserState = {
  selectedEntryId: string | null;
  targetDetailHidden: boolean | null;
  formVisible: boolean;
  submitVisible: boolean;
  formFocused: boolean;
  mobileView: string | null;
  searchValue: string | null;
};

type DesktopWorkTabBrowserLayout = {
  initial: { railLeft: number; railRight: number; tabLeft: number; tabRight: number; scrollLeft: number; scrollWidth: number; tabCount: number };
  resized: { railLeft: number; railRight: number; tabLeft: number; tabRight: number; scrollLeft: number; scrollWidth: number; tabCount: number };
};

let cachedGoalTreeBrowserLayout: Promise<GoalTreeBrowserLayout | null> | undefined;

function readGoalTreeBrowserLayout(): Promise<GoalTreeBrowserLayout | null> {
  if (cachedGoalTreeBrowserLayout !== undefined) return cachedGoalTreeBrowserLayout;
  const browser = [
    process.env.MOLIS_WORK_TEST_CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!browser) {
    cachedGoalTreeBrowserLayout = Promise.resolve(null);
    return cachedGoalTreeBrowserLayout;
  }

  const directory = mkdtempSync(join(tmpdir(), "molis-work-tree-layout-"));
  const htmlPath = join(directory, "layout.html");
  const profilePath = join(directory, "chrome-profile");
  mkdirSync(profilePath);
  const longTitle = "建立即刻平台五十位以上经过逐项核验且保留完整证据边界的高质量人工智能创作者详细基线名单";
  writeFileSync(htmlPath, `<!doctype html>
    <html><head><meta charset="utf-8"><style>${WORKBENCH_STYLES}</style></head>
    <body data-board-view="current" data-desktop-shell="true" data-native-desktop="true">
      <div class="app"><main class="workspace" style="--tree-width: 519px; width: 1178px; height: 760px">
        <aside class="tree-pane" data-desktop-directory="goals">
          <section class="desktop-directory-panel desktop-goal-directory">
            <div class="tree-scroll"><ul class="goal-tree">
            <li class="tree-item is-collapsed" id="parent-item">
              <div class="tree-row" id="parent-row"><button class="tree-toggle" type="button"></button><div class="tree-entry directory-list-row">
                <button class="tree-node" type="button"><span class="tree-copy"><span class="tree-title-line"><strong id="parent-title">${longTitle}</strong></span><small>G2G</small></span></button>
                <span class="directory-row-state"><span class="goal-status goal-status--clarification_pending">目标待澄清</span></span>
                <span class="tree-meta-line"><span class="tree-progress" id="parent-progress"><span>3/8</span><i><b></b></i></span></span>
              </div></div>
              <ul class="tree-children"><li class="tree-item"><div class="tree-row"><span class="tree-guide"></span><div class="tree-entry directory-list-row"><button class="tree-node" type="button"><span class="tree-copy"><span class="tree-title-line"><strong>可见的子 Goal</strong></span></span></button><span class="directory-row-state"><span class="goal-status goal-status--satisfied">已完成</span></span><span class="tree-meta-line"></span></div></div></li></ul>
            </li>
            <li class="tree-item"><ul class="tree-children"><li class="tree-item"><ul class="tree-children"><li class="tree-item"><ul class="tree-children"><li class="tree-item">
              <div class="tree-row"><span class="tree-guide"></span><div class="tree-entry directory-list-row">
                <button class="tree-node" type="button"><span class="tree-copy"><span class="tree-title-line"><strong id="target-title">${longTitle}</strong></span><small>G2G/J</small></span></button>
                <span class="directory-row-state" id="target-status"><span class="goal-status goal-status--execution_blocked">执行受阻</span></span>
                <span class="tree-meta-line"><span class="tree-progress"><span>1 个前置</span></span></span>
              </div></div>
            </li></ul></li></ul></li></ul></li></ul></div>
          </section>
        </aside><div class="tree-resizer"></div><section class="document-pane"></section>
      </main></div>
      <script>
        const pane = document.querySelector(".tree-pane");
        const title = document.querySelector("#target-title");
        const range = document.createRange();
        range.selectNodeContents(title);
        const parent = document.querySelector("#parent-item");
        const parentTitle = document.querySelector("#parent-title");
        const parentRow = document.querySelector("#parent-row");
        const parentProgress = document.querySelector("#parent-progress");
        const parentMetrics = () => {
          const parentRange = document.createRange();
          parentRange.selectNodeContents(parentTitle);
          return {
            lineCount: parentRange.getClientRects().length,
            titleHeight: parentTitle.getBoundingClientRect().height,
            whiteSpace: getComputedStyle(parentTitle).whiteSpace,
            rowHeight: parentRow.getBoundingClientRect().height,
            progressDisplay: getComputedStyle(parentProgress).display,
          };
        };
        const parentCollapsed = parentMetrics();
        parent.classList.remove("is-collapsed");
        const parentExpanded = parentMetrics();
        parent.classList.add("is-collapsed");
        const parentRestored = parentMetrics();
        const result = {
          paneWidth: pane.getBoundingClientRect().width,
          titleWhiteSpace: getComputedStyle(title).whiteSpace,
          titleLineCount: range.getClientRects().length,
          titleClientWidth: title.clientWidth,
          titleScrollWidth: title.scrollWidth,
          titleClientHeight: title.clientHeight,
          titleScrollHeight: title.scrollHeight,
          parentCollapsedLineCount: parentCollapsed.lineCount,
          parentCollapsedTitleHeight: parentCollapsed.titleHeight,
          parentCollapsedWhiteSpace: parentCollapsed.whiteSpace,
          parentCollapsedRowHeight: parentCollapsed.rowHeight,
          parentCollapsedProgressDisplay: parentCollapsed.progressDisplay,
          parentExpandedLineCount: parentExpanded.lineCount,
          parentExpandedTitleHeight: parentExpanded.titleHeight,
          parentExpandedWhiteSpace: parentExpanded.whiteSpace,
          parentExpandedRowHeight: parentExpanded.rowHeight,
          parentExpandedProgressDisplay: parentExpanded.progressDisplay,
          parentRestoredLineCount: parentRestored.lineCount,
          parentRestoredRowHeight: parentRestored.rowHeight,
          parentRestoredProgressDisplay: parentRestored.progressDisplay,
        };
        document.title = "RESULT:" + btoa(unescape(encodeURIComponent(JSON.stringify(result))));
      </script>
    </body></html>`);

  cachedGoalTreeBrowserLayout = new Promise((resolve, reject) => {
    const child = spawn(browser, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-mode",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--no-default-browser-check",
      "--no-first-run",
      `--user-data-dir=${profilePath}`,
      "--window-size=1178,760",
      "--dump-dom",
      `file://${htmlPath}`,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let result: GoalTreeBrowserLayout | null = null;
    const timer = setTimeout(() => child.kill("SIGTERM"), 10_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const encoded = stdout.match(/<title>RESULT:([^<]+)<\/title>/)?.[1];
      if (!encoded || result) return;
      result = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as GoalTreeBrowserLayout;
      child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => reject(error));
    child.on("close", () => {
      clearTimeout(timer);
      rmSync(directory, { recursive: true, force: true });
      if (result) resolve(result);
      else reject(new Error(`${stderr}\nBrowser layout result missing from DOM:\n${stdout.slice(0, 500)}`));
    });
  });
  return cachedGoalTreeBrowserLayout;
}

function readDecisionDeepLinkBrowserState(
  html: string,
  goalId: string,
  options: { width?: number; scenario?: "initial" | "after_feed_switch" | "restored_mobile_tree" } = {},
): Promise<DecisionDeepLinkBrowserState | null> {
  const browser = [
    process.env.MOLIS_WORK_TEST_CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!browser) return Promise.resolve(null);

  const directory = mkdtempSync(join(tmpdir(), "molis-work-decision-deep-link-"));
  const profilePath = join(directory, "chrome-profile");
  const htmlPath = join(directory, "decisions.html");
  mkdirSync(profilePath);
  const scenario = options.scenario ?? "initial";
  const browserHtml = html.replace(
    '<script src="/assets/molis-work-workbench.js"></script>',
    `<script>
      if (${JSON.stringify(scenario)} === "restored_mobile_tree") {
        const state = JSON.parse(document.querySelector("#molis-work-data").textContent);
        const storageKey = "molis-work-ui:" + (state.project?.project_id || state.snapshot.board.board_id) + ":inbox";
        sessionStorage.setItem(storageKey, JSON.stringify({
          mobileView: "tree",
          workSurface: "inbox",
          directory: "inbox",
          navigationVersion: 2,
        }));
      }
      globalThis.__gb24InboxWorkbenchHtml = [...document.querySelectorAll("[data-feed-detail]")]
        .map((detail) => detail.outerHTML).join("");
      globalThis.__gb24Fetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = (input, init) => {
        const url = new URL(String(input), location.href);
        if (url.pathname.endsWith("/api/feed/workbench")) {
          return Promise.resolve(new Response(
            globalThis.__gb24InboxWorkbenchHtml,
            { status: 200, headers: { "content-type": "text/html" } },
          ));
        }
        return globalThis.__gb24Fetch(input, init);
      };
    </script><script>${WORKBENCH_CLIENT_SCRIPT}</script><script>
      (async () => {
        const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));
        await nextFrame();
        await nextFrame();
        if (${JSON.stringify(scenario)} === "after_feed_switch") {
          document.querySelector('[data-work-surface-open="feed"][data-feed-preset="feed"]')?.click();
          await nextFrame();
          await nextFrame();
          const search = document.querySelector("[data-feed-search]");
          if (search) {
            search.value = "__hide_every_decision__";
            search.dispatchEvent(new Event("input", { bubbles: true }));
          }
          location.hash = ${JSON.stringify(`#decision-goal-${goalId}`)};
        }
        await nextFrame();
        await nextFrame();
        await nextFrame();
        const targetEntryId = ${JSON.stringify(`decision:${goalId}`)};
        const rows = [...document.querySelectorAll("[data-feed-entry-id]")];
        const selectedRow = rows.find((row) => row.classList.contains("is-selected"));
        const targetDetail = [...document.querySelectorAll("[data-feed-detail]")]
          .find((detail) => detail.dataset.feedDetail === targetEntryId);
        const form = targetDetail?.querySelector(
          "[data-human-review-form], [data-goal-tree-decision-form], [data-contract-decision-form], [data-candidate-decision-form], [data-rewire-decision-form], [data-risk-state-form]",
        );
        const submit = form?.querySelector('button[type="submit"]');
        const pane = document.querySelector("[data-document-pane]");
        const paneRect = pane?.getBoundingClientRect();
        const formRect = form?.getBoundingClientRect();
        const submitRect = submit?.getBoundingClientRect();
        const result = {
          selectedEntryId: selectedRow?.dataset.feedEntryId ?? null,
          targetDetailHidden: targetDetail ? targetDetail.hidden : null,
          formVisible: Boolean(paneRect && formRect && formRect.top >= paneRect.top - 1 && formRect.top < paneRect.bottom),
          submitVisible: Boolean(paneRect && submitRect && submitRect.top >= paneRect.top - 1 && submitRect.bottom <= paneRect.bottom + 1),
          formFocused: document.activeElement === form,
          mobileView: document.querySelector("[data-workspace]")?.dataset.mobileView ?? null,
          searchValue: document.querySelector("[data-feed-search]")?.value ?? null,
        };
        document.title = "RESULT:" + btoa(unescape(encodeURIComponent(JSON.stringify(result))));
      })();
    </script>`,
  );
  writeFileSync(
    htmlPath,
    browserHtml,
  );
  return new Promise((resolve, reject) => {
    const child = spawn(browser, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-mode",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--no-default-browser-check",
      "--no-first-run",
      `--user-data-dir=${profilePath}`,
      `--window-size=${options.width ?? 1280},800`,
      "--virtual-time-budget=3000",
      "--dump-dom",
      `file://${htmlPath}${scenario === "after_feed_switch" ? "" : `#decision-goal-${encodeURIComponent(goalId)}`}`,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 15_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (/<title>RESULT:[^<]+<\/title>/.test(stdout)) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", () => {
      clearTimeout(timer);
      rmSync(directory, { recursive: true, force: true });
      if (!stdout) {
        reject(new Error(`${stderr}\nBrowser decision deep-link DOM is empty`));
        return;
      }
      const encoded = stdout.match(/<title>RESULT:([^<]+)<\/title>/)?.[1];
      if (!encoded) {
        reject(new Error(`${stderr}\nBrowser decision deep-link result missing from DOM:\n${stdout.slice(0, 500)}`));
        return;
      }
      resolve(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as DecisionDeepLinkBrowserState);
    });
  });
}

function readDesktopWorkTabBrowserLayout(
  openTabs: string[],
): Promise<DesktopWorkTabBrowserLayout | null> {
  const browser = [
    process.env.MOLIS_WORK_TEST_CHROME,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (!browser) return Promise.resolve(null);

  const directory = mkdtempSync(join(tmpdir(), "molis-work-work-tabs-layout-"));
  const profilePath = join(directory, "chrome-profile");
  const htmlPath = join(directory, "work-tabs.html");
  mkdirSync(profilePath);
  const tabMarkup = openTabs.map((goalId, index) => `<div class="desktop-work-tab${index === openTabs.length - 1 ? " is-selected" : ""}" data-work-tab-shell="${goalId}"><button type="button" role="tab" data-work-tab="${goalId}" aria-selected="${index === openTabs.length - 1}"><i aria-hidden="true"></i><span>这是第 ${index + 1} 个用于验证完整可见的较长 Goal 标题</span></button><button type="button">×</button></div>`).join("");
  const browserHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${WORKBENCH_STYLES}
    .desktop-work-tabs.fixture-work-tabs { width: 420px; max-width: 420px; }
  </style></head><body data-board-view="current" data-desktop-shell="true" data-native-desktop="true">
    <div class="desktop-work-tabs fixture-work-tabs" data-work-tabs role="tablist" aria-label="已打开的 Goal">${tabMarkup}</div>
    <script>
      window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 0);
      window.cancelAnimationFrame = (handle) => clearTimeout(handle);
      const workTabs = document.querySelector("[data-work-tabs]");
      ${WORK_TAB_VISIBILITY_CLIENT_SCRIPT}
      ensureActiveWorkTabVisible();
      (async () => {
        const waitForLayout = () => new Promise((resolve) => setTimeout(resolve, 100));
        const snapshot = () => {
          const rail = document.querySelector("[data-work-tabs]");
          const tab = rail.querySelector(".desktop-work-tab.is-selected");
          const railRect = rail.getBoundingClientRect();
          const tabRect = tab.getBoundingClientRect();
          return {
            railLeft: railRect.left,
            railRight: railRect.right,
            tabLeft: tabRect.left,
            tabRight: tabRect.right,
            scrollLeft: rail.scrollLeft,
            scrollWidth: rail.scrollWidth,
            tabCount: rail.querySelectorAll(".desktop-work-tab").length,
          };
        };
        try {
          await waitForLayout();
          const initial = snapshot();
          const rail = document.querySelector("[data-work-tabs]");
          rail.style.width = "300px";
          rail.style.maxWidth = "300px";
          ensureActiveWorkTabVisible();
          await waitForLayout();
          await waitForLayout();
          const resized = snapshot();
          const result = { initial, resized };
          document.title = "RESULT:" + btoa(unescape(encodeURIComponent(JSON.stringify(result))));
        } catch (error) {
          document.title = "ERROR:" + String(error?.stack || error);
        }
      })();
    </script></body></html>`;
  writeFileSync(htmlPath, browserHtml);

  return new Promise((resolve, reject) => {
    const child = spawn(browser, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-mode",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--no-default-browser-check",
      "--no-first-run",
      `--user-data-dir=${profilePath}`,
      "--window-size=800,500",
      "--virtual-time-budget=3000",
      "--dump-dom",
      `file://${htmlPath}`,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 15_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (/<title>RESULT:[^<]+<\/title>/.test(stdout)) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", () => {
      clearTimeout(timer);
      rmSync(directory, { recursive: true, force: true });
      const encoded = stdout.match(/<title>RESULT:([^<]+)<\/title>/)?.[1];
      if (!encoded) {
        reject(new Error(`${stderr}\nBrowser work-tab result missing from DOM:\n${stdout.slice(0, 500)}`));
        return;
      }
      resolve(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as DesktopWorkTabBrowserLayout);
    });
  });
}

function createMolisWorkWebServer(
  options: Parameters<typeof createBaseMolisWorkWebServer>[0] = {},
) {
  return createBaseMolisWorkWebServer({ ...options, controlToken: WEB_TEST_CONTROL_TOKEN });
}

function webFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD") return globalThis.fetch(input, init);
  const target = new URL(input instanceof Request ? input.url : String(input));
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) headers.set("origin", target.origin);
  if (!headers.has("x-molis-work-control-token")) {
    headers.set("x-molis-work-control-token", WEB_TEST_CONTROL_TOKEN);
  }
  if (!headers.has("x-molis-work-idempotency-key")) {
    webRequestSequence += 1;
    headers.set("x-molis-work-idempotency-key", `web-test-request-${webRequestSequence}`);
  }
  return globalThis.fetch(input, { ...init, headers });
}

/** Read the full Goal page; factor and completion content is already in the document. */
async function readGoalPage(origin: string, goalId: string): Promise<string> {
  return (await webFetch(`${origin}/goals/${encodeURIComponent(goalId)}`)).text();
}

function rawHttpGet(port: number, path: string, hostHeader: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, path, headers: { host: hostHeader } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
    });
    request.on("error", reject);
    request.end();
  });
}

function assertInlineScriptsCompile(html: string): void {
  const scripts = Array.from(html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g));
  for (const [, source] of scripts) {
    if (!source.trim() || source.trim().startsWith("{")) continue;
    assert.doesNotThrow(() => new Script(source), "rendered inline script must be valid JavaScript");
  }
}

function workSurfaceHtml(html: string, surface: "goal" | "feed"): string {
  const marker = `data-work-surface="${surface}"`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `missing ${surface} work surface`);
  const next = html.indexOf('data-work-surface="', start + marker.length);
  return html.slice(start, next === -1 ? html.length : next);
}

function goalDocumentHtml(page: string, goalId: string): string {
  const marker = `data-goal-view="${goalId}"`;
  const start = page.indexOf(marker);
  assert.ok(start >= 0, `missing Goal document: ${goalId}`);
  return page.slice(Math.max(0, start - 80), start + 12_000);
}

function goalHeaderHtml(page: string, goalId: string): string {
  const marker = `data-goal-view="${goalId}"`;
  const start = page.indexOf(marker);
  assert.ok(start >= 0, `missing Goal document: ${goalId}`);
  const headerStart = page.indexOf('class="goal-header"', start);
  assert.ok(headerStart >= 0, `missing Goal header: ${goalId}`);
  const headerEnd = page.indexOf("</section>", headerStart);
  assert.ok(headerEnd >= 0, `missing Goal header end: ${goalId}`);
  return page.slice(headerStart, headerEnd);
}

function feedDetailHtml(html: string, itemId: string): string {
  const marker = `data-feed-detail="${itemId}"`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `missing feed detail ${itemId}`);
  const next = html.indexOf('<article class="feed-detail', start + marker.length);
  return html.slice(start, next === -1 ? html.length : next);
}

function webFixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-web-"));
  const databasePath = join(directory, "demo.db");
  seedDemoBoard(databasePath);
  return { databasePath, homeDirectory: directory };
}

test("Web health identifies the process serving the response", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-work-web-health-"));
  const server = createMolisWorkWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const health = await (await webFetch(`http://127.0.0.1:${address.port}/health`)).json() as {
      status: string;
      process_id?: number;
      service_process_id?: number;
    };
    assert.equal(health.status, "ok");
    assert.equal(health.process_id, process.pid);
    assert.equal(health.service_process_id, process.pid);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(homeDirectory, { recursive: true, force: true });
  }
});

test("Web View cache follows canonical Board events instead of SQLite file lifecycle", () => {
  const { databasePath } = webFixture();
  const cache = new Map() as Parameters<typeof cachedMolisWorkWebView>[0];
  const options = { databasePath, boardId: DEMO_BOARD_ID, demo: true };

  const firstStore = new LocalProjectDatabase(databasePath);
  const first = cachedMolisWorkWebView(
    cache,
    firstStore,
    new GoalProjectApplication(firstStore),
    options,
  );
  firstStore.close();

  const reopenedStore = new LocalProjectDatabase(databasePath);
  try {
    const coordinator = new GoalProjectApplication(reopenedStore);
    const unchanged = cachedMolisWorkWebView(cache, reopenedStore, coordinator, options);
    assert.strictEqual(unchanged, first, "opening the SQLite WAL must not invalidate an unchanged Board");

    coordinator.goals.commands.createGoal(
      DEMO_BOARD_ID,
      {
        goal_id: "CACHE-EVENT",
        title: "通过事件使 Web View 失效",
        outcome: "",
        why: "",
        business_logic: "",
        definition_state: "draft",
        decomposition_state: "abstract",
        acceptance_criteria: [],
      },
      { actor_id: "test-user", idempotency_key: "web-cache-event" },
    );
    const changed = cachedMolisWorkWebView(cache, reopenedStore, coordinator, options);
    assert.notStrictEqual(changed, first);
    assert.ok(changed.goals.some((item) => item.goal.goal_id === "CACHE-EVENT"));

  } finally {
    reopenedStore.close();
  }
});

async function webProjectCatalogFixture() {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-work-web-project-catalog-"));
  const alphaContext = {
    runtime_id: "web-project-test-runtime",
    stable_work_context_id: "web-project-alpha-session",
    host_declares_stable: true,
  };
  const betaContext = {
    runtime_id: "web-project-test-runtime",
    stable_work_context_id: "web-project-beta-session",
    host_declares_stable: true,
  };
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  try {
    const alphaResolution = await catalog.createProjectAndBindRuntimeContext({
      context: alphaContext,
      display_name: "产品 Alpha",
      actor_id: "test-user",
      user_confirmed: true,
      idempotency_key: "web-project-alpha-create",
    });
    const betaResolution = await catalog.createProjectAndBindRuntimeContext({
      context: betaContext,
      display_name: "产品 Beta",
      actor_id: "test-user",
      user_confirmed: true,
      idempotency_key: "web-project-beta-create",
    });
    assert.ok(alphaResolution.project);
    assert.ok(betaResolution.project);
    return {
      homeDirectory,
      alpha: catalog.getProject(alphaResolution.project.project_id),
      beta: catalog.getProject(betaResolution.project.project_id),
      alphaContext,
      betaContext,
      bindingEvents: catalog.listRuntimeContextBindingEvents(),
    };
  } finally {
    catalog.close();
  }
}

function webRuntimeIntegrationFixture(homeDirectory: string) {
  const userHomeDirectory = join(homeDirectory, "test-user-home");
  const release = join(homeDirectory, "releases", "molis-work-web-test");
  const skill = join(release, "skills", "goal-advance");
  const launcher = join(homeDirectory, "bin", "molis-work-mcp");
  const runtimeBin = join(homeDirectory, "test-runtime-bin");
  mkdirSync(join(homeDirectory, "config"), { recursive: true });
  mkdirSync(skill, { recursive: true });
  mkdirSync(join(homeDirectory, "bin"), { recursive: true });
  mkdirSync(runtimeBin, { recursive: true });
  mkdirSync(userHomeDirectory, { recursive: true });
  writeFileSync(join(homeDirectory, "config", "installation.json"), `${JSON.stringify({
    schema_version: 2,
    installer: "molis-work-home-install-v1",
    version: "web-test",
    release_path: "releases/molis-work-web-test",
  }, null, 2)}\n`);
  writeFileSync(join(skill, "SKILL.md"), "---\nname: goal-advance\n---\n");
  writeFileSync(launcher, "#!/bin/sh\nexit 0\n");
  const codex = join(runtimeBin, "codex");
  const claude = join(runtimeBin, "claude");
  const opencode = join(runtimeBin, "opencode");
  const pi = join(runtimeBin, "pi");
  const grok = join(runtimeBin, "grok");
  for (const file of [codex, claude, opencode, pi, grok]) writeFileSync(file, "#!/bin/sh\nexit 0\n");
  [launcher, codex, claude, opencode, pi, grok].forEach((file) => chmodSync(file, 0o755));
  return {
    userHomeDirectory,
    skill,
    launcher,
    service: new RuntimeIntegrationService({
      homeDirectory,
      userHomeDirectory,
      runtimeExecutables: { codex, "claude-code": claude, opencode, "pi-agent": pi, "grok-build": grok },
      validateConnection: () => true,
    }),
  };
}

function boardSnapshot(databasePath: string, boardId: string) {
  const store = new LocalProjectDatabase(databasePath);
  try {
    return store.snapshot(boardId);
  } finally {
    store.close();
  }
}


test("Goal Tree applies the width chosen with its splitter", async (context) => {
  const layout = await readGoalTreeBrowserLayout();
  if (!layout) return context.skip("Headless Chrome is unavailable");
  assert.ok(Math.abs(layout.paneWidth - 519) <= 1, `expected 519px, received ${layout.paneWidth}px`);
});

test("Goal Tree shows a long nested title without clipping", async (context) => {
  const layout = await readGoalTreeBrowserLayout();
  if (!layout) return context.skip("Headless Chrome is unavailable");
  assert.notEqual(layout.titleWhiteSpace, "nowrap");
  assert.ok(layout.titleLineCount > 1, `expected wrapped title, received ${layout.titleLineCount} line`);
  assert.ok(layout.titleScrollWidth <= layout.titleClientWidth + 1, "title is clipped horizontally");
  assert.ok(layout.titleScrollHeight <= layout.titleClientHeight + 1, "title is clipped vertically");
});

test("Goal Tree compacts an expanded parent row and restores its folded summary", async (context) => {
  const layout = await readGoalTreeBrowserLayout();
  if (!layout) return context.skip("Headless Chrome is unavailable");
  assert.ok(layout.parentCollapsedLineCount > 1, `expected folded parent title to wrap, received ${layout.parentCollapsedLineCount} line`);
  assert.notEqual(layout.parentCollapsedProgressDisplay, "none");
  assert.equal(layout.parentExpandedWhiteSpace, "nowrap");
  assert.ok(
    layout.parentExpandedTitleHeight < layout.parentCollapsedTitleHeight,
    `expected expanded title (${layout.parentExpandedTitleHeight}px) to be shorter than folded title (${layout.parentCollapsedTitleHeight}px)`,
  );
  assert.equal(layout.parentExpandedProgressDisplay, "none");
  assert.ok(
    layout.parentExpandedRowHeight < layout.parentCollapsedRowHeight,
    `expected expanded row (${layout.parentExpandedRowHeight}px) to be shorter than folded row (${layout.parentCollapsedRowHeight}px)`,
  );
  assert.ok(layout.parentRestoredLineCount > 1);
  assert.notEqual(layout.parentRestoredProgressDisplay, "none");
  assert.ok(Math.abs(layout.parentRestoredRowHeight - layout.parentCollapsedRowHeight) <= 1);
});

test("Desktop workbench keeps stable Goal ids visible in the Goal Tree", () => {
  assert.match(WORKBENCH_STYLES, /\.tree-copy > small \{[^}]*display:\s*block/);
  assert.doesNotMatch(
    WORKBENCH_STYLES,
    /body\[data-desktop-shell="true"\] \.tree-copy small \{[^}]*display:\s*none/,
  );
});

test("desktop work tabs keep a readable width and scroll instead of overlapping", () => {
  assert.match(
    WORKBENCH_STYLES,
    /\.desktop-work-tabs \{[^}]*overflow-x: auto;/,
  );
  assert.match(
    WORKBENCH_STYLES,
    /\.desktop-work-tab \{[^}]*flex: 0 0 clamp\(132px, 16vw, 190px\);/,
  );
  assert.match(
    WORKBENCH_STYLES,
    /\.desktop-work-tab > \[role="tab"\] span \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/,
  );
  assert.match(
    WORKBENCH_CLIENT_SCRIPT,
    /const ensureActiveWorkTabVisible = \(\) => \{[\s\S]*activeTabShell[\s\S]*workTabs\.scrollLeft/,
  );
  assert.match(WORKBENCH_CLIENT_SCRIPT, /new ResizeObserver\(ensureActiveWorkTabVisible\)/);
  assert.match(WORKBENCH_CLIENT_SCRIPT, /persistWorkTabs\(\);\s*ensureActiveWorkTabVisible\(\);/);
});

test("desktop work tabs keep the active tab fully visible after restore and resize", async (context) => {
  const openTabs = ["goal-one", "goal-two", "goal-three", "goal-four"];
  const layout = await readDesktopWorkTabBrowserLayout(openTabs);
  if (!layout) return context.skip("Headless Chrome is unavailable");
  for (const [state, snapshot] of Object.entries(layout)) {
    assert.ok(snapshot.tabLeft >= snapshot.railLeft - 1, `${state}: active tab starts outside the rail: ${JSON.stringify(layout)}`);
    assert.ok(snapshot.tabRight <= snapshot.railRight + 1, `${state}: active tab ends outside the rail: ${JSON.stringify(layout)}`);
  }
  assert.equal(layout.initial.tabCount, 4);
  assert.ok(layout.initial.scrollWidth > layout.initial.railRight - layout.initial.railLeft);
  assert.ok(layout.initial.scrollLeft > 0, `restored trailing tab should scroll into view: ${JSON.stringify(layout)}`);
  assert.ok(layout.resized.scrollLeft >= layout.initial.scrollLeft, "narrower rail should preserve or advance the tab scroll");
});

test("Goal Tree uses compact Runtime references instead of long internal ids", () => {
  assert.equal(goalTreeReferenceLabel("cgs-g2a-opportunity-intelligence"), "G2A");
  assert.equal(goalTreeReferenceLabel("cgs-g2b-editorial-decision"), "G2B");
  assert.equal(goalTreeReferenceLabel("cgs-g12f-topic-analysis"), "G12F");
  assert.equal(goalTreeReferenceLabel("V1"), "V1");
  assert.equal(goalTreeReferenceLabel("draft-e5f42553-1111-2222-3333-444444444444"), null);
});

test("Goal Tree disambiguates Goals that share the same compact Runtime reference", () => {
  const labels = goalTreeReferenceLabels([
    "cgs-g2a-opportunity-intelligence",
    "cgs-g2g-ai-kol-quality-roster",
    "cgs-g2g-ai-kol-quality-roster-v2",
    "cgs-g2g-roster-schema",
    "cgs-g2g-roster-integration",
    "cgs-g2g-douyin-roster",
    "cgs-g2g-x-roster",
    "cgs-g2g-xiaohongshu-roster",
  ]);

  assert.equal(labels.get("cgs-g2a-opportunity-intelligence"), "G2A");
  assert.equal(labels.get("cgs-g2g-ai-kol-quality-roster"), "G2G");
  assert.equal(labels.get("cgs-g2g-ai-kol-quality-roster-v2"), "G2G/V2");
  assert.equal(labels.get("cgs-g2g-roster-schema"), "G2G/S");
  assert.equal(labels.get("cgs-g2g-roster-integration"), "G2G/I");
  assert.equal(labels.get("cgs-g2g-douyin-roster"), "G2G/D");
  assert.equal(labels.get("cgs-g2g-x-roster"), "G2G/X");
  assert.equal(labels.get("cgs-g2g-xiaohongshu-roster"), "G2G/XI");
  assert.equal(new Set(labels.values()).size, labels.size, "rendered Goal references must be unique");
});

test("completed Goal presentation closes criteria without inventing Evidence", () => {
  const item = {
    status: "satisfied",
    goal: {
      fulfillment_state: "satisfied",
      acceptance_criteria: [
        { criterion_id: "ROOT-C1" },
        { criterion_id: "ROOT-C2" },
      ],
    },
    passed_criteria: [],
  } as unknown as Parameters<typeof displayedPassedCriterionIds>[0];

  assert.deepEqual(displayedPassedCriterionIds(item), ["ROOT-C1", "ROOT-C2"]);
  assert.deepEqual(item.passed_criteria, [], "presentation must not fabricate canonical Evidence facts");

  item.status = "execution_pending";
  item.goal.fulfillment_state = "unmet";
  item.passed_criteria = ["ROOT-C1", "UNKNOWN"];
  assert.deepEqual(displayedPassedCriterionIds(item), ["ROOT-C1"]);
});

test("Web health identifies the process serving the response", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-work-web-health-"));
  const server = createMolisWorkWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const health = await (await webFetch(`http://127.0.0.1:${address.port}/health`)).json() as {
      status: string;
      process_id?: number;
      service_process_id?: number;
    };
    assert.equal(health.status, "ok");
    assert.equal(health.process_id, process.pid);
    assert.equal(health.service_process_id, process.pid);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(homeDirectory, { recursive: true, force: true });
  }
});

test("Web first-run onboarding can be skipped without creating a project or Runtime binding", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-work-web-project-empty-"));
  const server = createMolisWorkWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const root = await webFetch(`${origin}/`, { redirect: "manual" });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get("location"), "/onboarding");

    const onboarding = await (await webFetch(`${origin}/onboarding`)).text();
    assertInlineScriptsCompile(onboarding);
    assert.match(onboarding, /你希望我们一起做什么/);
    assert.doesNotMatch(onboarding, /onboarding-topology/);
    assert.match(onboarding, /这次先跳过/);
    assert.match(onboarding, /只把内容填进终端，等我自己发送/);
    assert.match(onboarding, /class="onboarding-stage"/);
    assert.match(onboarding, /class="onboarding-actions" aria-label="引导步骤导航"/);
    assert.match(onboarding, /data-onboarding-next-label/);
    assert.match(onboarding, /name="intent_frame"/);
    assert.match(onboarding, /data-onboarding-intent-trigger/);
    assert.match(onboarding, /role="listbox"/);
    assert.match(onboarding, /我想想清楚/);
    assert.match(onboarding, /onboarding-runtime/);
    assert.match(onboarding, /data-onboarding-step="4"/);
    assert.match(onboarding, /data-onboarding-runtime-frame/);
    assert.match(onboarding, /我们先把项目安排清楚/);
    assert.match(onboarding, /安排好了，进入 Molis Work/);

    const dismissed = await webFetch(`${origin}/api/onboarding/dismiss`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "first_run", user_confirmed: true }),
    });
    assert.equal(dismissed.status, 200);

    const projectIndex = await webFetch(`${origin}/`, { redirect: "manual" });
    assert.equal(projectIndex.status, 200);
    const page = await projectIndex.text();
    assert.match(page, /从一个真实项目开始/);
    assert.match(page, /开始建立第一个项目/);
    assert.match(page, /直接进入项目设置/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  try {
    assert.deepEqual(catalog.listProjects(), []);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), []);
  } finally {
    catalog.close();
  }
});

test("Web onboarding creates one real Project, root Draft Goal, and optional Workspace", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-work-web-onboarding-create-"));
  const workspaceDirectory = join(homeDirectory, "workspace");
  mkdirSync(workspaceDirectory);
  const server = createMolisWorkWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  let projectId = "";
  let goalId = "";
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    const invalid = await webFetch(`${origin}/api/onboarding/initialize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_name: "1234",
        outcome: "----",
        workspace_path: null,
        runtime_kind: null,
        user_confirmed: true,
      }),
    });
    assert.equal(invalid.status, 400);

    const invalidIntent = await webFetch(`${origin}/api/onboarding/initialize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_name: "真实首次项目",
        outcome: "让第一次使用 Molis Work 的人建立可以继续澄清的目标",
        intent_frame: "unknown",
        workspace_path: null,
        runtime_kind: null,
        user_confirmed: true,
      }),
    });
    assert.equal(invalidIntent.status, 400);

    const initialized = await webFetch(`${origin}/api/onboarding/initialize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project_name: "真实首次项目",
        outcome: "让第一次使用 Molis Work 的人建立可以继续澄清的目标",
        intent_frame: "diagnose_fix",
        workspace_path: workspaceDirectory,
        runtime_kind: null,
        user_confirmed: true,
      }),
    });
    assert.equal(initialized.status, 201);
    const payload = await initialized.json() as {
      project: { project_id: string };
      goal_id: string;
      goal_path: string;
      workspace: { canonical_path: string } | null;
      runtime_autofill: boolean;
    };
    projectId = payload.project.project_id;
    goalId = payload.goal_id;
    assert.match(payload.goal_path, new RegExp(`^/projects/${projectId}/goals/`));
    assert.equal(payload.workspace?.canonical_path, realpathSync(workspaceDirectory));
    assert.equal(payload.runtime_autofill, false);

    const status = await (await webFetch(`${origin}/api/onboarding/status`)).json() as {
      state: { first_run: string; completed_project_id: string };
      first_run_required: boolean;
    };
    assert.equal(status.state.first_run, "completed");
    assert.equal(status.state.completed_project_id, projectId);
    assert.equal(status.first_run_required, false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  try {
    const projects = catalog.listProjects();
    assert.equal(projects.length, 1);
    assert.equal(projects[0]?.project_id, projectId);
    assert.equal(projects[0]?.display_name, "真实首次项目");
    assert.deepEqual(catalog.listWorkspaceDirectory(projectId).map((item) => item.canonical_path), [realpathSync(workspaceDirectory)]);
    const project = catalog.getProject(projectId);
    const store = new LocalProjectDatabase(project.database_path);
    try {
      const goals = store.snapshot(project.board_id).goals;
      assert.equal(goals.length, 1);
      assert.equal(goals[0]?.goal_id, goalId);
      assert.equal(goals[0]?.definition_state, "draft");
      assert.equal(goals[0]?.decomposition_state, "abstract");
      assert.equal(goals[0]?.outcome, "让第一次使用 Molis Work 的人建立可以继续澄清的目标");
      assert.match(goals[0]?.business_logic ?? "", /work-diagnose-fix/);
    } finally {
      store.close();
    }
  } finally {
    catalog.close();
  }
});

test("Web update onboarding is shown once per installed version", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-work-web-onboarding-update-"));
  mkdirSync(join(homeDirectory, "config"), { recursive: true });
  writeFileSync(join(homeDirectory, "config", "installation.json"), JSON.stringify({
    installer: "molis-work-home-install-v1",
    version: "1.0.0",
    release_path: "releases/1.0.0",
  }));
  const server = createMolisWorkWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const created = await webFetch(`${origin}/api/settings/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: "已有项目", user_confirmed: true }),
    });
    assert.equal(created.status, 201);

    const firstUpdate = await webFetch(`${origin}/`, { redirect: "manual" });
    assert.equal(firstUpdate.status, 302);
    assert.equal(firstUpdate.headers.get("location"), "/onboarding?mode=update");
    const updatePage = await (await webFetch(`${origin}/onboarding?mode=update`)).text();
    assertInlineScriptsCompile(updatePage);
    assert.match(updatePage, /Molis Work 已更新 1\.0\.0/);

    const acknowledged = await webFetch(`${origin}/api/onboarding/dismiss`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "update", user_confirmed: true }),
    });
    assert.equal(acknowledged.status, 200);
    assert.equal((await webFetch(`${origin}/`, { redirect: "manual" })).status, 200);

    writeFileSync(join(homeDirectory, "config", "installation.json"), JSON.stringify({
      installer: "molis-work-home-install-v1",
      version: "1.1.0",
      release_path: "releases/1.1.0",
    }));
    const nextUpdate = await webFetch(`${origin}/`, { redirect: "manual" });
    assert.equal(nextUpdate.status, 302);
    assert.equal(nextUpdate.headers.get("location"), "/onboarding?mode=update");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Web command only starts from the project catalog", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "apps/desktop/launchers/web/server.ts", "--db", "/tmp/legacy-molis-work.db"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /只按项目启动/);
  assert.match(result.stderr, /--db 已不支持/);
});

test("Web command still starts when its entrypoint is reached through a symlink", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-web-entrypoint-"));
  const entrypoint = join(directory, "molis-work-web.ts");
  symlinkSync(join(process.cwd(), "apps/desktop/launchers/web/server.ts"), entrypoint);
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", entrypoint, "--db", "/tmp/legacy-molis-work.db"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /只按项目启动/);
  assert.match(result.stderr, /--db 已不支持/);
});

test("Web leaves an invalid legacy DB and the project catalog unchanged when migration fails", async () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-work-web-project-migration-failure-"));
  const invalidDatabasePath = join(homeDirectory, "invalid-molis-work.db");
  writeFileSync(invalidDatabasePath, "not a Molis Work SQLite database");
  const server = createMolisWorkWebServer({ homeDirectory });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await webFetch(`http://127.0.0.1:${address.port}/api/projects/migrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        legacy_database_path: invalidDatabasePath,
        user_confirmed: true,
      }),
    });
    assert.equal(response.status, 400);
    assert.match(await response.text(), /Molis Work DB|数据库|迁移/);
    assert.equal(existsSync(invalidDatabasePath), true);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }

  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  try {
    assert.deepEqual(catalog.listProjects(), []);
    assert.deepEqual(catalog.listRuntimeContextBindingEvents(), []);
  } finally {
    catalog.close();
  }
});

test("Web explains incomplete product decomposition and shows who owns each product path", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-web-incomplete-decomposition-"));
  const databasePath = join(directory, "molis-work.db");
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store);
  try {
    coordinator.initializeBoard({
      board_id: "web-decomposition-board",
      title: "Product Decomposition",
      actor_id: "web-user",
      idempotency_key: "web-decomposition-init",
    });
    assert.throws(
      () => coordinator.goalTreeSubmission.submitGoalTreeProposal({
        board_id: "web-decomposition-board",
        actor_id: "runtime-game-planner",
        root_goal_id: "web-footballnia",
        summary: "旧固定拆分/万能提案已退役，不能再从新结构入口落地。",
        items: [{
          item_id: "web-footballnia-parent",
          kind: "contract",
          operation: "update",
          payload: { goal_id: "web-footballnia", title: "交付完整可玩的 Footballnia" },
          source_refs: ["conversation://web-decomposition"],
          reason: "旧合同拆分",
          confidence: 1,
        }],
        idempotency_key: "web-decomposition-propose",
      }),
      (error: unknown) => error instanceof Error && (
        (error as { code?: string }).code === "goal_tree_proposal.kind_retired"
        || String(error).includes("只能是 goal")
      ),
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Web normal Tree excludes trashed Goals while the coordinator retains their facts", () => {
  const { databasePath } = webFixture();
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store);
  coordinator.goals.commands.createGoal(
    DEMO_BOARD_ID,
    {
      goal_id: "TRASHED-WEB",
      title: "不会出现在普通 Tree 的 Goal",
      outcome: "回收站 Goal 不干扰当前工作列表",
      why: "普通导航只应该展示可继续处理的工作",
      business_logic: "移入回收站会保留全部事实，但普通 Web Tree 和 Archive 都不显示它。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [
        {
          criterion_id: "trashed-web-criterion",
          statement: "普通 Tree 不显示回收站 Goal",
          decision_method: "automated_check",
          pass_condition: "Web view goals 与 archived_goals 都没有该 Goal",
        },
      ],
    },
    { actor_id: "test-user", idempotency_key: "create-trashed-web" },
  );
  coordinator.goals.lifecycle.setTrashed(
    DEMO_BOARD_ID,
    { goal_id: "TRASHED-WEB", trashed: true, reason: "验证正常 Web 读取过滤" },
    { actor_id: "test-user", idempotency_key: "trash-web-goal" },
  );
  const view = buildMolisWorkWebView(store, coordinator, {
    databasePath,
    boardId: DEMO_BOARD_ID,
    demo: true,
  });
  assert.equal(view.goals.some((item) => item.goal.goal_id === "TRASHED-WEB"), false);
  assert.equal(view.archived_goals.some((item) => item.goal.goal_id === "TRASHED-WEB"), false);
  assert.equal(view.trashed_goals.some((item) => item.goal.goal_id === "TRASHED-WEB"), true);
  assert.equal(store.snapshot(DEMO_BOARD_ID).goals.find((goal) => goal.goal_id === "TRASHED-WEB")?.trashed_at == null, false);
  assert.deepEqual(coordinator.listTrashedGoals(DEMO_BOARD_ID).map((goal) => goal.goal_id), ["AUTO-CONNECT", "TRASHED-WEB"]);
  store.close();
});
