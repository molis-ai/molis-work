import assert from "node:assert/strict";
import test from "node:test";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

// 「被谁引用」 lists the Assistant's works on a 成果 version (artifact-positioning 五.1), next to the Goals, and opens them.
test("a 成果 version lists the Assistant work that started from it, and opens that work in the Assistant", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const { command, sessionId, evaluate, waitFor, navigate, store, projectId } = b;
  const coordinator = new GoalProjectApplication(store);
  coordinator.artifacts.commands.registerVersion({ project_id: projectId!, actor_id: "web-user", artifact_id: "pages-brief", version: 1,
    artifact_type_id: "io.molis.work.pages.document", schema_version: 1,
    producer: { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
    content: { kind: "inline", payload: { title: "需求说明", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "范围与验收" }] }] } } },
    ...pinnedArtifact("需求说明", { kind: "pages_document", id: "brief" }, "1") });
  const version = `/projects/${projectId}/artifacts/pages-brief/versions/1`;
  await navigate(() => command("Page.navigate", { url: `${b.origin}${version}` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-artifact-links]'))", 15_000);
  // No work refers to it yet: the list stays out of the way.
  assert.equal(await evaluate("document.querySelector('[data-artifact-works]').hidden"), true);
  // The version is named every way a work can hold it: by its subject (side panel, search) and by its tab's path, with the
  // project's prefix when the tab came from a direct link.
  assert.deepEqual(await evaluate("JSON.parse(document.querySelector('[data-artifact-works]').dataset.artifactWorks)"),
    [JSON.stringify(["pages-brief", 1]), "/artifacts/pages-brief/versions/1", version]);
  // The Assistant names the open version by its title, not its address.
  await evaluate("document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: {} }))");
  await waitFor("(document.querySelector('[data-assistant-materials]')?.getAttribute('aria-label') || '').includes('正在看：需求说明')", 10_000);

  // The person asks the Assistant while this version's tab is open (here from a direct link, so the tab holds the prefixed
  // address): the work starts from it. Without a model the round does not run, but the work and where it started are kept.
  await evaluate(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/send`)}, { method: "POST",
    headers: { ...(globalThis.molisWorkControlHeaders?.() || {}), "content-type": "application/json" },
    body: JSON.stringify({ text: "把需求说明整理成清单", request_id: "artifact-works-1",
      context: { source: { surface: "artifacts", title: "成果" }, object: { kind: "artifact", id: ${JSON.stringify(version)}, title: "需求说明" } } }) }).then(r => r.status)`);
  const related = await evaluate<Array<{ work_id: string; relation: string }>>(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/related?kind=artifact&id=${encodeURIComponent(version)}`)}).then(r => r.json()).then(body => body.works)`);
  assert.equal(related.length, 1);
  assert.equal(related[0]!.relation, "origin");

  await navigate(() => command("Page.navigate", { url: `${b.origin}${version}` }, sessionId));
  await waitFor("document.querySelector('[data-artifact-works]')?.hidden === false", 15_000);
  assert.equal(await evaluate("document.querySelectorAll('[data-artifact-open-work]').length"), 1);
  assert.match(await evaluate<string>("document.querySelector('[data-artifact-works]').innerText"), /把需求说明整理成清单[\s\S]*从这一版开始/);

  // Opening it shows that work in the Assistant.
  await evaluate("document.querySelector('[data-artifact-open-work]').click()");
  await waitFor(`document.querySelector('[data-assistant-work-title]')?.textContent?.includes('把需求说明整理成清单')`, 10_000);
  assert.equal(await evaluate("document.querySelector('[data-artifact-open-work]').dataset.artifactOpenWork"), related[0]!.work_id);
});
