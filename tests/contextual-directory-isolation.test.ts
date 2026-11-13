import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";

// BCC-11 (N55, specs/batch-06-call-cost/spec.md): the contextual row's short-lived action directory belongs to one Home, project and
// person. Two Homes may hold a project with the same id; before this change Home B, which hid Pages, was handed Home A's Pages candidates
// for three seconds because the cache was keyed by the project id alone.

interface CandidateReply { readonly plan: { readonly context_id: string; readonly candidates: readonly { readonly available?: boolean; readonly action?: { readonly capability_id?: string }; readonly source?: { readonly capability_id?: string } }[] } }

test("BCC-11 a Home that hid Pages is never handed another Home's Pages candidates for the same project id, warm or cold", { timeout: 60_000 }, async t => {
  const start = Date.parse("2026-11-10T11:00:00Z");
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now: start });
  const noModel = async (): Promise<never> => assert.fail("candidate lookup must not call a model");
  const a = await openTestHome(t, { host: { completeText: noModel, functions: { env: {} } } });
  const b = await openTestHome(t, { host: { completeText: noModel, functions: { env: {} } } });
  const project_id = `project-onboarding-${randomUUID()}`;
  const create = (home: TestHome, pages: boolean) => home.host.ensureWebCatalog(home.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: home.home }, async catalog => {
    await catalog.createProject({ project_id, display_name: pages ? "Home A with Pages" : "Home B without Pages", actor_id: "fixture" });
    const change = { project_id, plugin_id: "pages", actor_id: "fixture" };
    if (pages) catalog.addProjectPlugin(change); else catalog.removeProjectPlugin(change);
    return catalog.projectPluginMembership(project_id).hidden;
  });
  assert.ok(!(await create(a, true)).includes("pages"));
  assert.ok((await create(b, false)).includes("pages"));
  const prefix = `/projects/${encodeURIComponent(project_id)}`;
  const { document } = await a.web.post<{ document: { id: string } }>(`${prefix}/api/plugins/io.molis.work.pages/pages`, { title: "Fixture document", markdown: "Fixture selection." });
  let sequence = 0;
  const pagesCandidates = async (home: TestHome) => {
    const context_id = `cross-home-${++sequence}`;
    const reply = await home.web.post<CandidateReply>(`${prefix}/api/contextual/candidates`, { pane_id: "fixture", focus: {
      context_id, plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "range",
      object: { kind: "pages_document", id: document.id, title: "Fixture document" }, targets: [{ kind: "text_range", role: "paragraph", text: "Fixture selection." }],
    } });
    assert.equal(reply.plan.context_id, context_id);
    return reply.plan.candidates.filter(item => item.available
      && (item.action?.capability_id?.startsWith("pages.") || item.source?.capability_id?.startsWith("pages."))).length;
  };
  assert.equal(await pagesCandidates(b), 0, "cold: Home B has no Pages");
  t.mock.timers.setTime(start + 4_000);
  assert.ok(await pagesCandidates(a) > 0, "Home A has its own declared Pages candidates");
  assert.equal(await pagesCandidates(b), 0, "warm: Home A's directory, read a moment ago for the same project id, is not Home B's");
  t.mock.timers.setTime(start + 8_000);
  assert.equal(await pagesCandidates(b), 0, "expired: still none");
});
