import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { ActionService, CapabilityRegistry } from "@molis-ai/molis-work-kernel";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesBody, PagesCommentThread } from "@molis-ai/molis-work-plugin-pages/contract";
import type { AssistantThreadContext } from "@molis-ai/molis-work-contracts/services/assistant";
import { createPagesCommentHandlers, ownPagesStores, pageAnnotations, pagesCommentActions } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";

const body = (marked: boolean): PagesBody => ({ type: "doc", content: [{ type: "paragraph", attrs: { note: "保留块备注" }, content: [{ type: "text", text: "可定位的原文", ...(marked ? { marks: [{ type: "comment", attrs: { id: "mark-1", text: "保留原批注" } }] } : {}) }] }] });

test("PAS-02 PAS-09: Pages persists scoped threads, preserves annotations and notes, detaches deleted anchors and deduplicates retries", async () => {
  const home = await mkdtemp(join(tmpdir(), "pages-comments-"));
  let store = openPagesStore(home);
  try {
    const page = store.create({ project_id: "a", title: "评论来源", body: body(true) });
    const input = { page_id: page.id, thread_id: "thread-1", request_id: "send-1", body: "请比较这段", expected_version: page.version, anchor: { kind: "text" as const, mark_id: "mark-1" } };
    const first = store.comments.append(input, "a");
    assert.equal(first.messages.length, 2);assert.equal(first.messages[0]!.author, "annotation");
    assert.equal(first.messages[0]!.body, "保留原批注");assert.equal(first.anchor.excerpt, "可定位的原文");
    assert.deepEqual(store.get(page.id, "a").body, body(true));
    assert.deepEqual(store.comments.append(input, "a"), first);
    assert.throws(() => store.comments.append({ ...input, body: "不同内容" }, "a"), /内容已改变/);
    assert.throws(() => store.comments.list(page.id, "b"), /不存在|找不到/);
    assert.throws(() => store.comments.append({ ...input, thread_id: "bad-version", expected_version: 99 }, "a"), /正文已改变/);
    assert.throws(() => store.comments.append({ ...input, thread_id: "missing-mark", anchor: { kind: "text", mark_id: "absent" } }, "a"), /原文已不存在/);
    const changed = store.update(page.id, { body: body(false), expected_version: page.version }, "a");
    assert.equal(store.comments.get(page.id, first.thread_id, "a").detached, true);
    const response = { message_id: randomUUID(), author: "assistant" as const, body: "基于引用的答复", reply_to: first.messages.at(-1)!.message_id, request_id: "send-1", work_id: "work-1", run_id: "run-1", created_at: new Date().toISOString() };
    const replied = store.comments.reply(page.id, first.thread_id, "a", response);
    assert.equal(replied.messages.length, 3);assert.equal(replied.detached, true);
    assert.deepEqual(store.comments.reply(page.id, first.thread_id, "a", { ...response, message_id: randomUUID() }), replied);
    assert.deepEqual(store.get(page.id, "a"), changed, "reply cannot overwrite a document edited during the run");
    store.close();store = openPagesStore(home);assert.deepEqual(store.comments.get(page.id, first.thread_id, "a"), replied);
    assert.equal(await projectDeletedHooksFor(home).clear("pages", "a"), true);assert.throws(() => store.comments.list(page.id, "a"), /不存在|找不到/);
    const raw = openHomeSqliteDatabase(home, "pages");
    try { assert.equal(raw.prepare("SELECT count(*) AS n FROM page_comments").get()!.n, 0, "project deletion removes the discussion rows, not just their visible parent"); }
    finally { raw.close(); }
  } finally { store.close();await rm(home, { recursive: true, force: true }); }
});

