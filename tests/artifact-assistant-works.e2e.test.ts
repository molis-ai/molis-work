import assert from "node:assert/strict";
import test from "node:test";
import { openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

// 「被谁引用」 lists the Assistant's works on a 成果 version (artifact-positioning 五.1), next to the Goals, and opens them.
test("a 成果 version lists the Assistant work that started from it, and opens that work in the Assistant", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const { command, sessionId, evaluate, waitFor, navigate, store, projectId } = b;
  const library = openProjectVersionStores(store);
  library.artifacts.commands.registerVersion({ project_id: projectId!, actor_id: "web-user", artifact_id: "pages-brief", version: 1,
    artifact_type_id: "io.molis.work.pages.document", schema_version: 1,
    producer: { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
    content: { kind: "inline", payload: { title: "需求说明", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "范围与验收" }] }] } } },
    ...pinnedArtifact("需求说明", { kind: "pages_document", id: "brief" }, "1") });
  const version = `/projects/${projectId}/artifacts/pages-brief/versions/1`;
  await navigate(() => command("Page.navigate", { url: `${b.origin}${version}` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-artifact-links]'))", 15_000);
  await waitFor("document.querySelector('[data-artifact-no-references]')?.hidden === false", 15_000);
  // No work refers to it yet: the list stays out of the way.
  assert.equal(await evaluate("document.querySelector('[data-artifact-works]').hidden"), true);
  // The version is named every way a work can hold it: by its subject (side panel, search) and by its tab's path, with the
  // project's prefix when the tab came from a direct link.
  assert.deepEqual(await evaluate("JSON.parse(document.querySelector('[data-artifact-works]').dataset.artifactWorks)"),
    [JSON.stringify(["pages-brief", 1]), "/artifacts/pages-brief/versions/1", version]);
  // The Assistant names the open version by its title, not its address; only on show, it is offered, not added (context-program §21.5).
  await evaluate("document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: {} }))");
  await waitFor("(document.querySelector('[data-assistant-context-strip]:not([hidden]) .is-optional')?.textContent || '').includes('正在看：需求说明没加入')", 10_000);

  // QRF-06: the active Pages reader actually fails on its stored document. All other sources are empty.
  const { document: citing } = await b.web.post<{ document: { id: string } }>(`/projects/${projectId}/api/plugins/io.molis.work.pages/pages`, {
    title: "引用需求的周报", markdown: `本周见[需求说明](${b.origin}${version})。`,
  });
  const pages = openHomeSqliteDatabase(b.homeDirectory, "pages");
  t.after(() => pages.close());
  const original = String(pages.prepare("SELECT body_json FROM pages WHERE id = ?").get(citing.id)!.body_json);
  const saveBody = (value: string) => pages.prepare("UPDATE pages SET body_json = ? WHERE id = ?").run(value, citing.id);
  const pagesLink = await fetch(b.origin + version, { headers: { "x-molis-work-fragment": "artifact-workbench" } });
  assert.ok((await pagesLink.text()).includes(`data-workbench-item-id="${citing.id}"`), "the stored document links to this exact version before the fault");
  saveBody("{");
  await navigate(() => command("Page.navigate", { url: `${b.origin}${version}` }, sessionId));
  await waitFor("document.querySelector('[data-artifact-works]')?.dataset.complete === 'true'");
  assert.ok(await evaluate("Boolean(document.querySelector('[data-artifact-reference-retry]'))"), "the active Pages source can be retried");
  assert.equal(await evaluate("document.querySelector('[data-artifact-no-references]')?.hidden"), true);
  await b.web.post(`/projects/${projectId}/api/plugins/io.molis.work.goals/goals/V1/deliverables`, { reference: { artifact_id: "pages-brief", version: 1 }, delivered: true });

  // The person asks the Assistant while this version's tab is open (here from a direct link, so the tab holds the prefixed
  // address): the work starts from it. Without a model the round does not run, but the work and where it started are kept.
  await evaluate(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/send`)}, { method: "POST",
    headers: { ...(globalThis.molisWorkControlHeaders?.() || {}), "content-type": "application/json" },
    body: JSON.stringify({ text: "把需求说明整理成清单", request_id: "artifact-works-1",
      context: { source: { surface: "artifacts", title: "成果" }, object: { kind: "artifact", id: ${JSON.stringify(version)}, title: "需求说明" } } }) }).then(r => r.status)`);
  const related = await evaluate<Array<{ work_id: string; relation: string }>>(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/related?kind=artifact&id=${encodeURIComponent(version)}`)}).then(r => r.json()).then(body => body.works)`);
  assert.equal(related.length, 1);
  assert.equal(related[0]!.relation, "origin");

  await command("Page.addScriptToEvaluateOnNewDocument", { source: `{
    const get = window.fetch.bind(window); let blocked = true;
    window.fetch = (input, init) => {
      const url = new URL(String(input), location.href);
      if (blocked && url.pathname.endsWith("/assistant/related") && url.searchParams.get("id").startsWith("[")) {
        blocked = false; return Promise.resolve(Response.json({}, {status:503}));
      }
      return get(input, init);
    };
  }` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${b.origin}${version}` }, sessionId));
  await waitFor("document.querySelector('[data-artifact-works-status] button') && document.querySelector('[data-artifact-works]')?.hidden === false", 15_000);
  assert.equal(await evaluate("document.querySelector('[data-artifact-no-references]')?.hidden"), true);
  // QRF-06: another window changes the language while a partial reference result is still visible.
  await evaluate(`(async () => {
    await molisWorkRequest("/api/ui/locale", { control: true, body: { preference: "ja" } });
    const changes = new BroadcastChannel("molis-work-ui-language");
    changes.postMessage(null);
    changes.close();
  })()`);
  await waitFor("document.documentElement.lang === 'ja' && document.querySelector('[data-artifact-works-status]')?.textContent.includes('一部を読み込めませんでした')", 20_000);
  assert.match(await evaluate<string>("document.querySelector('[data-artifact-source-error]').textContent"), /Pagesからの参照を読み込めませんでした/);
  assert.match(await evaluate<string>("document.querySelector('[data-artifact-works]').textContent"), /把需求说明整理成清单[\s\S]*このバージョンから開始/);
  await b.click("[data-artifact-works-status] button");
  await waitFor("document.querySelector('[data-artifact-works]')?.dataset.complete === 'true'");
  await waitFor("document.querySelector('[data-artifact-works]')?.hidden === false", 15_000);
  assert.equal(await evaluate("document.querySelectorAll('[data-artifact-open-work]').length"), 1);
  assert.match(await evaluate<string>("document.querySelector('[data-artifact-works]').innerText"), /把需求说明整理成清单[\s\S]*このバージョンから開始/);

  // A Pages-only retry preserves the Assistant and ledger DOM, reads the real repaired document in Japanese,
  // and leaves keyboard focus on its newly available open action.
  await evaluate(`(window.keptReferences = [document.querySelector('[data-artifact-open-work]'), document.querySelector('[data-artifact-linked-plugin] a')])`);
  assert.ok(await evaluate("window.keptReferences.every(Boolean)"));
  saveBody(original);
  await evaluate("document.querySelector('[data-artifact-reference-retry]').focus(); document.activeElement.click()");
  await waitFor(`document.querySelector('[data-artifact-referrers] a')?.dataset.workbenchItemId === ${JSON.stringify(citing.id)}`);
  assert.equal(await evaluate("document.activeElement === document.querySelector('[data-artifact-referrers] a')"), true);
  assert.ok(await evaluate("window.keptReferences.every(row => row.isConnected)"));
  assert.equal(await evaluate("document.querySelector('[data-artifact-works-status]').textContent"), "");
  assert.equal(await evaluate("document.querySelector('[data-artifact-no-references]')?.hidden"), true);

  // Opening it shows that work in the Assistant.
  await evaluate("document.querySelector('[data-artifact-open-work]').click()");
  await waitFor(`document.querySelector('[data-assistant-work-title]')?.textContent?.includes('把需求说明整理成清单')`, 10_000);
  assert.equal(await evaluate("document.querySelector('[data-artifact-open-work]').dataset.artifactOpenWork"), related[0]!.work_id);
  // Hold a real Pages retry after the server has answered, then leave the version and focus the list.
  saveBody("{");
  await navigate(() => command("Page.navigate", { url: `${b.origin}${version}` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-artifact-reference-retry]'))");
  saveBody(original);
  await evaluate(`(() => {
    const get = window.fetch.bind(window);
    window.referenceRequests = 0;
    window.fetch = async (input, init) => {
      const reply = await get(input, init);
      if (new Headers(init?.headers).get("x-molis-work-fragment") === "artifact-reference-source") {
        window.referenceRequests++;
        await new Promise(resolve => { window.releaseReference = resolve; });
      }
      return reply;
    };
    const retry = document.querySelector('[data-artifact-reference-retry]');
    window.oldReference = retry.closest('[data-artifact-reference-source]');
    retry.focus(); retry.click(); retry.click();
  })()`);
  await waitFor("typeof window.releaseReference === 'function'");
  await b.click("[data-artifact-collapse]");
  // The loading message removes the old article before the Host replaces its directory links.
  await waitFor(`document.querySelector('[data-artifact-detail]')?.dataset.artifactFragmentPath === ${JSON.stringify(`/projects/${projectId}/artifacts`)}
    && document.querySelector('[data-artifact-directory] a[data-frame-asset]')?.checkVisibility()`);
  await evaluate("window.newFocus = document.querySelector('[data-artifact-directory] a[data-frame-asset]'); window.newFocus.focus(); window.releaseReference()");
  await waitFor("!window.oldReference.hasAttribute('aria-busy')");
  assert.equal(await evaluate("window.referenceRequests"), 1);
  assert.equal(await evaluate("document.activeElement === window.newFocus && !document.querySelector('[data-artifact-detail] [data-artifact-referrers]')"), true);

});
