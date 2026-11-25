import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureSystemAgentService, readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { PAGES_PLUGIN_ID, pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { openWork, putInput, seedWork, waitWork } from "./fixtures/assistant-send-journey.js";
import { assistantTextModel } from "./fixtures/assistant-text-model.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openTestHome } from "./fixtures/test-home.js";
import { requiredHeadlessTestBrowser } from "./fixtures/dedicated-headless-browser.js";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";

test("H1/APR-12: the authorization manager shows the original source, revokes the original grant, and fits at all agreed sizes", { timeout: 110_000 }, async t => {
  const f = await openTestHome(t), project = await f.createProject("Permission browser project", ["todo"]);
  const capability = await f.web.get<{ capabilities: Array<{ capability_id: string; version: number; provider_id: string; expected: string }> }>(
    `/projects/${project.project_id}/api/assistant/capabilities`);
  const { capability_id, version, provider_id } = capability.capabilities.find(row => row.capability_id === "todo.items.create")!;
  await f.web.post("/api/settings/mcp/actions", { capability_id, version, provider_id, client_id: "runtime:browser-authorization",
    project_id: null, enabled: true, expected: { expected_absent: true } });
  const { agentHost } = ensureSystemAgentService(f.host, f.home);
  await ensureSystemAgentService(f.host, f.home).mcpLibrary();
  const queue = agentHost.reviews, reviewId = "authorization-manager-browser-review";
  const review = queue.request({ reference: { owner: { kind: "agent-review", project_id: project.project_id, plugin_id: "fixture.authorization",
    install_id: "original-install" }, id: reviewId, version: "one" }, review_id: reviewId, project_id: project.project_id,
    plugin_id: "fixture.authorization", run: { session_id: "original-session", run_id: "original-run" },
    kind: "tool-operation", document: { kind: "tool-operation", tool: "fixture.note", summary: "Review a note title", fields: [] },
    requested_at: new Date().toISOString(), expires_at: null });
  queue.registerDecisionHandler(reviewId, async (_input, commit) => commit(), async () => () => true);
  await queue.respond({ review_id: reviewId, version: review.reference.version, decision: "approve", actor_id: LOCAL_PERSON_ACTOR_ID });

  const profile = join(f.home, "authorization-browser"); await mkdir(profile);
  const browser = await ChromeHarness.start(profile, { executable: requiredHeadlessTestBrowser() });
  t.after(() => browser.close());
  const page = await browser.page(), pagePath = "/settings/authorizations";
  const list = "[data-authorization-list]", detail = "[data-authorization-detail]", rows = list + " .authorization-row";
  const go = async (path: string) => {
    await page.evaluate("globalThis.previousAuthorizationPage = true");
    await page.command("Page.navigate", { url: f.origin + path });
    await page.wait("!globalThis.previousAuthorizationPage && document.readyState === 'complete'");
  };
  const selectProject = async () => {
    await page.evaluate(`(() => { const select = document.querySelector('[data-authorization-project]'); select.value = ${JSON.stringify(project.project_id)};
      select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  };
  const shots = join(process.cwd(), ".impeccable", "qa", "review", "authorization-manager");
  await mkdir(shots, { recursive: true });
  const capture = async (name: string) => {
    assert.equal(await page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"), true, name);
    const shot = await page.command<{ data: string }>("Page.captureScreenshot", { format: "png" });
    await writeFile(join(shots, name + ".png"), Buffer.from(shot.data, "base64"));
  };
  for (const locale of ["zh", "en"]) {
    await go(`/locale?lang=${locale}&next=${encodeURIComponent(pagePath)}`);
    await page.wait(`!!document.querySelector(${JSON.stringify(rows)})`);
    for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
      await page.command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
      await page.wait(`getComputedStyle(document.body).colorScheme.includes(${JSON.stringify(theme)})`);
      await page.click(rows);
      await page.wait(`!!document.querySelector(${JSON.stringify(detail + " h2")})`);
      assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(rows)})?.getAttribute("aria-current")`), "true");
      assert.equal(await page.evaluate("document.querySelectorAll('.authorization-tools [data-mw-select-picker]').length"), 3);
      assert.doesNotMatch(await page.evaluate<string>(`document.querySelector(${JSON.stringify(rows + " strong")})?.textContent ?? ""`), /^todo\.items\.create$/);
      if (width === 1440) {
        const spread = await page.evaluate<number>(`(() => {
          const visible = [...document.querySelector('.authorization-tools').children].filter(el => el.getClientRects().length > 0);
          const mids = visible.map(el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
          return Math.max(...mids) - Math.min(...mids);
        })()`);
        assert.ok(spread < 8, `toolbar controls sit on one row at 1440px (got delta ${spread})`);
      }
      if (width === 390) assert.equal(await page.evaluate(`document.activeElement.matches(${JSON.stringify(detail)})`), true);
      await capture(`grants-${locale}-${width}-${theme}`);
      await page.click('[data-authorization-view="reviews"]');
      assert.equal(await page.evaluate("document.querySelector('.authorization-owner-select')?.getClientRects().length ?? 0"), 0);
      await page.wait(`!document.querySelector('[data-authorization-list][aria-busy]') && document.querySelector(${JSON.stringify(list)})?.textContent.includes('Review a note title')`);
      await selectProject();
      await page.wait(`!document.querySelector('[data-authorization-list][aria-busy]') && document.querySelector(${JSON.stringify(list)})?.textContent.includes('Review a note title')`);
      await page.click(rows);
      const reviewDetailText = await page.evaluate<string>(`document.querySelector(${JSON.stringify(detail)})?.innerText ?? ""`);
      assert.match(reviewDetailText, locale === "en" ? /person|human/i : /本人|人工/);
      assert.doesNotMatch(reviewDetailText, /local:person|io\.molis\.work\./);
      await capture(`source-${locale}-${width}-${theme}`);
      await page.evaluate("(() => { const select = document.querySelector('[data-authorization-project]'); select.value = ''; })()");
      await page.click('[data-authorization-view="grants"]');
      await page.wait(`!document.querySelector('[data-authorization-list][aria-busy]') && !!document.querySelector(${JSON.stringify(rows)})`);
    }
  }

  await page.click(rows);
  await page.wait(`!!document.querySelector(${JSON.stringify(detail + " button.mw-btn--danger-outline")})`);
  await page.click(detail + " button.mw-btn--danger-outline");
  await page.wait(`[...document.querySelectorAll(${JSON.stringify(detail + " button.mw-btn--danger-outline")})].some(button => !button.hidden)`);
  await page.click(detail + " button.mw-btn--danger-outline:not([hidden])");
  await page.wait(`/revoked|withdrawn/i.test(document.querySelector(${JSON.stringify(detail)})?.textContent ?? "")`);
  assert.equal((await readMcpToolPreference(f.home)).action_grants.find(row => row.client_id === "runtime:browser-authorization")?.enabled, false);
});

