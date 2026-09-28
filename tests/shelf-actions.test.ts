import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SHELF_ACTIONS, SHELF_ACTION_PERMISSIONS, SHELF_PROJECT_ACTIONS, SHELF_RUNTIME_ACTIONS, shelfActions as a } from "@molis-ai/molis-work-plugin-shelf";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import { createActionMcpPorts, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
import { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";

test("the personal Shelf is a Home action provider; clipboard, settings and local paths stay with the local user", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-actions-"));
  const previous = process.env.MOLIS_WORK_SHELF_AGENT;
  process.env.MOLIS_WORK_SHELF_AGENT = "off";
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const user: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS };
  const client = host.homeActionClient(), bound = bindActionClient(client, () => user);
  try {
    const directory = (await client.discover(user)).filter(row => row.provider.plugin_id === "io.molis.work.shelf");
    assert.deepEqual(directory.map(row => row.capability_id).sort(), SHELF_ACTIONS.map(row => row.capability_id).sort());
    assert.ok(directory.every(row => row.action.scope === "home" && row.action.scheduling === "concurrent"));

    // The panel's writes and an Agent's writes land in the same store the HTTP panel reads.
    const { item } = await bound.invoke(a.admit, { text: "会议纪要：周三前定稿", title: "纪要", capture_pages: false });
    const agent = bindActionClient(client, () => ({ ...user, actor_id: "agent:writer", audience: "agent" }));
    assert.deepEqual((await agent.invoke(a.readText, { item_id: item.item_id })).text, "会议纪要：周三前定稿");
    const edited = (await agent.invoke(a.edit, { item_id: item.item_id, text: "会议纪要：周五前定稿" })).item;
    assert.equal(edited.item_id, item.item_id);
    assert.equal(openShelfStore(home).readFile(item.item_id).bytes.toString("utf8"), "会议纪要：周五前定稿");
    const listed = await agent.invoke(a.list, {});
    assert.deepEqual(Object.keys(listed).sort(), ["materials", "results", "running_jobs"], "the shared list carries no clipboard, settings or root path");
    assert.ok(listed.materials.some(row => row.item_id === item.item_id));

    // Only the local interface may register a real path: the store would hash that file before each run.
    await writeFile(join(home, "secret.txt"), "private");
    const upload = { filename: "a.txt", bytes_base64: Buffer.from("private").toString("base64"), origin_realpath: join(home, "secret.txt") };
    await assert.rejects(agent.invoke(a.admit, upload), { code: "actions.forbidden" });
    assert.ok((await bound.invoke(a.admit, upload)).item.item_id);
    await assert.rejects(bound.invoke(a.admit, {}), { code: "shelf.invalid" });

    for (const local of [a.snapshot, a.clip, a.settings, a.saveSettings, a.file, a.admitFolder, a.sample, a.deleteClip, a.clipToMaterial, a.clipboardSearchEntries]) {
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
    // Materials are searchable as far as they are readable; the clipboard source is not listed at all.
    assert.deepEqual(names.sort(), ["shelf.items.list__v1", "shelf.items.read__v1", "shelf.search.entries__v1"]);
    const read = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "shelf.items.read__v1", arguments: { item_id: item.item_id } } }, mcp) as { result: { structuredContent: { text: string } } };
    assert.equal(read.result.structuredContent.text, "会议纪要：周五前定稿");

    // Without a terminal Agent the run fails with a recorded reason instead of pretending to work.
    await assert.rejects(bound.invoke(a.runJob, { recipe: "summary", item_id: item.item_id }), (error: { code?: string }) => (error.code ?? "").startsWith("shelf."));
    await bound.invoke(a.hide, { item_id: item.item_id });
    assert.ok(!(await bound.invoke(a.list, {})).materials.some(row => row.item_id === item.item_id));

    // In a project, the Host adds the save-as-material pair and the Runtime instance redeems its own declared actions.
    const database = join(home, "project.sqlite");
    seedDemoBoard(database);
    const project = molisWorkHostProjectReference({ databasePath: database, boardId: DEMO_BOARD_ID, projectId: DEMO_BOARD_ID });
    const owner: ActionCallContext = { actor_id: "web-user", project_id: DEMO_BOARD_ID, audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private", "shelf:read"] };
    const scoped = (await host.actionClient(project).discover(owner)).filter(row => row.provider.plugin_id === "io.molis.work.shelf" && row.action.scope === "project");
    assert.deepEqual(scoped.filter(row => row.provider.provider_id === "io.molis.work.shelf").map(row => row.capability_id).sort(), SHELF_PROJECT_ACTIONS.map(row => row.capability_id).sort());
    const runtime = scoped.filter(row => row.provider.provider_id !== "io.molis.work.shelf");
    assert.deepEqual(runtime.map(row => row.capability_id).sort(), SHELF_RUNTIME_ACTIONS.map(row => row.capability_id).sort());
    assert.ok(runtime.every(row => row.availability.available));
    assert.deepEqual(await host.actionClient(project).invoke(owner, runtime.find(row => row.capability_id === "shelf.material-output.read")!, {}), { reference: null });
    // Owner-bound: another identity cannot read results into, or point outputs at, this person's Shelf.
    const other = await host.actionClient(project).discover({ ...owner, actor_id: "runtime:other", audience: "mcp" });
    assert.ok(other.filter(row => row.capability_id === "shelf.results.list").every(row => !row.availability.available));
  } finally {
    if (previous === undefined) delete process.env.MOLIS_WORK_SHELF_AGENT; else process.env.MOLIS_WORK_SHELF_AGENT = previous;
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
