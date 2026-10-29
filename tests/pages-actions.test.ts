import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { pagesActions as actions, pagesContentActions as content, PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { HostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { initializeBoard } from "./fixtures/goals-board.js";

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
    await initializeBoard(host, ref, { actor_id: "owner", idempotency_key: "init" });
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
    const delivery = { title: "Workflow", body: "# Shared\nActual content", request_id: "workflow:workflow-1:1" };
    const received = await bound.invoke(content.receive, delivery);
    assert.equal((await bound.invoke(content.receive, delivery)).item_id, received.item_id, "W4-6-02 the same request id returns the document it made");
    const receivedDocument = await bound.invoke(actions.get, { id: received.item_id });
    assert.match(JSON.stringify(receivedDocument.document.body), /Actual content/);
    await assert.rejects(client.invoke({ ...caller, allowed_capability_ids: [content.receive.capability_id] }, content.receive,
      { title: "Bypass", body: "Denied", request_id: "workflow:workflow-1:2" }), { code: "actions.forbidden" });
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
      const artifact = runtime.artifacts.query.getArtifactVersion(ref.project_id, promoted.artifact);
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

test("pages.ai declares the candidate text, the command and the style, and no placeholder flag", () => {
  const output = actions.ai.action.output_schema as { properties: Record<string, unknown>; required?: string[] };
  assert.deepEqual(Object.keys(output.properties).sort(), ["command", "style", "text"]);
  assert.deepEqual([...(output.required ?? [])].sort(), ["command", "text"]);
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
        assert.deepEqual(await pending, { text: "Actual candidate", command: "rewrite", style: undefined });
        assert.match(prompts[0]!, /Source selected text/);
        const translated = await bound.invoke(actions.ai, { id: document.id, command: "translate_new", text: "Original" });
        assert.equal("stub" in translated, false, "the result no longer carries the retired placeholder flag"); assert.equal(translated.text, "Actual candidate");
        assert.equal((await bound.invoke(actions.list, {})).documents.length, 1, "a candidate is returned, not saved as a document");
      } else {
        const rejection = assert.rejects(pending, mode === "missing" ? { code: "actions.connection_required" }
          : mode === "failure" ? { code: "plugin.model_failed", message: "模型请求失败，请重试" } : mode === "empty" ? /模型没有返回文字/
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
  const { actionEffect } = await import("@molis-ai/molis-work-contracts/platform/actions");
  assert.deepEqual(actions.create.action.undo, { capability_id: "pages.discard", version: 1, input: { id: "document.id", expected_version: "created_version" } });
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
      const current = (await bound.invoke(actions.get, { id: titled.id })).document;
      await writer.invoke(actions.update, { id: titled.id, expected_version: current.version, markdown: "## 进展\n\n- 上线灰度\n" });
      assert.equal((await bound.invoke(actions.get, { id: titled.id })).document.title, "周会纪要");
    }
    const { document: fresh } = await bound.invoke(actions.create, { markdown: "# 来自 Markdown 的标题\n\n正文" });
    assert.equal(fresh.title, "来自 Markdown 的标题");
  });
});

// ---- W4-2 (specs/context-program §21.10): 存为文档 is Pages' own creation entry -----------------------------------------------------
const selection = (over: Record<string, unknown>, request_id = "req-1") => ({ request_id, fragment: {
  object: { kind: "pages_document", id: "doc-1", version: 3, title: "留存计划" }, granularity: "range",
  targets: [{ kind: "text_range", role: "paragraph", text: "接口先不改，只加一层适配。" }], ...over } }) as never;

test("W4-2-06 W4-2-12: 存为文档 is declared on pages.create@2 with its own deterministic offers query, and the declarations check", () => {
  assert.equal(actions.create.version, 2);
  // RAC-633-MIG-01: only creation and the revised subject reader have version 2; all other contracts stay at version 1.
  for (const action of Object.values(actions)) assert.equal(action.version, ["pages.create", "pages.subject.read"].includes(action.capability_id) ? 2 : 1, action.capability_id);
  const intake = actions.create.action.intake!;
  assert.deepEqual([intake.intake_id, intake.verb, intake.material_field, intake.effect, intake.prepare], ["document", "存为文档", "markdown", undefined, { capability_id: "pages.intake.offers", version: 1 }]);
  assert.ok(intake.examples.length >= 1 && intake.examples.length <= 3);
  assert.equal(actions.create.action.undo?.capability_id, "pages.discard", "taken back by Pages' own undo, not by a platform rule");
  assert.equal(actions.intakeOffers.operation, "query");
  assert.deepEqual(inspectActionDeclarations([actions.create, actions.discard, actions.intakeOffers], undefined), []);
});