test("PAS-08 PAS-10: real action dispatcher refuses forged authorship, wrong target, revoked permissions and expired delivery", async () => {
  const home = await mkdtemp(join(tmpdir(), "pages-comments-actions-")), store = openPagesStore(home);
  const service = new ActionService(new CapabilityRegistry<ActionCallContext>());
  service.registerProvider({ provider: { provider_id: "io.molis.work.pages", kind: "plugin", title: "Pages" }, definitions: Object.values(pagesCommentActions), handlers: createPagesCommentHandlers(ownPagesStores(run => run(store))) });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: ["pages:read", "pages:write"] };
  try {
    assert.deepEqual(inspectActionDeclarations(Object.values(pagesCommentActions), undefined), []);
    const page = store.create({ project_id: "a", title: "原评论", body: body(true) });
    const input = { page_id: page.id, thread_id: "thread", request_id: "send", body: "请助理回答", expected_version: page.version, anchor: { kind: "document" } };
    await assert.rejects(service.invoke(caller, pagesCommentActions.append, { ...input, author: "assistant" }), /输入|schema|author/i);
    const { thread } = await service.invoke(caller, pagesCommentActions.append, input) as { thread: PagesCommentThread };
    const target = { subject_id: page.id, thread_id: thread.thread_id };
    const contextInput = { ...target, message_id: thread.messages[0]!.message_id, draft: { text: "用户明确附上的未保存内容", revision: String(page.version) } };
    const context = await service.invoke(caller, pagesCommentActions.context, contextInput) as AssistantThreadContext;
    assert.match(context.text, /用户明确附上的未保存草稿/);assert.match(context.text, /未保存内容/);
    assert.doesNotMatch(context.text, /可定位的原文/);assert.deepEqual(store.get(page.id, "a").body, body(true));
    await assert.rejects(service.invoke(caller, pagesCommentActions.context, { ...contextInput, draft: { ...contextInput.draft, revision: "99" } }), /正文已改变/);
    await assert.rejects(service.invoke({ ...caller, project_id: "b" }, pagesCommentActions.context, contextInput), /不存在|找不到/);
    await assert.rejects(service.invoke(caller, pagesCommentActions.reply, target), /只能由宿主/);
    const delivery = { target: { provider_id: "io.molis.work.pages", subject_kind: "pages_document", ...target, title: "原评论" }, message_id: thread.messages[0]!.message_id, request_id: "send", work_id: "work", run_id: "run", body: "助理回答" };
    await assert.rejects(service.invoke({ ...caller, assistant_reply: { ...delivery, target: { ...delivery.target, thread_id: "wrong" } } }, pagesCommentActions.reply, target), /只能由宿主/);
    await assert.rejects(service.invoke({ ...caller, assistant_reply: delivery, permissions: ["pages:read"] }, pagesCommentActions.reply, target), /权限|不可|需要/);
    const abort = new AbortController();
    await assert.rejects(service.invoke({ ...caller, assistant_reply: delivery, signal: abort.signal, validate_authority: async () => { abort.abort(new Error("revoked")); } }, pagesCommentActions.reply, target), /revoked/);
    assert.equal(store.comments.get(page.id, thread.thread_id, "a").messages.length, 1);
    await service.invoke({ ...caller, assistant_reply: delivery }, pagesCommentActions.reply, target);
    assert.equal(store.comments.get(page.id, thread.thread_id, "a").messages.at(-1)!.body, "助理回答");
  } finally { store.close();await rm(home, { recursive: true, force: true }); }
});

