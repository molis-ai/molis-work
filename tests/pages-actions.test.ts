import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesActions as actions, pagesContentActions as content, PAGES_ACTION_PERMISSIONS, openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import type { HostCompleteText } from "../apps/local-host/src/host-complete-text.js";

const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
async function fixture(run: (f: { home: string; host: MolisWorkLocalHost; caller: ActionCallContext;
  client: ReturnType<MolisWorkLocalHost["actionClient"]>; bound: ReturnType<typeof bindActionClient>;
  ref: ReturnType<typeof molisWorkHostProjectReference> }) => Promise<void>, completeText: HostCompleteText | null = null) {
  const home = await mkdtemp(join(tmpdir(), "pages-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: PAGES_ACTION_PERMISSIONS };
  const client = host.actionClient(ref);
  try {
    await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ project_id: ref.project_id, title: "Pages", actor_id: "owner", idempotency_key: "init" }));
    await run({ home, host, caller, client, ref, bound: bindActionClient(client, () => caller) });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
}

test("Pages auto-registers all business contracts; HTTP and workflow use the same persisted operations", async () => {
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
    const receivedDocument = await bound.invoke(actions.get, { id: received.item_id });
    assert.match(JSON.stringify(receivedDocument.document.body), /Actual content/);
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
      const artifact = runtime.coordinator.artifacts.query.getArtifactVersion(ref.project_id, promoted.artifact);
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
        const translated = await bound.invoke(actions.ai, { id: document.id, command: "translate_new", text: "Original" });
        assert.equal(translated.stub, false); assert.equal(translated.text, "Actual candidate");
        assert.equal((await bound.invoke(actions.list, {})).documents.length, 1, "a candidate is returned, not saved as a document");
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

test("a new document can be taken back only while unchanged: create names its undo, discard refuses once it was edited", async () => {
  const { inspectActionDeclarations, actionEffect } = await import("@molis-ai/molis-work-contracts/platform/actions");
  assert.deepEqual(actions.create.action.undo, { capability_id: "pages.discard", version: 1, input: { id: "document.id", expected_version: "document.version" } });
  assert.deepEqual(inspectActionDeclarations([actions.create, actions.discard], undefined), []);
  assert.equal(actionEffect(actions.discard.action, actions.discard.capability_id), "irreversible", "an agent calling discard itself is asked each time");
  await fixture(async ({ bound }) => {
    const { document: kept } = await bound.invoke(actions.create, { title: "Draft", body: body("First draft") });
    await bound.invoke(actions.discard, { id: kept.id, expected_version: kept.version });
    assert.equal((await bound.invoke(actions.list, {})).documents.some(doc => doc.id === kept.id), false, "taken back while unchanged");
    const { document: edited } = await bound.invoke(actions.create, { title: "Plan", body: body("v1") });
    await bound.invoke(actions.update, { id: edited.id, body: body("v2 by the person"), expected_version: edited.version });
    await assert.rejects(bound.invoke(actions.discard, { id: edited.id, expected_version: edited.version }), { code: "pages.conflict" });
    assert.equal((await bound.invoke(actions.get, { id: edited.id })).document.version, edited.version + 1, "the edited document stays");
  });
});

test("an edit an agent made can be taken back while nothing changed since; the person's own edits keep no record", async () => {
  const { inspectActionDeclarations } = await import("@molis-ai/molis-work-contracts/platform/actions");
  assert.deepEqual(actions.update.action.undo, { capability_id: "pages.revert", version: 1, input: { change_id: "change_id" } });
  assert.deepEqual(inspectActionDeclarations([actions.update, actions.revert], undefined), []);
  await fixture(async ({ bound, client, caller }) => {
    const agent = { ...caller, audience: "agent" as const };
    const { document } = await bound.invoke(actions.create, { title: "Plan", body: body("v1") });
    // The person's edit (the Pages page): nothing kept.
    const own = await bound.invoke(actions.update, { id: document.id, body: body("v2 by the person"), expected_version: document.version });
    assert.equal(own.change_id, null);
    // An agent's edit keeps what it replaced; taking it back restores the person's version.
    const edited = await client.invoke(agent, actions.update, { id: document.id, body: body("v3 by the assistant"), expected_version: own.document.version }) as { document: { version: number }; change_id: string };
    assert.equal(typeof edited.change_id, "string");
    const back = await bound.invoke(actions.revert, { change_id: edited.change_id });
    assert.match(JSON.stringify(back.document.body), /v2 by the person/);
    await assert.rejects(bound.invoke(actions.revert, { change_id: edited.change_id }), { code: "pages.not_found" }, "taken back once");
    // Edited again after the agent's change: the revert refuses and the newer text stays.
    const again = await client.invoke(agent, actions.update, { id: document.id, body: body("v5 by the assistant"), expected_version: back.document.version }) as { document: { version: number }; change_id: string };
    await bound.invoke(actions.update, { id: document.id, body: body("v6 by the person"), expected_version: again.document.version });
    await assert.rejects(bound.invoke(actions.revert, { change_id: again.change_id }), { code: "pages.conflict" });
    assert.match(JSON.stringify((await bound.invoke(actions.get, { id: document.id })).document.body), /v6 by the person/);
  });
});

test("what an agent writes is what the editor can show: Markdown is converted by Pages, a body in another editor's structure is refused", async () => {
  await fixture(async ({ client, caller }) => {
    const agent: ActionCallContext = { ...caller, audience: "agent" };
    // Seen with MiniMax-M3: list and table nodes named the way another editor names them. Saved, it opened as an empty page.
    const foreign = { type: "doc" as const, content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "项目创建于 9 月 28 日" }] }] }] }] };
    await assert.rejects(client.invoke(agent, actions.create, { title: "现状报告", body: foreign }),
      (error: { code?: string; message?: string }) => error.code === "pages.invalid" && /bullet_list/.test(error.message ?? "") && /markdown/.test(error.message ?? ""));
    assert.equal((await client.invoke(caller, actions.list, {})).documents.length, 0, "nothing was saved");
    const { document } = await client.invoke(agent, actions.create, { markdown: "# Q4 plan 项目现状报告\n\n## 目标清单\n\n| 目标 | 状态 |\n| --- | --- |\n| 卡片测试 | 待开始 |\n\n- 进展一\n- 进展二" });
    assert.equal(document.title, "Q4 plan 项目现状报告", "the Markdown's own heading names the page");
    const types = JSON.stringify(document.body);
    for (const name of ["heading", "table", "bullet_list", "list_item"]) assert.match(types, new RegExp(`"type":"${name}"`));
    assert.match(types, /卡片测试/);
    const { document: updated } = await client.invoke(agent, actions.update, { id: document.id, markdown: "## 下一步\n\n1. 补全目标定义", expected_version: document.version });
    assert.match(JSON.stringify(updated.body), /"type":"ordered_list"/);
    await assert.rejects(client.invoke(agent, actions.update, { id: document.id, markdown: "x", body: foreign, expected_version: updated.version }), { code: "pages.invalid" });
    // The person's own editor writes Pages' structure; its saves are not second-guessed.
    const own = await client.invoke(caller, actions.update, { id: document.id, body: body("我自己改的"), expected_version: updated.version });
    assert.match(JSON.stringify(own.document.body), /我自己改的/);
  });
});

test("rewriting a body from Markdown keeps the title the person gave; only a new document takes its title from the Markdown", async () => {
  await fixture(async ({ bound, caller, client }) => {
    const { document: titled } = await bound.invoke(actions.create, { title: "周会纪要" });
    const agent = bindActionClient(client, () => ({ ...caller, actor_id: "runtime:x", audience: "agent" }));
    for (const writer of [bound, agent]) {
      await writer.invoke(actions.update, { id: titled.id, markdown: "## 进展\n\n- 上线灰度\n" });
      assert.equal((await bound.invoke(actions.get, { id: titled.id })).document.title, "周会纪要");
    }
    const { document: fresh } = await bound.invoke(actions.create, { markdown: "# 来自 Markdown 的标题\n\n正文" });
    assert.equal(fresh.title, "来自 Markdown 的标题");
  });
});