test("H1/APR-11: choose Pages permissions, narrow them in the manager, and revoke the remaining scope", { timeout: 240_000 }, async t => {
  let model!: Awaited<ReturnType<typeof assistantTextModel>>;
  const browser = await openGoalBrowser(t, "user", undefined, undefined, undefined, undefined, {
    prepareHome: async home => { model = await assistantTextModel(t, home, "准备好了。"); model.finish(); },
  });
  if (!browser) return;
  const { origin, projectId, homeDirectory, click, evaluate, waitFor } = browser;
  assert.ok(projectId);
  const withPages = <T>(read: (store: ReturnType<typeof openPagesStore>) => T): T => {
    const store = openPagesStore(homeDirectory, projectId);
    try { return read(store); } finally { store.close(); }
  };
  const { document, folder } = withPages(store => ({
    document: store.create({ title: "权限测试文档" }),
    folder: store.createFolder({ title: "原计划移入的目录" }),
  }));
  const current = () => withPages(store => store.get(document.id));
  const projectPath = `/projects/${projectId}/`;
  const go = (path: string) => browser.navigate(() => browser.command("Page.navigate", { url: origin + path }, browser.sessionId));
  await browser.setViewport(1440, 960);
  await go(`/locale?lang=zh&next=${encodeURIComponent(projectPath)}`);
  const workId = await seedWork(browser, "按有限权限整理项目文档");
  await openWork(browser, workId);
  const action = { capability_id: pagesActions.update.capability_id, version: pagesActions.update.version, provider_id: PAGES_PLUGIN_ID };
  const send = async (text: string, fields: Record<string, unknown>) => {
    model.change(action, { id: document.id, expected_version: current().version, ...fields });
    await putInput(browser, text);
    await click("[data-assistant-composer] [data-composer-send]");
  };
  const reject = async () => {
    await waitFor("!!document.querySelector('[data-review] [data-assistant-decision=reject]')");
    await click("[data-review] [data-assistant-decision=reject]");
    await waitWork(browser, workId, view => view.work.state === "completed" && view.reviews.length === 0);
  };

  await send("修改正文并移到目录", { markdown: "原提案保持待审", folder_id: folder.id });
  const choose = "[data-review] [data-assistant-permission-open]";
  await waitFor(`!!document.querySelector(${JSON.stringify(choose)})`, 15_000);
  await click(choose);
  const chooser = "[data-assistant-permission-dialog]";
  await waitFor(`document.querySelector('${chooser}').open && (!document.querySelector('${chooser} [data-permission-status]').textContent || !document.querySelector('${chooser} [data-permission-error]').hidden)`);
  const chosen = await evaluate<{ operations: number; message: string }>(`(() => { const dialog=document.querySelector('${chooser}');
    return { operations:dialog.querySelectorAll('[data-permission-scope] input:checked').length, message:dialog.innerText }; })()`);
  assert.equal(chosen.operations, 2, chosen.message);
  const presented = await evaluate<string>(`document.querySelector('${chooser} [data-permission-scope]').textContent`);
  assert.match(presented, /编辑文档/);
  assert.match(presented, /移动文档/);
  assert.match(presented, /权限测试文档/);
  assert.match(presented, /原计划移入的目录/);
  await click(chooser + " [data-permission-save]");
  await waitFor(`document.querySelector('${chooser} [data-permission-status]').textContent.includes('权限已保存')`);
  await click(chooser + " [data-dialog-close]");
  await waitWork(browser, workId, view => view.reviews.length === 0 && view.work.state !== "waiting-review");
  assert.deepEqual(current(), document, "saving future scope leaves the pending proposal unapplied");

  const detail = "[data-authorization-detail]", row = "[data-authorization-list] [data-authorization-row^='[\"work-delegation\",']";
  const operationCheckboxes = detail + " .authorization-operation > label > input";
  const labels = () => evaluate<string[]>(`[...document.querySelectorAll(${JSON.stringify(operationCheckboxes)})].map(input => input.labels[0].textContent.trim())`);
  const openManager = async (language?: "zh" | "en") => {
    const path = `/settings/authorizations?project=${encodeURIComponent(projectId)}`;
    await go(language ? `/locale?lang=${language}&next=${encodeURIComponent(path)}` : path);
    await waitFor(`!!document.querySelector(${JSON.stringify(row)})`);
    assert.equal(await evaluate("document.querySelector('[data-authorization-project]')?.value"), projectId);
    await click(row);
  };
  await openManager("en");
  await waitFor(`document.querySelectorAll('${operationCheckboxes}').length === 2`);
  assert.deepEqual(await labels(), ["Edit documents", "Move documents"]);
  assert.match(await evaluate<string>(`document.querySelector('${detail}')?.innerText ?? ""`), /Assistant/);
  assert.doesNotMatch(await evaluate<string>(`document.querySelector('${detail}')?.innerText ?? ""`), /助理|local:person|io\.molis\.work\./);
  await openManager("zh");
  await waitFor(`document.querySelectorAll('${operationCheckboxes}').length === 2`);
  assert.deepEqual(await labels(), ["编辑文档", "移动文档"]);
  assert.match(await evaluate<string>(`document.querySelector('${detail}')?.innerText ?? ""`), /助理/);
  const narrow = detail + " .authorization-actions > button:first-of-type";
  assert.equal(await evaluate(`document.querySelector('${narrow}').disabled`), true);
  await click(detail + " .authorization-operation:nth-of-type(2) > label > input");
  assert.equal(await evaluate(`document.querySelector('${narrow}').disabled`), false);
  assert.equal(await evaluate(`document.querySelector('${narrow}').textContent`), "保存收窄");
  await click(narrow);
  await waitFor(`document.querySelector('${detail} [data-authorization-status]').textContent.includes('权限已更新')`);
  await openManager();
  await waitFor(`document.querySelectorAll('${operationCheckboxes}').length === 1`);
  assert.deepEqual(await labels(), ["编辑文档"]);

  await go(projectPath);
  await openWork(browser, workId);
  await send("只编辑原文稿的正文", { markdown: "收窄后仍可编辑" });
  await waitWork(browser, workId, view => view.work.state === "completed" && current().version === document.version + 1);
  const edited = current();
  assert.match(JSON.stringify(edited.body), /收窄后仍可编辑/);
  assert.equal(edited.folder_id, document.folder_id);
  await send("移到原计划的目录", { folder_id: folder.id });
  await waitFor("!!document.querySelector('[data-review] [data-assistant-decision=approve]')", 15_000);
  assert.deepEqual(current(), edited, "the removed move operation remains pending");
  await reject();
  assert.deepEqual(current(), edited);

  await openManager();
  await waitFor(`document.querySelectorAll('${operationCheckboxes}').length === 1`);
  await click(detail + " .authorization-actions > button.mw-btn--danger-outline");
  await click(detail + " .authorization-confirm button.mw-btn--danger-outline");
  await waitFor(`document.querySelector(${JSON.stringify(row)})?.textContent.includes('已撤销')`);
  await go(projectPath);
  await openWork(browser, workId);
  await send("再次编辑正文", { markdown: "撤销后必须先审批" });
  await waitFor("!!document.querySelector('[data-review] [data-assistant-decision=approve]')", 15_000);
  assert.deepEqual(current(), edited, "the revoked edit cannot write before a new decision");
  await reject();
  assert.deepEqual(current(), edited);
});