test("PAS-08: generic thread declarations refuse agent audience, Home scope, wrong kind and mismatched role", () => {
  const context = pagesCommentActions.context;
  for (const action of [
    { ...context.action, audiences: ["agent"] },
    { ...context.action, scope: "home" },
    { ...context.action, thread_source: { role: "context", subject_kind: "unrelated" } },
    { ...context.action, thread_source: { role: "reply", subject_kind: "pages_document" } },
  ]) assert.ok(inspectActionDeclarations([{ ...context, action }], undefined).some(problem => problem.includes("评论协议")));
});
test("RAC-1632: pages.comments.append takes a 20000-character comment, counted in Unicode characters as its schema counts", async () => {
  // comment-actions.ts allows a 20000-character body; one 🟢 is one character but two UTF-16 units.
  const home = await mkdtemp(join(tmpdir(), "pages-comments-unicode-")), store = openPagesStore(home);
  const service = new ActionService(new CapabilityRegistry<ActionCallContext>());
  service.registerProvider({ provider: { provider_id: "io.molis.work.pages", kind: "plugin", title: "Pages" }, definitions: Object.values(pagesCommentActions), handlers: createPagesCommentHandlers(ownPagesStores(run => run(store))) });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: ["pages:read", "pages:write"] };
  const wide = (count: number) => "🟢".repeat(count);
  try {
    const page = store.create({ project_id: "a", title: "长评论", body: body(false) });
    const input = { page_id: page.id, thread_id: "wide", request_id: "send-1", body: wide(20000), expected_version: page.version, anchor: { kind: "document" } };
    const { thread } = await service.invoke(caller, pagesCommentActions.append, input) as { thread: PagesCommentThread };
    assert.equal(thread.messages.at(-1)!.body, wide(20000), "a new thread keeps a 20000-character comment");
    const next = await service.invoke(caller, pagesCommentActions.append, { ...input, request_id: "send-2", body: "评" + wide(19999) }) as { thread: PagesCommentThread };
    assert.equal(next.thread.messages.at(-1)!.body, "评" + wide(19999), "a second comment in the thread keeps 20000 characters");
    assert.deepEqual(store.comments.get(page.id, "wide", "a").messages.map(message => message.body), [wide(20000), "评" + wide(19999)], "the stored thread reads back whole");
    await assert.rejects(service.invoke(caller, pagesCommentActions.append, { ...input, thread_id: "too-long", body: wide(20001) }), { code: "actions.input_invalid" }, "20001 characters is still past the schema");
    assert.equal(store.comments.list(page.id, "a").length, 1, "the refused comment starts no thread");
  } finally { store.close();await rm(home, { recursive: true, force: true }); }
});

test("RAC-1633: the Pages comment store counts the trimmed comment in Unicode characters and still refuses one past 20000 or a blank one", async () => {
  // A caller that reaches the store without the action schema meets the same limit: trimmed, 1 to 20000 characters.
  const home = await mkdtemp(join(tmpdir(), "pages-comments-store-unicode-")), store = openPagesStore(home);
  const wide = (count: number) => "🟢".repeat(count);
  try {
    const page = store.create({ project_id: "a", title: "长评论", body: body(false) });
    const input = { page_id: page.id, thread_id: "store-wide", expected_version: page.version, anchor: { kind: "document" as const } };
    const kept = store.comments.append({ ...input, request_id: "send-1", body: "  " + wide(20000) + "\n" }, "a");
    assert.equal(kept.messages.at(-1)!.body, wide(20000), "the trimmed 20000-character comment is kept");
    assert.throws(() => store.comments.append({ ...input, request_id: "send-2", body: "评" + wide(20000) }, "a"), /评论须为 1 到 20000 个字/, "20001 characters is refused by the store too");
    assert.throws(() => store.comments.append({ ...input, request_id: "send-3", body: " \n " }, "a"), /评论须为 1 到 20000 个字/, "a blank comment is refused");
    assert.deepEqual(store.comments.get(page.id, "store-wide", "a").messages.map(message => message.body), [wide(20000)], "neither refused comment was saved");
  } finally { store.close();await rm(home, { recursive: true, force: true }); }
});

test("RAC-1690: pageAnnotations cuts a comment mark's quoted text to its first 2000 whole characters, across all the text nodes the mark covers", () => {
  // A mark covers every text node of the selection (a bold word inside it splits it in several). One 🟢 is one character but two UTF-16 units:
  // "批" and 1998 🟢 are 1999 characters in 3997 units, so unit 2000 is the first half of the 1000th 🟢.
  const wide = (count: number) => "🟢".repeat(count);
  const note = (id: string) => [{ type: "comment", attrs: { id, text: "批注" } }];
  const doc: PagesBody = { type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: "批" + wide(1998), marks: note("m1") },
    { type: "text", text: wide(5), marks: note("m1") },
    { type: "text", text: wide(2000), marks: note("m2") },
  ] }] };
  const marks = pageAnnotations(doc);
  assert.equal(marks.get("m1")!.excerpt, "批" + wide(1999), "two nodes of 2004 characters together are cut to the first 2000, whole");
  assert.equal(marks.get("m2")!.excerpt, wide(2000), "a node of exactly 2000 characters is kept whole");
});

