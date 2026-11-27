import { projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
// BL-088 (PMR-15, user 2026-10-01): removing a personal plugin from a project turns it off there. With Pages removed, the project's
// search no longer finds Pages documents, and its actions are out of reach for the person, the assistant and MCP alike; added back,
// all of it returns, with the documents as they were. The refusals themselves are S-72's (security-invariants-hidden-personal-plugin).
import assert from "node:assert/strict";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, PLATFORM_PLUGIN_REGISTRATIONS, PROJECT_SCOPED_PLUGIN_IDS, shownProjectPlugins } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { searchActions, type SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import { authorizeMcpActions } from "../apps/local-host/dist/mcp-action-client.js";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { openTestHome } from "./fixtures/test-home.js";

const PAGES = "io.molis.work.pages";
const clientId = "runtime:removed-pages";
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const pagesListTool = `molis_work_v1_action_${pagesActions.list.capability_id}__v1`;

test("RAC-1116 BL-088 removing Pages from a project takes it out of the project's search, actions, assistant and MCP; adding it back brings all of it back with the documents intact", { timeout: 120_000 }, async t => {
  const home = await openTestHome(t), project = await home.createProject("移除 Pages", ["pages"]);
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

  await home.web.delete(projectPlugins, { plugin_id: "pages", expected_revision: await projectPluginRevision(home.web, project.project_id) });
  const removed = await search();
  assert.deepEqual(pagesHits(removed), [], "a removed plugin's documents are not found in that project");
  // The personal space's own Pages (every Home has it since batch 106) is a source of its own and stays; this project's is the one turned off.
  const sources = removed.sources.filter(source => source.plugin_id === PAGES && source.scope === "project");
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

  await home.web.post(projectPlugins, { plugin_id: "pages", expected_revision: await projectPluginRevision(home.web, project.project_id) });
  await reached();
  assert.deepEqual(await offered(), before, "the assistant is offered the same Pages actions again");
});

// PSD-01 (44C-3, specs/plugin-specials-demotion section 8): no built-in plugin is load-bearing. Each of the 20 built-ins is taken out of a
// project in turn (a personal one is turned off there) and the Home page, the project's page, its settings, the attention read, the
// person's and the assistant's action directories and the project's MCP directory all still answer; then it is added back, so each
// removal is measured against a project that has all the others. Each removal also takes effect: the assistant is offered none of
// that plugin's actions, unless a plugin still shown embeds it (availableProjectPluginIds); added back, it is offered what it was before.
// Desktop start, sync and backup are covered by their own files (44C record).
test("PSD-01 taking out any one built-in plugin leaves the Home page, the project page, settings, attention, the assistant and MCP working", { timeout: 600_000 }, async t => {
  const builtins = PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.project_plugin_id).sort();
  assert.equal(builtins.length, 20, `the 20 built-in plugins: ${builtins.join(", ")}`);
  const home = await openTestHome(t), project = await home.createProject("逐一移除");
  const at = `/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`;
  const enabled = async () => {
    const { projects } = await home.web.get<{ projects: Array<{ project_id: string; plugins: string[]; hidden: string[] }> }>("/api/settings/project-plugins");
    const row = projects.find(entry => entry.project_id === project.project_id);
    assert.ok(row);
    return shownProjectPlugins(row.plugins, row.hidden);
  };
  for (const id of PROJECT_SCOPED_PLUGIN_IDS) if (!(await enabled()).includes(id)) await home.web.post(at, { plugin_id: id, expected_revision: await projectPluginRevision(home.web, project.project_id) });
  const start = await enabled();
  assert.deepEqual([...start].sort(), builtins, "the project starts with exactly the shipped members");
  const person = await home.host.localPersonContext(project.reference);
  const assistant: ActionCallContext = { ...person, audience: "agent" };
  const client = home.host.actionClient(project.reference);
  const mcp = await home.mcp("runtime:psd-01", project.project_id);
  const encoded = encodeURIComponent(project.project_id);
  const pages = ["/", `/projects/${encoded}`, `/settings/appearance?project=${encoded}`, `/api/attention?project=${encoded}`, "/api/settings/project-plugins"];
  const status = async (path: string) => {
    const response = await fetch(home.origin + path);
    await response.arrayBuffer();
    return response.status;
  };
  // Whose actions are whose: the removal must take effect, not only leave the pages answering.
  const pluginIdOf = new Map(PLATFORM_PLUGIN_REGISTRATIONS.map(entry => [entry.project_plugin_id, entry.manifest.plugin_id]));
  const offered = async (id: string) => (await client.discover(assistant) as ActionView[])
    .filter(view => view.provider.plugin_id === pluginIdOf.get(id) && view.availability.available).map(view => view.capability_id).sort();
  const rpc = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId: project.project_id, databasePath: project.database_path, webBaseUrl: home.origin },
    { homeDirectory: home.home, webBaseUrl: home.origin, runtimeContext: { runtime_id: "psd-01", stable_work_context_id: "psd-01-session", host_declares_stable: true } }, home.host, home.origin);
  t.after(() => rpc.close());
  let requestId = 0;
  const callTool = async (ref: { capability_id: string; version: number }, args: object) => {
    const reply = await rpc.handleMessage({ jsonrpc: "2.0", id: ++requestId, method: "tools/call",
      params: { name: molisWorkActionToolName(ref), arguments: args } });
    const result = reply?.result as { isError: boolean; content: Array<{ text: string }> };
    assert.ok(result?.content[0], JSON.stringify(reply));
    return { failed: result.isError, value: JSON.parse(result.content[0].text) };
  };
  const sourceViews = await home.inspect("runtime:psd-01", project.project_id);
  const probes = builtins.map(id => {
    const owner = pluginIdOf.get(id);
    const view = sourceViews.find(row => row.provider.plugin_id === owner && (row.action.search_source
      || ["issues.list", "git.operations", "diff.compare"].includes(row.capability_id)));
    assert.ok(view, `a callable read for ${id}`);
    const input = view.action.search_source ? { cursor: null, limit: 8 } : view.capability_id === "diff.compare" ? { before: "old value", after: "reviewed value" } : {};
    return { id, view, input };
  });
  const runtimeId = "runtime:psd-01", agentId = "agent:prologue";
  const ownerBound = new Set<string>();
  for (const { id, view } of probes) {
    for (const clientId of [runtimeId, agentId]) {
      try { await home.grant(clientId, project.project_id, [view]); }
      catch (error) {
        assert.equal((error as { code?: string }).code, "actions.owner_mismatch", id + ": " + String(error));
        ownerBound.add(clientId + "/" + id);
      }
    }
  }
  for (const clientId of [runtimeId, agentId]) await home.grant(clientId, project.project_id, [pagesActions.list, pagesActions.create]);
  const agentCaller: ActionCallContext = { actor_id: "agent:prologue", actor_kind: "runtime", audience: "agent", project_id: project.project_id, permissions: [] };
  const callAsAgent = async (ref: { capability_id: string; provider_id: string; version: number }, args: object) => {
    const auth = await authorizeMcpActions(home.host, agentCaller, home.home, project.reference);
    return auth.service.invoke(auth.context, ref, args);
  };
  const left: Record<string, string[]> = {}, back: Record<string, string[]> = {};
  for (const id of builtins) {
    assert.deepEqual([...(await enabled())].sort(), builtins, `complete membership before removing ${id}`);
    const before = await offered(id);
    const { view, input } = probes.find(probe => probe.id === id)!;
    const ref = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
    const readThroughBoth = async () => {
      const own = await client.invoke(person, ref, input);
      assert.ok(own && typeof own === "object", id);
      if (!ownerBound.has(agentId + "/" + id)) assert.ok(await callAsAgent(ref, input), id);
      const wire = await callTool(ref, input);
      if (ownerBound.has(runtimeId + "/" + id)) {
        assert.ok(wire.failed, id + ": only the owner may call this action");
      } else {
        assert.equal(wire.failed, false, id + " " + JSON.stringify(wire.value));
        if (view.action.search_source) assert.ok(Array.isArray(wire.value.entries));
        else if (ref.capability_id === "diff.compare") assert.equal(wire.value.identical, false);
        else assert.ok(Array.isArray(wire.value.operations ?? wire.value.items));
      }
    };
    const title = `Removal round ${id}`;
    const created = await callTool(pagesActions.create, { title, body: doc(title) });
    assert.equal(created.failed, false, JSON.stringify(created.value));
    const documentId = created.value.document.id;
    assert.equal(typeof documentId, "string");
    await readThroughBoth();
    await home.web.delete(at, { plugin_id: id, expected_revision: await projectPluginRevision(home.web, project.project_id) });
    assert.ok(!(await enabled()).includes(id), `${id} is out of the project`);
    for (const path of pages) assert.equal(await status(path), 200, `without ${id}: ${path}`);
    for (const caller of [person, assistant]) assert.ok((await client.discover(caller)).length > 0, `without ${id}: the ${caller.audience} directory answers`);
    const still = await offered(id);
    // One rule, from the declarations: a plugin another shown plugin embeds stays reachable (Coding embeds Git and Diff, Git embeds Diff).
    const shown = await enabled();
    const embeddedBy = PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => shown.includes(entry.project_plugin_id)
      && (entry.manifest.ui.embedded_plugins ?? []).includes(pluginIdOf.get(id)!)).map(entry => entry.project_plugin_id);
    if (embeddedBy.length) await readThroughBoth();
    else {
      const installedView = (await client.discover(person) as ActionView[]).find(row => row.provider.provider_id === ref.provider_id && row.capability_id === ref.capability_id);
      const refused = installedView ? "actions.plugin_disabled" : "actions.missing";
      await assert.rejects(client.invoke(person, ref, input), { code: refused });
      if (!ownerBound.has(agentId + "/" + id)) await assert.rejects(callAsAgent(ref, input), { code: refused });
      const denied = await callTool(ref, input);
      const wireRefusals = installedView ? [refused, "actions.mcp_unavailable", "mcp.action_revoked"] : ["mcp.tool_unknown", refused];
      assert.ok(denied.failed && wireRefusals.includes(denied.value.code), `${id}: ${JSON.stringify(denied.value)}`);
    }
    const survivor = probes.find(other => other.id !== id && shown.includes(other.id) && !ownerBound.has(runtimeId + "/" + other.id) && !ownerBound.has(agentId + "/" + other.id));
    assert.ok(survivor, "at least one other installed plugin remains callable");
    const survivorRef = { capability_id: survivor.view.capability_id, version: survivor.view.version, provider_id: survivor.view.provider.provider_id };
    assert.ok(await callAsAgent(survivorRef, survivor.input), survivor.id);
    const reached = await callTool(survivorRef, survivor.input);
    assert.equal(reached.failed, false, JSON.stringify(reached.value));
    if (embeddedBy.length ? still.join() !== before.join() : still.length) left[id] = still;
    assert.ok(Array.isArray(await mcp.client.discover(mcp.caller)), `without ${id}: the project's MCP directory answers`);
    await home.web.post(at, { plugin_id: id, expected_revision: await projectPluginRevision(home.web, project.project_id) });
    // Removing a prerequisite also removes its dependents. Restore their membership through the normal settings route.
    const afterAdd = await enabled();
    for (const missing of builtins.filter(member => !afterAdd.includes(member))) {
      if (!(await enabled()).includes(missing)) await home.web.post(at, { plugin_id: missing, expected_revision: await projectPluginRevision(home.web, project.project_id) });
    }
    assert.deepEqual([...(await enabled())].sort(), builtins, `complete membership after restoring ${id}`);
    await readThroughBoth();
    const persisted = await callTool(pagesActions.list, {});
    assert.equal(persisted.failed, false);
    assert.ok(persisted.value.documents.some((item: { id: string; title: string }) => item.id === documentId && item.title === title));
    t.diagnostic(`${id}: ${ref.capability_id} owner-only(agent/mcp)=${ownerBound.has(agentId + "/" + id)}/${ownerBound.has(runtimeId + "/" + id)}; surviving calls=${survivor.id}; removed=${embeddedBy.join(",") || "disabled"}; restored; document=${documentId}`);
    const again = await offered(id);
    if (again.join() !== before.join()) back[id] = again;
  }
  assert.deepEqual(left, {}, "without each plugin, the assistant is offered none of its actions, unless a plugin still shown embeds it");
  assert.deepEqual(back, {}, "added back, each plugin's actions are offered as before");
});
