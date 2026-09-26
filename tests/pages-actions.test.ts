import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesActions as actions, pagesContentActions as content, PAGES_ACTION_PERMISSIONS, openPagesStore, runPagesMcpTool } from "@molis-ai/molis-work-plugin-pages";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import type { HostCompleteText } from "../apps/local-host/src/host-complete-text.js";

const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
async function fixture(run: (f: { home: string; host: MolisWorkLocalHost; caller: ActionCallContext;
  client: ReturnType<MolisWorkLocalHost["actionClient"]>; bound: ReturnType<typeof bindActionClient>;
  ref: ReturnType<typeof molisWorkHostProjectReference> }) => Promise<void>, completeText: HostCompleteText | null = null) {
  const home = await mkdtemp(join(tmpdir(), "pages-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), boardId: "legacy-board", projectId: "a" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: PAGES_ACTION_PERMISSIONS };
  const client = host.actionClient(ref);
  try {
    await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ board_id: ref.board_id, title: "Pages", actor_id: "owner", idempotency_key: "init" }));
    await run({ home, host, caller, client, ref, bound: bindActionClient(client, () => caller) });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
}

test("Pages auto-registers all business contracts; HTTP/workflow/legacy MCP use the same persisted operations", async () => {
  await fixture(async ({ home, client, caller, bound, host, ref }) => {
    const discovered = await client.discover(caller);
    for (const action of Object.values(actions)) assert.ok(discovered.some(row => row.capability_id === action.capability_id));
    assert.equal(discovered.find(row => row.capability_id === actions.ai.capability_id)!.availability.available, false);
    const { folder } = await bound.invoke(actions.createFolder, { title: "Drafts" });
    const { document } = await bound.invoke(actions.create, { title: "Original", body: body("Original text"), folder_id: folder.id });
    await assert.rejects(client.invoke({ ...caller, project_id: "b" }, actions.list, {}), { code: "actions.scope_mismatch" });
    await assert.rejects(client.invoke({ ...caller, permissions: ["pages:read"] }, actions.create, { title: "Denied" }), { code: "actions.forbidden" });
    await assert.rejects(bound.invoke(actions.create, { project_id: "b" } as never), { code: "actions.input_invalid" });
    const received = await bound.invoke(content.receive, { payload: { title: "Workflow", body: "# Shared\nActual content" }, context: { instance_id: "workflow-1", step: 1 } });
    const legacy = JSON.parse(await runPagesMcpTool(bound, { tool_id: "get", arguments: { id: received.item_id } }));
    assert.match(JSON.stringify(legacy.document.body), /Actual content/);
    await assert.rejects(client.invoke({ ...caller, allowed_capability_ids: [content.receive.capability_id] }, content.receive,
      { payload: { title: "Bypass", body: "Denied" }, context: { instance_id: "workflow-1", step: 2 } }), { code: "actions.forbidden" });
    const updated = (await bound.invoke(actions.update, { id: document.id, body: body("Edited"), expected_version: document.version })).document;
    await assert.rejects(bound.invoke(actions.update, { id: document.id, title: "Overwrite", expected_version: document.version }), { code: "pages.conflict" });
    assert.equal((await bound.invoke(actions.get, { id: document.id })).document.title, "Original");
    const store = openPagesStore(home);
    let foreign: string;
    try { foreign = store.create({ project_id: "b", title: "Private" }).id; } finally { store.close(); }
    await assert.rejects(bound.invoke(actions.get, { id: foreign }), { code: "pages.not_found" });
    await assert.rejects(bound.invoke(actions.update, { id: foreign, title: "Leak" }), { code: "pages.not_found" });
    const promoted = await bound.invoke(actions.promote, { id: document.id });
    assert.equal(promoted.document.artifact_version, 1);
    await host.withProject(ref, runtime => {
      const artifact = runtime.coordinator.artifacts.query.getArtifactVersion("legacy-board", promoted.artifact);
      assert.ok(artifact); assert.match(JSON.stringify(artifact), /Edited/);
    });
    await bound.invoke(actions.updateFolder, { id: folder.id, title: "Moved" });
    await bound.invoke(actions.deleteFolder, { id: folder.id });
    assert.equal((await bound.invoke(actions.get, { id: document.id })).document.folder_id, "");
    assert.equal((await bound.invoke(actions.get, { id: document.id })).document.body.content?.length, updated.body.content?.length);
    await host.closeProject(ref);
    assert.equal((await bound.invoke(actions.get, { id: document.id })).document.artifact_id, promoted.artifact.artifact_id);
    await bound.invoke(actions.delete, { id: received.item_id });
    assert.deepEqual((await bound.invoke(actions.list, {})).documents.map(row => row.id), [document.id]);
  });
});