test("RAC-1690: a new comment on a long selection stores its quote as the first 2000 whole characters, and the thread reads it back the same", async () => {
  // The quote is stored with the thread. "评" and 2000 🟢 are 2001 characters but 4001 UTF-16 units, so unit 2000 is the first half of the 1000th 🟢.
  const home = await mkdtemp(join(tmpdir(), "pages-comments-quote-")), store = openPagesStore(home);
  const wide = (count: number) => "🟢".repeat(count);
  try {
    const long: PagesBody = { type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "评" + wide(2000), marks: [{ type: "comment", attrs: { id: "m1", text: "" } }] },
    ] }] };
    const page = store.create({ project_id: "a", title: "长选区", body: long });
    const started = store.comments.append({ page_id: page.id, thread_id: "long-quote", request_id: "send-1", body: "请看这一段", expected_version: page.version,
      anchor: { kind: "text", mark_id: "m1" } }, "a");
    assert.equal(started.anchor.excerpt, "评" + wide(1999), "the new thread quotes the first 2000 whole characters");
    assert.equal(store.comments.get(page.id, "long-quote", "a").anchor.excerpt, "评" + wide(1999), "the stored thread reads the quote back the same");
  } finally { store.close();await rm(home, { recursive: true, force: true }); }
});

// RAC-1970 to RAC-1973: what the assistant is handed for a comment is cut at 30000 UTF-16 units a part, never in the middle of a character.
// One 🟢 is one character but two UTF-16 units; "评" and "尾" are one of each.
const emoji = (count: number) => "🟢".repeat(count);
// Half of a character left on its own: a first half with no second half after it, or a second half with no first half before it.
const halfCharacter = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
/** A long string in a few words, for a failure message: how many units and characters it has, and how it starts and ends. */
const shape = (value: string) => {
  const characters = [...value];
  return `${value.length} units, ${characters.length} characters, starts ${JSON.stringify(characters.slice(0, 2).join(""))}, ends ${JSON.stringify(characters.slice(-2).join(""))}`;
};
const same = (actual: string, expected: string, what: string) => assert.ok(actual === expected, `${what}: got ${shape(actual)}, wanted ${shape(expected)}`);
/** The two parts of a context text, each with the note written above it. */
function contextParts(text: string) {
  const match = /\n正文([^\n]*):\n([\s\S]*?)\n\n本评论线程([^\n]*):\n([\s\S]*)$/.exec(text);
  assert.ok(match, "the context text has a document part and a thread part");
  return { documentNote: match[1]!, document: match[2]!, threadNote: match[3]!, thread: match[4]! };
}
/** A temp Home with the Pages store and the real action dispatcher, and a thread of `comments`. `use` is handed a reader of what the assistant is given for the last comment, with its argument as the document, and that comment's id. */
async function withThread<T>(options: { comments: string[]; body?: PagesBody; anchor?: { kind: "document" } | { kind: "text"; mark_id: string } },
  use: (context: (draft: string) => Promise<AssistantThreadContext>, messageId: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "pages-comments-context-")), store = openPagesStore(home);
  const service = new ActionService(new CapabilityRegistry<ActionCallContext>());
  service.registerProvider({ provider: { provider_id: "io.molis.work.pages", kind: "plugin", title: "Pages" }, definitions: Object.values(pagesCommentActions), handlers: createPagesCommentHandlers(ownPagesStores(run => run(store))) });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: ["pages:read", "pages:write"] };
  try {
    const page = store.create({ project_id: "a", title: "长文档", body: options.body ?? body(false) });
    const first = { page_id: page.id, thread_id: "context-thread", request_id: "send-1", body: options.comments[0]!, expected_version: page.version, anchor: options.anchor ?? { kind: "document" as const } };
    let thread: PagesCommentThread | undefined;
    for (const [index, comment] of options.comments.entries()) {
      thread = (await service.invoke(caller, pagesCommentActions.append, { ...first, request_id: `send-${index + 1}`, body: comment }) as { thread: PagesCommentThread }).thread;
    }
    const messageId = thread!.messages.at(-1)!.message_id;
    return await use(async draft => await service.invoke(caller, pagesCommentActions.context, { subject_id: page.id, thread_id: "context-thread", message_id: messageId,
      draft: { text: draft, revision: String(page.version) } }) as AssistantThreadContext, messageId);
  } finally { store.close();await rm(home, { recursive: true, force: true }); }
}

