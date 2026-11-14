import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureSystemAgentService, readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { openTestHome } from "./fixtures/test-home.js";
import { requiredHeadlessTestBrowser } from "./fixtures/dedicated-headless-browser.js";

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
      if (width === 390) assert.equal(await page.evaluate(`document.activeElement.matches(${JSON.stringify(detail)})`), true);
      await capture(`grants-${locale}-${width}-${theme}`);
      await page.click('[data-authorization-view="reviews"]');
      await selectProject();
      await page.wait(`document.querySelector(${JSON.stringify(list)})?.textContent.includes('Review a note title')`);
      await page.click(rows);
      assert.match(await page.evaluate<string>(`document.querySelector(${JSON.stringify(detail)})?.innerText`), locale === "en" ? /person|human/i : /本人|人工/);
      await capture(`source-${locale}-${width}-${theme}`);
      await page.evaluate("(() => { const select = document.querySelector('[data-authorization-project]'); select.value = ''; })()");
      await page.click('[data-authorization-view="grants"]');
      await page.wait(`!!document.querySelector(${JSON.stringify(rows)})`);
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
