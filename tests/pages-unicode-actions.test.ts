import assert from "node:assert/strict";
import test from "node:test";
import { pagesActions as actions, pagesContentActions as content } from "@molis-ai/molis-work-plugin-pages";
import { body, fixture, selection } from "./fixtures/pages-action-host.js";

test("RAC-1857: 存为文档 titles the document with up to 80 whole characters, and a longer title ends in 「…」 at the 80th", async () => {
  // Pages counts a title in characters (pages.create's schema, normalizeTitle). One 🟢 is one character but two UTF-16 units.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const inputOf = async (text: string, request: string) => (await bound.invoke(actions.intakeOffers, selection({ targets: [{ kind: "text_range", role: "paragraph", text }] }, request))).offers[0]!.input as { title: string };
    assert.equal((await inputOf(wide(80), "req-80")).title, wide(80), "80 characters are kept whole");
    const cut = await inputOf("题" + wide(80), "req-81");
    assert.equal(cut.title, "题" + wide(78) + "…", "81 characters become 79 and 「…」");
    assert.equal((await bound.invoke(actions.create, cut as never)).document.title, cut.title, "Pages accepts the cut title");
  });
});

test("RAC-1857: 存为文档 names its source with up to 80 whole characters of the document's title", async () => {
  // The last line of the text says where it came from: the source's title, clipped like the document's own.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const markdownOf = async (title: string, request: string) => ((await bound.invoke(actions.intakeOffers, selection({ object: { kind: "pages_document", id: "doc-1", version: 3, title } }, request))).offers[0]!.input as { markdown: string }).markdown;
    assert.equal(await markdownOf(wide(80), "req-s80"), `接口先不改，只加一层适配。\n\n摘自『${wide(80)}』`, "a source of 80 characters is named whole");
    assert.equal(await markdownOf("源" + wide(80), "req-s81"), `接口先不改，只加一层适配。\n\n摘自『${"源" + wide(78)}…』`, "a longer one becomes 79 characters and 「…」");
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

test("RAC-1859: the writing assistant's input from a whole document is cut at 180000 whole characters, never half of one", async () => {
  // fragment-offers cuts the document's text to the 180000 characters pages.ai's `text` holds. One 🟢 is one character but two UTF-16 units.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    const { document } = await bound.invoke(actions.create, { title: "长文", body: body("a" + wide(180_000)) });
    const prepared = await bound.invoke(actions.fragmentOffers, { request_id: "long-text", fragment: {
      object: { kind: "pages_document", id: document.id, version: document.version, title: document.title },
      granularity: "object",
      targets: [{ kind: "object" as const, role: "object", text: "摘录" }],
    } });
    const summarize = prepared.offers.find((offer) => offer.offer_id === "summarize");
    assert.ok(summarize, "a whole document offers a summary");
    const sent = (summarize.input as { text: string }).text;
    assert.equal([...sent].length, 180_000, "the text is cut to 180000 whole characters");
    assert.ok(sent.startsWith("a🟢") && sent.endsWith("🟢"), "it ends on a whole character");
  });
});

test("RAC-1860: the card for several documents is cut at 600 whole characters, never half of one", async () => {
  // fragment-offers cuts the card's summary to the 600 characters the offers' output schema holds. One 🟢 is one character but two UTF-16 units.
  await fixture(async ({ bound }) => {
    const wide = (count: number) => "🟢".repeat(count);
    // Eight documents, the most one selection holds, each with an 80-character title, the most a document's title holds.
    const titles = ["题" + wide(79), ...Array.from({ length: 7 }, () => wide(80))];
    const prepared = await bound.invoke(actions.fragmentOffers, { request_id: "long-names", fragment: {
      object: { kind: "pages_document", id: "d1", version: 1, title: "甲" },
      granularity: "objects",
      targets: titles.map((title, index) => ({ kind: "object" as const, role: "object", text: "正文",
        ref: { kind: "pages_document", id: `d${index + 1}`, version: 1, title } })),
    } });
    const synthesize = prepared.offers.find((offer) => offer.offer_id === "synthesize");
    assert.ok(synthesize, "several documents offer a synthesis");
    const names = titles.slice(0, 7).map((title) => `「${title}」`).join("");
    assert.equal(synthesize.summary, `用 8 篇文档${names}「${wide(18)}`, "the summary keeps 600 whole characters");
  });
});