test("RAC-1970: the document part of a comment's context is its first 30000 UTF-16 units, and a character the cut would split is left out whole", async () => {
  await withThread({ comments: ["请看这一段"] }, async context => {
    // "评" and 15001 🟢 are 30003 units. Unit 30000 is the first half of the 15000th 🟢, so the cut leaves that 🟢 out: 29999 units.
    const split = contextParts((await context("评" + emoji(15001))).text);
    same(split.document, "评" + emoji(14999), "30000 units would end in half a 🟢, so the cut leaves that 🟢 out whole");
    assert.doesNotMatch(split.document, halfCharacter, "no half of a character is left at the end of the document part");
    // 15001 🟢 are 30002 units. The 30000th unit is the second half of the 15000th 🟢, so the cut falls between two characters and leaves nothing out.
    same(contextParts((await context(emoji(15001))).text).document, emoji(15000), "a cut between two characters keeps all 30000 units");
    // Characters of one unit are cut exactly as before.
    const oneUnit = await context("评".repeat(30001));
    same(contextParts(oneUnit.text).document, "评".repeat(30000), "text of one-unit characters is cut at 30000 characters, as before");
    assert.equal(oneUnit.truncated, true, "30001 units are marked as cut");
    // 30000 units fit whole.
    const exact = await context(emoji(15000));
    same(contextParts(exact.text).document, emoji(15000), "30000 units fit whole");
    assert.equal(exact.truncated, false, "30000 units are not marked as cut");
    assert.equal(contextParts(exact.text).documentNote, "", "and have no note above them");
  });
});

test("RAC-1971: the thread part of a comment's context is its last 30000 UTF-16 units, and a character the cut would split is left out whole", async () => {
  // The line before a comment in the thread part is `user [<id>]: `: 4 + 2 + 36 + 3 = 45 units, so a comment of 29955 units makes a thread part of exactly 30000.
  const lineBefore = 45;
  // 19999 🟢 and "尾" are 39999 units. Counting from the end, unit 30000 is the second half of a 🟢, so the cut leaves that 🟢 out: 29999 units.
  const split = await withThread({ comments: [emoji(19999) + "尾"] }, async context => contextParts((await context("草稿")).text));
  same(split.thread, emoji(14999) + "尾", "counting from the end, unit 30000 is the second half of a 🟢, so the cut leaves that 🟢 out whole");
  assert.doesNotMatch(split.thread, halfCharacter, "no half of a character is left at the start of the thread part");
  // "评" and 19999 🟢 are 39999 units, and the line before adds 45. Counting from the end, unit 30000 is the first half of a 🟢: the cut falls between two characters.
  const between = await withThread({ comments: ["评" + emoji(19999)] }, async context => contextParts((await context("草稿")).text));
  same(between.thread, emoji(15000), "a cut between two characters keeps all 30000 units");
  // A comment is at most 20000 characters (comment-actions.ts:30), so these two are built from emoji to reach 29955 and 29956 units within that cap (one 🟢 is two units, one character).
  const exactComment = emoji(14977) + "尾";
  assert.equal(exactComment.length, 30000 - lineBefore, "the comment is 29955 units: 14977 🟢 and 尾, under the 20000-character cap");
  const exact = await withThread({ comments: [exactComment] }, async (context, messageId) => ({ messageId, handed: await context("草稿") }));
  const exactLine = `user [${exact.messageId}]: `;
  assert.equal(exactLine.length, lineBefore, "the line before a comment is 45 units");
  same(contextParts(exact.handed.text).thread, exactLine + exactComment, "30000 units fit whole");
  assert.equal(exact.handed.truncated, false, "30000 units are not marked as cut");
  assert.equal(contextParts(exact.handed.text).threadNote, "", "and have no note above them");
  const overComment = emoji(14978);
  assert.equal(overComment.length, 30001 - lineBefore, "the comment is 29956 units: 14978 🟢, under the 20000-character cap");
  const over = await withThread({ comments: [overComment] }, async (context, messageId) => ({ messageId, handed: await context("草稿") }));
  same(contextParts(over.handed.text).thread, `user [${over.messageId}]: `.slice(1) + overComment, "one unit too many drops one unit from the start");
  assert.equal(over.handed.truncated, true, "30001 units are marked as cut");
});

