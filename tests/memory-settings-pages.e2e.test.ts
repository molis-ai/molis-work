import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, characterOwner, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { ensureSystemAgentService, memoryRuntimePolicy, molisWorkHostProjectReference, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openPrologueMemoryAdoption } from "@molis-ai/molis-work-service-agent-host";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

const list = "[data-memory-test-active] [data-memory-list]", rows = `${list} [data-memory-id]`;
const ready = (page: ChromePage) => page.wait(`document.querySelector('${list}')?.getAttribute('aria-busy') === 'false' && document.querySelector('[data-memory-test-active] [data-memory-error]').hidden`);
const ids = (page: ChromePage) => page.evaluate<string[]>(`[...document.querySelectorAll('${rows}')].map(row => row.dataset.memoryId)`);

async function filter(page: ChromePage, name: string, value: string) {
  const picker = `[data-memory-test-active] .mw-select-picker:has([data-memory-filter="${name}"])`;
  await page.click(picker + " .mw-select-picker__trigger");
  await page.click(`.mw-select-picker__menu:popover-open [data-value="${value}"]`);
  await ready(page);
}

/** Before starting the Home owner, adopt a real historical row without inventing its classification. */
async function seedHistoricalProject(home: string) {
  const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "审校项目", actor_id: LOCAL_PERSON_ACTOR_ID }));
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
  const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
  const storageRoot = join(home, "agent-runtime"), owner = project.project_id;
  const storageScope = `owner.project-${encodeURIComponent(owner).replaceAll("%", "_")}`;
  const runtime = await createRuntime({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, host: createNodeHost({ storageRoot }) });
  const now = Date.now();
  try {
    await runtime.store.commit({ kind: "memories", id: `${storageScope}.historical.v1`, expectedVersion: 0,
      metadata: { scope: storageScope, rowId: "historical", version: 1, state: "active", shape: 2 },
      secureBody: new TextEncoder().encode(JSON.stringify({ id: "historical", scope: "project", owner, version: 1,
        text: "历史资料的分类尚待本人确认", origin: "历史导入", tags: [], tombstoned: false,
        meta: { kind: "convention", source: "imported" }, createdAtMs: now, updatedAtMs: now })) });
  } finally { await runtime.shutdown(); }
  const maintenance = await openPrologueMemoryAdoption({ appVersion: "1.0.0", storageRoot, scopes: [{ scope: "project", owner }], policy: memoryRuntimePolicy(() => undefined).policy });
  try { assert.equal((await maintenance.adopt({ kind: "memory", scope: "project", owner })).outcome, "completed"); }
  finally { await maintenance.close(); }
  return { ...project, reference: molisWorkHostProjectReference({ databasePath: project.database_path, projectId: owner }) };
}

