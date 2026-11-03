// BL-088 (PMR-15, user 2026-10-01): removing a personal plugin from a project turns it off there. With Pages removed, the project's
// search no longer finds Pages documents, and its actions are out of reach for the person, the assistant and MCP alike; added back,
// all of it returns, with the documents as they were. The refusals themselves are S-72's (security-invariants-hidden-personal-plugin).
import assert from "node:assert/strict";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { searchActions, type SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import { pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { openTestHome } from "./fixtures/test-home.js";

const PAGES = "io.molis.work.pages";
const clientId = "runtime:removed-pages";
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const pagesListTool = `molis_work_v1_action_${pagesActions.list.capability_id}__v1`;

test("RAC-1116 BL-088 removing Pages from a project takes it out of the project's search, actions, assistant and MCP; adding it back brings all of it back with the documents intact", { timeout: 120_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("移除 Pages");
  const projectPlugins = `/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`;
  const person = await home.host.localPersonContext(project.reference);
  const assistant: ActionCallContext = { ...person, audience: "agent" };
  const client = home.host.actionClient(project.reference);
  const search = async () => await client.invoke(person, searchActions.query, { query: "预算" }) as SearchQueryResponse;
  const pagesHits = (response: SearchQueryResponse) => response.hits.filter(hit => hit.plugin_id === PAGES).map(hit => hit.subject.id);
  const pagesViews = async (caller: ActionCallContext) => (await client.discover(caller)).filter(view => view.provider.plugin_id === PAGES);
  await home.grant(clientId, project.project_id, [pagesActions.list]);
  const mcp = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId: project.project_id, databasePath: project.database_path, webBaseUrl: home.origin },
    { homeDirectory: home.home, webBaseUrl: home.origin, runtimeContext: { runtime_id: "removed-pages", stable_work_context_id: "removed-pages-session", host_declares_stable: true } }, home.host, home.origin);
  t.after(() => mcp.close());
  const mcpTools = async () => ((await mcp.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }))?.result as { tools: Array<{ name: string }> }).tools.map(tool => tool.name);

  const page = (await client.invoke(person, pagesActions.create, { title: "第四季度计划要点", body: doc("预算控制在50万以内") }) as { document: { id: string } }).document;
  const offered = async () => (await pagesViews(assistant)).filter(view => view.availability.available).map(view => view.capability_id).sort();
  const reached = async () => {
    assert.deepEqual(pagesHits(await search()), [page.id], "the project's search finds the Pages document");
    assert.ok((await offered()).includes(pagesActions.list.capability_id), "the assistant's directory offers Pages");
    assert.ok((await mcpTools()).includes(pagesListTool), "the project's MCP lists the granted Pages tool");
    const listed = await client.invoke(person, pagesActions.list, {}) as { documents: Array<{ id: string; title: string }> };
    assert.deepEqual(listed.documents.map(document => [document.id, document.title]), [[page.id, "第四季度计划要点"]]);
  };
  await reached();
  const before = await offered();

  await home.web.delete(projectPlugins, { plugin_id: "pages" });
  const removed = await search();
  assert.deepEqual(pagesHits(removed), [], "a removed plugin's documents are not found in that project");
  const sources = removed.sources.filter(source => source.plugin_id === PAGES);
  assert.ok(sources.length > 0 && sources.every(source => source.state === "disabled"), JSON.stringify(sources));
  const assistantViews = await pagesViews(assistant);
  assert.deepEqual(assistantViews.filter(view => view.availability.available).map(view => view.capability_id), [], "the assistant is offered no Pages action there");
  const refusals = Object.fromEntries(assistantViews.filter(view => before.includes(view.capability_id))
    .map(view => [view.capability_id, view.availability.available ? "available" : view.availability.code]));
  assert.deepEqual(refusals, Object.fromEntries(before.map(id => [id, "actions.plugin_disabled"])), "what it was offered is refused because Pages is off there");
  for (const caller of [person, assistant]) await assert.rejects(client.invoke(caller, pagesActions.list, {}), { code: "actions.plugin_disabled" });
  assert.ok(!(await mcpTools()).includes(pagesListTool), "the grant stays, but the tool is not listed while Pages is off");
  const called = (await mcp.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: pagesListTool, arguments: {} } }))?.result as { isError: boolean; content: Array<{ text: string }> };
  assert.equal(called.isError, true);
  assert.equal(JSON.parse(called.content[0]!.text).code, "actions.plugin_disabled");

  await home.web.post(projectPlugins, { plugin_id: "pages" });
  await reached();
  assert.deepEqual(await offered(), before, "the assistant is offered the same Pages actions again");
});