test("W4-2-06: the offer is the whole input of pages.create from the selection: title from the heading above or its first line, the source on the last line", async () => {
  await fixture(async ({ bound }) => {
    const offerOf = async (over: Record<string, unknown>, request = "req-1") => (await bound.invoke(actions.intakeOffers, selection(over, request))).offers;
    // Under a heading: the nearest heading names it; the text is the selection, then where it came from.
    const [under] = await offerOf({ heading_path: ["方案", "兼容性"] });
    assert.deepEqual([under!.offer_id, under!.title, under!.action], ["document", "存为文档", { capability_id: "pages.create", version: 2 }]);
    assert.deepEqual(under!.input, { title: "兼容性", markdown: "接口先不改，只加一层适配。\n\n摘自『留存计划』", request_id: "req-1" });
    assert.deepEqual(under!.editable, ["title", "markdown"]);
    // No heading: the selection's own first line, without a list marker.
    const [plain] = await offerOf({ targets: [{ kind: "block", role: "list", text: "- 先做适配层\n- 再迁移调用方" }] });
    assert.equal((plain!.input as { title: string }).title, "先做适配层");
    // A selected heading is the title and stays a heading in the text.
    const [heading] = await offerOf({ granularity: "blocks", targets: [{ kind: "block", role: "heading", text: "兼容性" }, { kind: "block", role: "paragraph", text: "只加一层适配。" }] });
    assert.deepEqual(heading!.input, { title: "兼容性", markdown: "## 兼容性\n\n只加一层适配。\n\n摘自『留存计划』", request_id: "req-1" });
    // Long first lines are cut; a cut selection says so on the card.
    const [long] = await offerOf({ targets: [{ kind: "text_range", role: "paragraph", text: "很".repeat(120), truncated: true }] });
    assert.equal((long!.input as { title: string }).title.length, 80);
    assert.match(long!.summary!, /选中的内容太长，只存了前面的部分/u);
    // The cut never falls inside an emoji: no half of a pair is left at the end of the title, and Pages still accepts it.
    const [emoji] = await offerOf({ targets: [{ kind: "text_range", role: "paragraph", text: `a${"😀".repeat(60)}` }] });
    const emojiTitle = (emoji!.input as { title: string }).title;
    assert.equal(emojiTitle, `a${"😀".repeat(39)}…`);
    assert.doesNotMatch(emojiTitle, /[\ud800-\udfff]/u, "with the u flag only a lone half of a pair matches");
    assert.equal((await bound.invoke(actions.create, emoji!.input as never)).document.title, emojiTitle);
    // No document in a blank selection, a word, or whole objects.
    assert.deepEqual(await offerOf({ targets: [{ kind: "text_range", role: "paragraph", text: "   " }] }), []);
    assert.deepEqual(await offerOf({ granularity: "word" }), []);
    assert.deepEqual(await offerOf({ granularity: "objects" }), []);
  });
});

test("W4-2-06: pages.create with a request id makes the document once; other content under the same request is refused; preparing needs the read permission", async () => {
  await fixture(async ({ bound, client, caller }) => {
    const [offer] = (await bound.invoke(actions.intakeOffers, selection({}, "req-same"))).offers;
    const first = await bound.invoke(actions.create, offer!.input as never);
    const again = await bound.invoke(actions.create, offer!.input as never);
    assert.equal(again.document.id, first.document.id, "the same request is the same document");
    // Only the call that made the document can take it back: the undo reads `created_version`, which a retry does not carry.
    assert.deepEqual([first.created_version, again.created_version], [1, undefined]);
    assert.equal((await bound.invoke(actions.list, {})).documents.length, 1);
    assert.equal(first.document.title, "接口先不改，只加一层适配。");
    const [other] = (await bound.invoke(actions.intakeOffers, selection({}, "req-other"))).offers;
    assert.notEqual((await bound.invoke(actions.create, other!.input as never)).document.id, first.document.id);
    assert.equal((await bound.invoke(actions.list, {})).documents.length, 2);
    await assert.rejects(bound.invoke(actions.create, { ...(offer!.input as object), markdown: "别的内容" } as never), { code: "pages.unavailable", message: /同一个请求的内容已改变，请重新发起/u });
    // Without a request id, create behaves as it always did.
    assert.equal((await bound.invoke(actions.create, { title: "无请求号" })).created_version, 1);
    assert.equal((await bound.invoke(actions.list, {})).documents.length, 3);
    // A request whose document has been deleted since is not made again, and says so in create's own words.
    await bound.invoke(actions.delete, { id: first.document.id });
    await assert.rejects(bound.invoke(actions.create, offer!.input as never), { code: "pages.unavailable", message: /这个请求已完成，但其中的文档已被删除；不会重新创建/u });
    await assert.rejects(client.invoke({ ...caller, permissions: ["pages:write"] }, actions.intakeOffers, selection({})), { code: "actions.forbidden" });
  });
});
test("RAC-1625: Pages counts a document's title in Unicode characters, as its action schemas do", async () => {
  // create and update in src/actions.ts allow an 80-character title; one 🟢 is one character but two UTF-16 units.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const { document } = await bound.invoke(actions.create, { title: wide(80) });
    assert.equal(document.title, wide(80), "create keeps an 80-character title");
    const renamed = (await bound.invoke(actions.update, { id: document.id, title: "改" + wide(79) })).document;
    assert.equal(renamed.title, "改" + wide(79), "update keeps an 80-character title");
    assert.equal((await bound.invoke(actions.get, { id: document.id })).document.title, "改" + wide(79), "the stored title reads back whole");
    await assert.rejects(bound.invoke(actions.create, { title: wide(81) }), { code: "actions.input_invalid" }, "81 characters is still past the schema");
  });
});

