import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SHELF_ACTIONS, SHELF_ACTION_PERMISSIONS, SHELF_PLUGIN_ID, SHELF_PROJECT_ACTIONS, SHELF_RUNTIME_ACTIONS, shelfActions as a } from "@molis-ai/molis-work-plugin-shelf";
import { createActionMcpPorts, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
import { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, seedDemoHomeSamples, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openTestShelfStore } from "./shelf-direct-actions.js";

test("SYS-15-F1 the personal Shelf runs in Home Runtime; clipboard, settings and local paths stay with the local user", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-actions-"));
  const previous = process.env.MOLIS_WORK_LOCAL_TOOLS;
  process.env.MOLIS_WORK_LOCAL_TOOLS = "off";
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const user: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS };
  const client = host.homeActionClient(), bound = bindActionClient(client, () => user);
  try {
    const directory = (await client.discover(user)).filter(row => row.provider.plugin_id === "io.molis.work.shelf" && row.action.scope === "home");
    assert.deepEqual(directory.map(row => row.capability_id).sort(), SHELF_ACTIONS.map(row => row.capability_id).sort());
    assert.ok(directory.every(row => row.action.scope === "home" && row.action.scheduling === "concurrent"));

    // The panel's writes and an Agent's writes land in the same store the HTTP panel reads.
    const { item } = await bound.invoke(a.admit, { text: "会议纪要：周三前定稿", title: "纪要"});
    const agent = bindActionClient(client, () => ({ ...user, actor_id: "agent:writer", audience: "agent" }));
    assert.deepEqual((await agent.invoke(a.readText, { item_id: item.item_id })).text, "会议纪要：周三前定稿");
    const edited = (await agent.invoke(a.edit, { item_id: item.item_id, text: "会议纪要：周五前定稿" })).item;
    assert.equal(edited.item_id, item.item_id);
    assert.equal(openTestShelfStore(home).readFile(item.item_id).bytes.toString("utf8"), "会议纪要：周五前定稿");
    const listed = await agent.invoke(a.list, {});
    assert.deepEqual(Object.keys(listed).sort(), ["materials", "results", "running_jobs"], "the shared list carries no clipboard, settings or root path");
    assert.ok(listed.materials.some(row => row.item_id === item.item_id));

    // No caller names a real path any more: admitting takes bytes only, and the original is the platform's (`shelf.items.original`, local only).
    const upload = { filename: "a.txt", bytes_base64: Buffer.from("private").toString("base64"), origin_realpath: join(home, "secret.txt") };
    await assert.rejects(bound.invoke(a.admit, upload), { code: "actions.input_invalid" });
    await assert.rejects(bound.invoke(a.admit, {}), { code: "shelf.invalid" });

    for (const local of [a.snapshot, a.clip, a.settings, a.saveSettings, a.file, a.admitFolder, a.original, a.sample, a.deleteClip, a.clipToMaterial, a.clipboardSearchEntries]) {
      await assert.rejects(client.invoke({ ...user, audience: "agent" }, local, {}), (error: { code?: string }) => error.code === "actions.forbidden",
        `${local.capability_id} must not be callable by an Agent`);
    }
    const clip = (await bound.invoke(a.clip, { text: "https://example.com/private-link" })).clip;
    assert.ok(clip);
    assert.equal((await bound.invoke(a.clip, { text: "hunter2", types: ["org.nspasteboard.ConcealedType"] })).clip, null, "concealed clipboard is never kept");
    assert.equal((await bound.invoke(a.snapshot, {})).clipboard.length, 1);

    // External clients see the shared actions only, and only with the permissions their grant carries.
    const mcp = createActionMcpPorts({ service: client, serverInfo: { name: "shelf", version: "1" },
      context: () => ({ actor_id: "runtime:reader", project_id: null, audience: "mcp", permissions: ["shelf:read"] }) });
    const tools = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, mcp) as { result: { tools: { name: string }[] } };
    const names = tools.result.tools.map(tool => tool.name).filter(name => name.startsWith("shelf."));
    // Materials are searchable and readable by the shared subject protocol as far as they are readable; the clipboard source is not listed at all.
    assert.deepEqual(names.sort(), ["shelf.items.list__v1", "shelf.items.read__v1", "shelf.search.entries__v1", "shelf.subject.read__v2"]);
    const read = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "shelf.items.read__v1", arguments: { item_id: item.item_id } } }, mcp) as { result: { structuredContent: { text: string } } };
    assert.equal(read.result.structuredContent.text, "会议纪要：周五前定稿");

    // Without a configured model the automatic action refuses before creating a job, with the platform's word for it (as Jelly, Todo, Form and Dataset do).
    await assert.rejects(bound.invoke(a.generate, { recipe: "summarize", item_id: item.item_id }), { code: "actions.connection_required" });
    await bound.invoke(a.hide, { item_id: item.item_id });
    assert.ok(!(await bound.invoke(a.list, {})).materials.some(row => row.item_id === item.item_id));

    // In a project, the Runtime instance's project half redeems its own declared actions, the save-as-material pair among them.
    const database = join(home, "project.sqlite");
    seedDemoBoard(database);
    const project = molisWorkHostProjectReference({ databasePath: database, projectId: DEMO_PROJECT_ID });
    const owner: ActionCallContext = { actor_id: "web-user", project_id: DEMO_PROJECT_ID, audience: "user", permissions: [...SHELF_ACTION_PERMISSIONS, "artifact:read", "artifacts:read", "artifacts:write", "storage:private", "actions:invoke"] };
    const scoped = (await host.actionClient(project).discover(owner)).filter(row => row.provider.plugin_id === "io.molis.work.shelf" && row.action.scope === "project");
    assert.ok(scoped.every(row => row.provider.plugin_install_id), "both halves are real Runtime installations");
    const homeInstall = (await host.homePlugins!.ready()).runtime.list().find(row => row.plugin_id === "io.molis.work.shelf")!;
    assert.deepEqual(scoped.filter(row => row.provider.plugin_install_id === homeInstall.install_id && !row.provider.project_id).map(row => row.capability_id).sort(), SHELF_PROJECT_ACTIONS.map(row => row.capability_id).sort());
    const runtime = scoped.filter(row => row.provider.project_id === DEMO_PROJECT_ID);
    assert.deepEqual(runtime.map(row => row.capability_id).sort(), SHELF_RUNTIME_ACTIONS.map(row => row.capability_id).sort());
    assert.ok(runtime.every(row => row.availability.available));
    // Owner-bound: another identity cannot read results into this person's Shelf.
    const other = await host.actionClient(project).discover({ ...owner, actor_id: "runtime:other", audience: "mcp" });
    assert.ok(other.filter(row => row.capability_id === "shelf.results.list").every(row => !row.availability.available));
  } finally {
    if (previous === undefined) delete process.env.MOLIS_WORK_LOCAL_TOOLS; else process.env.MOLIS_WORK_LOCAL_TOOLS = previous;
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("the demo puts Shelf's sample back through shelf.sample.seed; a Shelf that is not running is left alone", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-demo-sample-"));
  const previous = process.env.MOLIS_WORK_LOCAL_TOOLS;
  process.env.MOLIS_WORK_LOCAL_TOOLS = "off";
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const user: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS };
  const bound = bindActionClient(host.homeActionClient(), () => user);
  const names = async () => (await bound.invoke(a.snapshot, {})).materials.map(item => item.name);
  try {
    const [sample] = (await bound.invoke(a.snapshot, {})).materials;
    assert.equal(sample?.name, "试用示例.pdf", "Shelf put its first-run sample down itself");
    await bound.invoke(a.delete, { item_id: sample!.item_id });
    assert.deepEqual(await names(), []);
    await seedDemoHomeSamples(bound);
    assert.deepEqual(await names(), ["试用示例.pdf"], "the demo puts a removed sample back through Shelf's action");
    const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(SHELF_PLUGIN_ID)!;
    await platform.runtime.stop(install.install_id);
    await seedDemoHomeSamples(bound);
    await assert.rejects(seedDemoHomeSamples({ invoke: async () => { throw new ActionError("actions.execution_failed", "示例写坏了"); } }),
      { code: "actions.execution_failed" }, "a failure other than Shelf being off or not granted reaches the demo");
  } finally {
    if (previous === undefined) delete process.env.MOLIS_WORK_LOCAL_TOOLS; else process.env.MOLIS_WORK_LOCAL_TOOLS = previous;
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
