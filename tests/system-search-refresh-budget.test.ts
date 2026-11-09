import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { formActions, FORM_PLUGIN_ID } from "@molis-ai/molis-work-plugin-form";
import { goalsActions, GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { pagesActions, PAGES_PLUGIN_ID } from "@molis-ai/molis-work-plugin-pages";
import { openTextSearchIndex } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";

const plugins = [PAGES_PLUGIN_ID, FORM_PLUGIN_ID, GOALS_PLUGIN_ID];
const document = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

test("BRC-04 · one background search directory refreshes the two changed sources", { timeout: 60_000 }, async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now: Date.parse("2026-11-09T18:00:00Z") });
  const home = await openTestHome(t, { host: { clock: () => new Date() } });
  const project = await home.createProject("Search refresh", ["pages", "form"]);
  const caller = await home.host.localPersonContext(project.reference);
  const actions = home.host.actionClient(project.reference);
  const call = <I, O>(definition: ActionDefinition<I, O>, input: I) => actions.invoke(caller, definition, input) as Promise<O>;
  const search = (query: string) => home.web.post<SearchQueryResponse>(`/projects/${project.project_id}/api/search/query`, { query, scope: "project", plugins });

  const page = (await call(pagesActions.create, { title: "Refresh document", body: document("heliotrope") })).document;
  const form = (await call(formActions.create, { title: "Refresh form" })).form;
  const editedForm = (await call(formActions.update, { id: form.id, expected_version: form.version, description: "heliotrope" })).form;
  await call(goalsActions.create, { title: "heliotrope", idempotency_key: "search-refresh-goal" });

  // Expire registration and seed command timers while no sources are indexed. The first search builds all three.
  t.mock.timers.tick(800);
  assert.deepEqual((await search("heliotrope")).hits.map(hit => hit.plugin_id).sort(), [...plugins].sort());
  const index = openTextSearchIndex({ homeDirectory: home.home });
  t.after(() => index.close());
  assert.equal(index.documents(project.project_id).length, 3);

  const counts = { indexer: 0, discover: 0, lists: [0, 0, 0], bodies: [0, 0, 0] };
  const lists = [pagesActions.searchEntries, formActions.searchEntries, goalsActions.searchEntries];
  const bodies = [pagesActions.subject, formActions.subject, goalsActions.subject];
  let measuring = false;
  const prepare = MolisWorkLocalHost.prototype.inspectPreparedActionMetadata;
  t.mock.method(MolisWorkLocalHost.prototype, "inspectPreparedActionMetadata", function (this: MolisWorkLocalHost, ...args: Parameters<typeof prepare>) {
    if (measuring) counts.indexer++;
    return prepare.apply(this, args);
  });
  const discover = ActionService.prototype.discover;
  t.mock.method(ActionService.prototype, "discover", function (this: ActionService, ...args: Parameters<typeof discover>) {
    if (measuring) counts.discover++;
    return discover.apply(this, args);
  });
  const invoke = ActionService.prototype.invoke;
  t.mock.method(ActionService.prototype, "invoke", function (this: ActionService, ...args: Parameters<typeof invoke>) {
    if (measuring) {
      const capability = args[1].capability_id;
      for (const [at, action] of lists.entries()) if (action.capability_id === capability) counts.lists[at]!++;
      for (const [at, action] of bodies.entries()) if (action.capability_id === capability) counts.bodies[at]!++;
    }
    return invoke.apply(this, args);
  });

  await call(pagesActions.update, { id: page.id, expected_version: page.version, body: document("vermillion") });
  await call(formActions.update, { id: form.id, expected_version: editedForm.version, description: "vermillion" });
  measuring = true;
  try {
    // Fire search's 800ms timer. The independent Knowledge timer is due at 2s and stays pending.
    t.mock.timers.tick(800);
    const deadline = performance.now() + 10_000;
    while (index.documents(project.project_id).filter(row => row.content.includes("vermillion")).length !== 2) {
      assert.ok(performance.now() < deadline, "both new bodies reach the background index before any further query");
      await setImmediate();
    }
  } finally { measuring = false; }

  assert.deepEqual((await search("vermillion")).hits.map(hit => hit.plugin_id).sort(), [FORM_PLUGIN_ID, PAGES_PLUGIN_ID]);
  assert.deepEqual((await search("heliotrope")).hits.map(hit => hit.plugin_id), [GOALS_PLUGIN_ID]);
  assert.deepEqual(counts, { indexer: 1, discover: 1, lists: [1, 1, 0], bodies: [1, 1, 0] });
});