test("RAC-1626: a folder name is counted in Unicode characters, as the folder actions' schemas do", async () => {
  // folders.create and folders.update in src/actions.ts allow a 40-character name.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const { folder } = await bound.invoke(actions.createFolder, { title: wide(40) });
    assert.equal(folder.title, wide(40), "folders.create keeps a 40-character name");
    const renamed = (await bound.invoke(actions.updateFolder, { id: folder.id, title: "夹" + wide(39) })).folder;
    assert.equal(renamed.title, "夹" + wide(39), "folders.update keeps a 40-character name");
    await assert.rejects(bound.invoke(actions.createFolder, { title: wide(41) }), { code: "actions.input_invalid" }, "41 characters is still past the schema");
  });
});

test("RAC-1627: a workflow hand-off's long title is cut at whole Unicode characters, never half of one", async () => {
  // receive in src/content-actions.ts cuts the headline to the 80 characters a title holds, then saves it through pages.documents.import.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const received = await bound.invoke(content.receive, { title: "收" + wide(80), body: "正文", request_id: "workflow:unicode-title:1" });
    assert.equal((await bound.invoke(actions.get, { id: received.item_id })).document.title, "收" + wide(79), "the stored title keeps 80 whole characters");
  });
});

test("RAC-1688: a document created from Markdown keeps a leading heading of 80 characters as its whole title", async () => {
  // create in src/actions.ts takes the title from the Markdown's heading when none is given; one 🟢 is one character but two UTF-16 units.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const { document } = await bound.invoke(actions.create, { markdown: "# " + wide(80) + "\n\n正文" });
    assert.equal(document.title, wide(80), "the 80-character heading is the whole title");
  });
});

test("RAC-1688: extracting cuts a task card's title and a knowledge page's title at whole characters, and extracting again adds nothing", async () => {
  // A task item past 80 characters becomes a card with its first 80; a section becomes a page named "<source> · <heading>", each part clipped
  // to 32 characters (31 and "…"). One 🟢 is one character but two UTF-16 units.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const text = (value: string) => [{ type: "text", text: value }];
    const content = [
      { type: "heading", attrs: { level: 2 }, content: text("节" + wide(40)) },
      { type: "paragraph", content: text("Enough original text to form a knowledge page.") },
      { type: "task_list", content: [{ type: "task_item", content: [{ type: "paragraph", content: text("务" + wide(80)) }] }] },
    ];
    const { document } = await bound.invoke(actions.create, { title: "源源" + wide(40), body: { type: "doc", content } });
    const result = await bound.invoke(actions.extract, { id: document.id });
    assert.equal(result.cards, 1);
    assert.equal(result.created.length, 1);
    assert.equal(result.created[0]!.title, "源源" + wide(29) + "… · 节" + wide(30) + "…", "the knowledge page's title keeps 31 whole characters of each part");
    const cards = (result.document.body.content as readonly { type?: string; attrs?: { title?: string } }[]).filter((node) => node.type === "task_card");
    assert.equal(cards.length, 1);
    assert.equal(cards[0]!.attrs?.title, "务" + wide(79), "the card's title is the task's first 80 whole characters");
    const again = await bound.invoke(actions.extract, { id: document.id });
    assert.equal(again.cards, 0, "the same task is not carded twice");
    assert.equal(again.created.length, 0, "the same section is not paged twice");
  });
});

test("RAC-1689: the synthesis offered for several documents is titled with 80 whole characters, never half of one", async () => {
  // fragment-offers cuts "综合：" and the first three titles to the 80 characters pages.generate's title holds. One 🟢 is one character but two UTF-16 units.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const make = async () => (await bound.invoke(actions.create, { title: wide(40) })).document;
    const documents = [await make(), await make(), await make()];
    const prepared = await bound.invoke(actions.fragmentOffers, { request_id: "wide-titles", fragment: {
      object: { kind: "pages_document", id: documents[0]!.id, version: documents[0]!.version, title: documents[0]!.title },
      granularity: "objects",
      targets: documents.map((record) => ({ kind: "object" as const, role: "object", text: "正文",
        ref: { kind: "pages_document", id: record.id, version: record.version, title: record.title } })),
    } });
    const synthesize = prepared.offers.find((offer) => offer.offer_id === "synthesize");
    assert.ok(synthesize, "several documents offer a synthesis");
    assert.equal((synthesize.input as { title: string }).title, `综合：${wide(40)} · ${wide(34)}`, "the title keeps 80 whole characters");
  });
});