test("RAC-1972: the note above a cut part says what the cut kept, in words that hold for it, and a part that fits has no note", async () => {
  await withThread({ comments: ["请看"] }, async (context, messageId) => {
    const plain = await context("短草稿");
    assert.equal(plain.text, `Page: 长文档\n版本: ${plain.revision}（用户明确附上的未保存草稿）\n引用: 长文档\n正文:\n短草稿\n\n本评论线程:\nuser [${messageId}]: 请看`, "nothing is cut, so no note is written");
    assert.equal(plain.truncated, false, "and the context is not marked as cut");
    const longDocument = await context("评".repeat(30001));
    const opening = contextParts(longDocument.text);
    assert.equal(opening.documentNote, "（只取开头的部分，不超过 30000 字）", "a cut document says it is the opening part, of at most 30000 characters");
    assert.equal(opening.threadNote, "", "a thread that fits has no note");
    assert.ok(opening.document.length <= 30000 && [...opening.document].length <= 30000, "the 30000 holds whether a character counts as one unit or as one character");
    assert.equal(longDocument.truncated, true, "and the context is marked as cut");
  });
  // 16000 🟢 are 32000 units, and the line before the comment adds 45.
  await withThread({ comments: [emoji(16000)] }, async context => {
    const longThread = await context("短草稿");
    const latest = contextParts(longThread.text);
    assert.equal(latest.threadNote, "（只取最近的部分，不超过 30000 字）", "a cut thread says it is the latest part, of at most 30000 characters");
    assert.equal(latest.documentNote, "", "a document that fits has no note");
    assert.ok(latest.thread.length <= 30000 && [...latest.thread].length <= 30000, "the 30000 holds whether a character counts as one unit or as one character");
    assert.equal(longThread.truncated, true, "and the context is marked as cut");
  });
});

test("RAC-1973: with every character an emoji, the whole context text still fits the 100000 UTF-16 units the Host takes", async () => {
  // assistant-threads.ts refuses a context text longer than 100000 units (actions.output_invalid). 30000 whole characters in each part would be 60000 + 60000 units;
  // 30000 units in each part make about 64000 with the 4000-unit quote below.
  const marked: PagesBody = { type: "doc", content: [{ type: "paragraph", content: [
    { type: "text", text: emoji(2000), marks: [{ type: "comment", attrs: { id: "m1", text: "" } }] },
  ] }] };
  await withThread({ body: marked, anchor: { kind: "text", mark_id: "m1" }, comments: [emoji(20000), emoji(20000)] }, async context => {
    const handed = await context(emoji(40000));
    assert.ok(handed.text.includes("引用: " + emoji(2000) + "\n"), "the quoted text is 2000 🟢, 4000 units");
    const parts = contextParts(handed.text);
    assert.ok(parts.document.length <= 30000 && parts.thread.length <= 30000, `each part is at most 30000 units: the document part is ${parts.document.length}, the thread part ${parts.thread.length}`);
    assert.ok(handed.text.length <= 100000, `the whole text is at most 100000 units: it is ${handed.text.length}`);
  });
});