test("extract rolls back both source and new knowledge pages when any insert fails, then retries without duplicates", async () => {
  await fixture(async ({ home, bound }) => {
    const content = [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Knowledge" }] },
      { type: "paragraph", content: [{ type: "text", text: "Enough original text to form a knowledge page." }] },
      { type: "task_list", content: [{ type: "task_item", content: [{ type: "paragraph", content: [{ type: "text", text: "Ship it" }] }] }] },
    ];
    const { document } = await bound.invoke(actions.create, { title: "Source", body: { type: "doc", content } });
    const db = openHomeSqliteDatabase(home, "pages");
    try {
      db.exec("CREATE TRIGGER fail_knowledge BEFORE INSERT ON pages BEGIN SELECT RAISE(ABORT, 'fixture insert failed'); END");
      await assert.rejects(bound.invoke(actions.extract, { id: document.id }), /fixture insert failed/);
      assert.deepEqual((await bound.invoke(actions.get, { id: document.id })).document, document);
      assert.equal((await bound.invoke(actions.list, {})).documents.length, 1);
      db.exec("DROP TRIGGER fail_knowledge");
      const result = await bound.invoke(actions.extract, { id: document.id });
      assert.equal(result.cards, 1); assert.equal(result.created.length, 1);
      const retry = await bound.invoke(actions.extract, { id: document.id });
      assert.equal(retry.cards, 0); assert.equal(retry.created.length, 0);
    } finally { db.close(); }
  });
});

for (const mode of ["missing", "failure", "empty", "cancel", "edit", "delete", "success"] as const) {
  test(`Pages AI ${mode} returns real candidates or rejects without writing a placeholder`, async () => {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const prompts: string[] = [];
    const provider: HostCompleteText = async prompt => {
      prompts.push(prompt);
      if (mode === "failure") throw new Error("Fixture model failure");
      if (mode === "empty") return " ";
      if (mode !== "success") { enter(); await released; }
      return "Actual candidate";
    };
    await fixture(async ({ home, bound, client, caller }) => {
      const { document } = await bound.invoke(actions.create, { body: body("Original") });
      const controller = new AbortController();
      const pending = client.invoke({ ...caller, signal: controller.signal }, actions.ai,
        { id: document.id, command: "rewrite", text: "Source selected text", expected_version: document.version });
      if (mode === "success") {
        assert.deepEqual(await pending, { text: "Actual candidate", stub: false, command: "rewrite", style: undefined });
        assert.match(prompts[0]!, /Source selected text/);
        const translated = JSON.parse(await runPagesMcpTool(bound, { tool_id: "ai", arguments: { id: document.id, command: "translate_new", text: "Original" } }));
        assert.equal(translated.stub, false); assert.match(JSON.stringify(translated.document.body), /Actual candidate/);
        assert.equal((await bound.invoke(actions.list, {})).documents.length, 2);
      } else {
        const rejection = assert.rejects(pending, mode === "missing" ? { code: "actions.connection_required" }
          : mode === "failure" ? /Fixture model failure/ : mode === "empty" ? /模型没有返回文字/
          : mode === "cancel" ? { name: "AbortError" } : mode === "delete" ? { code: "pages.not_found" } : { code: "pages.conflict" });
        if (!["missing", "failure", "empty"].includes(mode)) {
          await entered;
          if (mode === "cancel") controller.abort();
          else {
            const store = openPagesStore(home);
            try {
              if (mode === "edit") store.update(document.id, { body: body("Concurrent edit") }, "a");
              else store.delete(document.id, "a");
            } finally { store.close(); }
          }
          release();
        }
        await rejection;
        assert.equal((await bound.invoke(actions.list, {})).documents.length, mode === "delete" ? 0 : 1);
      }
      if (mode !== "delete") assert.deepEqual((await bound.invoke(actions.get, { id: document.id })).document.body, body(mode === "edit" ? "Concurrent edit" : "Original"));
    }, mode === "missing" ? null : provider);
  });
}