// MEM-PAGE-01/02/03: real Home + Node storage + public Action/HTTP + production Workbench, no model configured.
test("nonempty memory settings page through authorized storage, preserve old decisions, and load pairs only on request", { timeout: 150_000 }, async t => {
  const executable = locateTestChrome(); assert.ok(executable, "Chrome is required for the nonempty settings journey");
  const home = await mkdtemp(join(tmpdir(), "memory-pages-home-"));
  const project = await seedHistoricalProject(home), env = await serveHomeRuntime(t, { homeDirectory: home });
  const client = bindActionClient(env.host.homeActionClient(), () => person(MEMORY_PERMISSIONS));
  const projectClient = bindActionClient(env.host.actionClient(project.reference), () => person(MEMORY_PERMISSIONS, project.project_id));
  const saved = [];
  for (const suffix of ["甲", "乙"]) {
    const result = await projectClient.invoke(memoryActions.write, { scope: "project", kind: "convention",
      text: `项目审校要逐条确认事实、来源、术语、标题、格式、交付日期和负责人，末尾保留核对说明${suffix}` }) as MemoryWriteResult;
    assert.ok(result.memory); saved.push(result.memory);
  }
  const prefix = `/projects/${project.project_id}`, upkeep = await env.request(prefix + "/api/memory/upkeep", { method: "POST", body: {} });
  const report = await upkeep.json() as { pairs: number; tidied: boolean };
  assert.equal(upkeep.status, 200, JSON.stringify(report)); assert.equal(report.pairs, 1); assert.equal(report.tidied, false);
  // Real wall-clock expiry happens after upkeep, so this active entry is displayed as expired, not auto-disabled.
  const expiry = Date.now() + 1_500;
  const expiring = await projectClient.invoke(memoryActions.write, { scope: "project", kind: "fact", text: "临时校样链接只保留到本次审阅结束", expires_at: new Date(expiry).toISOString() }) as MemoryWriteResult;
  assert.ok(expiring.memory);
  const system = ensureSystemAgentService(env.host, home); await system.ready;
  const memory = system.agentHost.adapter("prologue").memory!, ledger = openMemoryLedger({ homeDirectory: home });
  const caller: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, consumer: "ui", person: true,
    current_scene: "common", purpose: "management", character: { id: "reviewer", title: "资料审校员" } };
  let pausedId: string;
  try {
    const backend = prologueMemoryBackend(async () => memory), service = new MemoryService({ ledger, backend });
    const role = await service.write(caller, { scope: "character", kind: "convention", text: "引用出处缺失时先暂停发布核对" });
    assert.ok(role.memory); pausedId = role.memory.memory_id;
    await backend.withCaller(caller).pause({ scope: "character", owner: characterOwner(project.project_id, "reviewer"), memory_id: pausedId,
      expected_version: role.memory.version, operation_id: "pause-reviewer", reason: "等待引用来源确认" });
  } finally { ledger.close(); }
  await new Promise(resolve => setTimeout(resolve, Math.max(0, expiry - Date.now() + 10)));
  assert.ok(Date.now() >= expiry, "the production Host clock has crossed the stored expiry before observing the page");
  const personal: string[] = [];
  for (let index = 0; index < 43; index++) {
    const result = await client.invoke(memoryActions.write, { scope: "personal", kind: index === 0 ? "preference" : "convention",
      text: index === 0 ? "周报采用要点，保留风险与后续动作" : `资料编号 ${index} 的归档记录需要保留原始出处和更新时间` }) as MemoryWriteResult;
    assert.ok(result.memory); personal.push(result.memory.memory_id);
  }
  let fullLists = 0, pairReads = 0;
  const oldList = MemoryService.prototype.list, oldPairs = MemoryService.prototype.pairs;
  t.mock.method(MemoryService.prototype, "list", function(this: MemoryService, ...args: Parameters<MemoryService["list"]>) { fullLists++; return oldList.apply(this, args); });
  t.mock.method(MemoryService.prototype, "pairs", function(this: MemoryService, ...args: Parameters<MemoryService["pairs"]>) { pairReads++; return oldPairs.apply(this, args); });
  const directory = await mkdtemp(join(tmpdir(), "memory-pages-browser-"));
  const browser = await ChromeHarness.start(directory, { executable });
  try {
    const page = await browser.page(); await page.viewport(1440, 960);
    let visit = 0;
    const navigate = async (path: string) => {
      // Top-level settings addresses redirect into the workbench, which consumes settingsPath.
      // Mark the old document so its still-visible settings cannot satisfy the next arrival.
      await page.evaluate(`document.documentElement.dataset.memoryTestOld = '${++visit}'`);
      await page.command("Page.navigate", { url: env.origin + path });
      const target = path.endsWith("?settings=assistant") ? `[data-assistant-settings][data-project="${project.project_id}"] [data-assistant-memory-summary]`
        : `[data-memory-settings][data-memory-scope="${path.startsWith("/projects/") ? "project" : "personal"}"]`;
      await page.wait(`document.documentElement && document.documentElement.dataset.memoryTestOld !== '${visit}' && document.readyState === 'complete' && document.querySelector(${JSON.stringify(target)})?.getBoundingClientRect().height > 0`,
        { describe: "JSON.stringify({url:location.href,ready:document.readyState,settings:document.querySelector('[data-settings-stage-body]')?.textContent.slice(0,300)})" });
      if (path.endsWith("/memory")) {
        assert.equal(await page.evaluate(`(() => {
          const roots = [...document.querySelectorAll('[data-memory-settings]')].filter(root => root.checkVisibility());
          if (roots.length !== 1 || !roots[0].matches(${JSON.stringify(target)})) return false;
          roots[0].setAttribute('data-memory-test-active', ''); return true;
        })()`), true, "exactly the requested Memory scope is visible; hidden shell caches are not this page");
      }
    };
    await navigate("/settings/memory"); await ready(page);
    const first = await ids(page); assert.equal(first.length, 40);
    assert.match(await page.evaluate<string>("document.querySelector('[data-memory-test-active] [data-memory-summary]').textContent"), /总数未知/);
    await page.click("[data-memory-test-active] [data-memory-next]"); await ready(page);
    const last = await ids(page); assert.equal(last.length, 3);
    assert.deepEqual([...first, ...last].sort(), [...personal].sort());
    assert.match(await page.evaluate<string>("document.querySelector('[data-memory-test-active] [data-memory-summary]').textContent"), /总数未知/, "last page cannot claim a snapshot total");
    await page.click("[data-memory-test-active] [data-memory-previous]"); await ready(page); assert.deepEqual(await ids(page), first);
    await page.fill("[data-memory-test-active] [data-memory-filter=query]", "周报采用要点"); await ready(page);
    for (let part = 0; !(await ids(page)).length && part < 2; part++) { await page.click("[data-memory-test-active] [data-memory-next]"); await ready(page); }
    assert.deepEqual(await ids(page), [personal[0]]);
    await page.fill("[data-memory-test-active] [data-memory-filter=query]", ""); await ready(page);
    await filter(page, "kind", "fact");
    assert.equal((await ids(page)).length, 0);
    await filter(page, "kind", "");
    assert.equal((await ids(page)).length, 40);
    assert.equal(fullLists, 0); assert.equal(pairReads, 0, "paging/filtering must not resolve pending pairs behind the page");

    const shots = reviewEvidenceUrl("memory-management-pages/"); await mkdir(shots, { recursive: true });
    for (const locale of ["zh", "en"]) for (const [width, theme] of [[1440, "light"], [1024, "dark"], [390, "light"]] as const) {
      await page.command("Network.setCookie", { name: "molis_work_locale", value: locale, url: env.origin, path: "/" });
      await page.viewport(width, 960); await page.evaluate(`localStorage.setItem('molis-work:theme', '${theme}')`);
      await navigate("/settings/memory"); await ready(page);
      assert.equal((await ids(page)).length, 40);
      assert.equal(await page.evaluate("document.documentElement.dataset.theme"), theme);
      assert.equal(await page.evaluate("document.querySelector('[data-memory-test-active] #memory-title').textContent"), locale === "zh" ? "记忆" : "Memory");
      await page.evaluate("document.querySelector('[data-memory-test-active] .memory-items').scrollIntoView({block:'start',behavior:'instant'})");
      assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.settings-content')].every(node => node.scrollWidth <= node.clientWidth + 1)"), true, `${locale}/${width}: page and filters fit`);
      await page.screenshot(fileURLToPath(new URL(`${locale}-${width}-${theme}.png`, shots)));
    }
    await page.command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: env.origin, path: "/" });
    await page.viewport(1440, 960);
    await navigate(prefix + "/settings/memory"); await ready(page);
    assert.equal(await page.evaluate(`[...document.querySelectorAll('[data-memory-scope="personal"] [data-memory-id]')].filter(row => row.checkVisibility()).length`), 0,
      "the shell's cached personal rows are not visible in project settings");
    const projectIds = [...saved.map(entry => entry.memory_id), "historical", expiring.memory.memory_id].sort();
    assert.deepEqual((await ids(page)).sort(), projectIds);
    const historical = '[data-memory-test-active] [data-memory-id="historical"]', expired = `[data-memory-test-active] [data-memory-id="${expiring.memory.memory_id}"]`;
    assert.match(await page.evaluate<string>(`document.querySelector('${historical} .memory-meta').textContent`), /未归类/);
    assert.match(await page.evaluate<string>(`document.querySelector('${expired} .memory-meta').textContent`), /已到期/);
    assert.equal(await page.evaluate(`document.querySelector('${expired} [data-mw-state]') === null`), true, "expired active entry must not be relabelled disabled");
    await filter(page, "scene", "unclassified"); assert.deepEqual(await ids(page), ["historical"]);
    await filter(page, "scene", "common"); assert.equal((await ids(page)).includes("historical"), false);
    await filter(page, "scene", "");
    await filter(page, "source", "imported"); assert.deepEqual(await ids(page), ["historical"]);
    await filter(page, "source", "");
    await filter(page, "lifecycle", "short-term"); assert.deepEqual(await ids(page), [expiring.memory.memory_id]);
    await filter(page, "lifecycle", "");
    await filter(page, "expired", "true"); assert.deepEqual(await ids(page), [expiring.memory.memory_id]);
    await filter(page, "expired", "");
    await page.click("[data-memory-test-active] [data-memory-next]"); await ready(page); assert.deepEqual(await ids(page), [pausedId]);
    const paused = `[data-memory-test-active] [data-memory-id="${pausedId}"]`;
    assert.match(await page.evaluate<string>(`document.querySelector('${paused} .memory-meta').textContent`), /资料审校员/);
    assert.equal(await page.evaluate(`document.querySelector('${paused} [data-mw-state]').dataset.mwState`), "paused");
    assert.match(await page.evaluate<string>(`document.querySelector('${paused} [data-mw-state]').textContent`), /已暂停.*等待引用来源确认/);
    await page.evaluate(`document.querySelector('${paused}').scrollIntoView({block:'center',behavior:'instant'})`);
    await page.screenshot(fileURLToPath(new URL("zh-project-paused-character.png", shots)));
    await filter(page, "state", "paused");
    assert.deepEqual(await ids(page), [], "the project owner has no paused matches but its character owner remains");
    assert.match(await page.evaluate<string>("document.querySelector('[data-memory-test-active] [data-memory-list]').textContent"), /尚未查完/);
    assert.equal(await page.evaluate("document.querySelector('[data-memory-test-active] [data-memory-next]').textContent"), "继续查找");
    await page.click("[data-memory-test-active] [data-memory-next]"); await ready(page); assert.deepEqual(await ids(page), [pausedId]);
    await filter(page, "state", ""); assert.deepEqual((await ids(page)).sort(), projectIds);
    await page.screenshot(fileURLToPath(new URL("zh-project-expired-unclassified.png", shots)));
    assert.equal(pairReads, 0, "a real pending pair is not read by overview");
    assert.equal(await page.evaluate("document.querySelectorAll('[data-memory-test-active] .memory-row--pair').length"), 0);
    await page.click("[data-memory-test-active] [data-memory-pairs-read]"); await page.wait("document.querySelector('[data-memory-test-active] .memory-row--pair')");
    assert.equal(pairReads, 1);
    await page.fill("[data-memory-test-active] [data-memory-filter=query]", "审校"); await ready(page); assert.equal(pairReads, 1);
    await page.click("[data-memory-test-active] .memory-row--pair .memory-actions button");
    await page.wait("document.querySelector('[data-memory-test-active] [data-memory-pairs]').textContent.includes('没有需要处理的')");
    assert.equal(pairReads, 2, "the chosen open section refreshes after resolving, not on ordinary paging");
    const chosen = `[data-memory-test-active] [data-memory-id="${saved[0]!.memory_id}"]`;
    await page.click(chosen + " button[aria-label^=修改]"); await page.fill(chosen + " textarea", "审校完成后保留准确的修改记录");
    await page.click(chosen + " button[type=submit]"); await ready(page);
    await page.wait(`document.querySelector('${chosen} .memory-text')?.textContent === '审校完成后保留准确的修改记录'`);
    assert.equal(pairReads, 3);
    // Assistant is a global settings section; the workbench entry supplies its current project context.
    await navigate(prefix + "/?settings=assistant");
    const assistantSummary = `[data-assistant-settings][data-project="${project.project_id}"] [data-assistant-memory-summary]`;
    await page.wait(`document.querySelector('${assistantSummary}')?.textContent.includes('总数未知')`);
    assert.match(await page.evaluate<string>(`document.querySelector('${assistantSummary}').textContent`), /这个项目的记忆 总数未知/, "project plus character owners cannot claim a combined exact total");
    assert.equal(pairReads, 3, "Assistant summary also uses bounded overview and leaves pairs unread");
    assert.equal(fullLists, 0);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});
