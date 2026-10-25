// W5-06 remainder, slice 4 (PG-088): Pages converts Markdown to a document body through a public action, so the first-run flow needs
// none of Pages' internals; the action reads and writes nothing, is offered to the person only, and never returns more than one
// document holds.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionAudience, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesActions, PAGES_ACTION_PERMISSIONS, blocksFromMarkdown, openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";

async function fixture(run: (f: { as(audience: ActionAudience): ReturnType<typeof bindActionClient>; home: string }) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "pages-body-from-markdown-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: PAGES_ACTION_PERMISSIONS };
  try {
    await host.withProject(ref, runtime => runtime.coordinator.initializeBoard({ project_id: ref.project_id, actor_id: "owner", idempotency_key: "init" }));
    await run({ home, as: audience => bindActionClient(host.actionClient(ref), () => ({ ...caller, audience })) });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
}

test("RAC-615 the body the action returns is the one Pages' own Markdown reader makes; text it cannot read as structure becomes paragraphs", async () => {
  await fixture(async ({ as }) => {
    const markdown = "# Title\n\n- one\n- two\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nplain closing line\n";
    const blocks = blocksFromMarkdown(markdown);
    assert.ok(blocks, "the sample is structured text");
    const { body } = await as("user").invoke(pagesActions.bodyFromMarkdown, { markdown });
    assert.deepEqual(body, { type: "doc", content: blocks.map(block => block.toJSON()) });
    // A body with the document shape the importer takes, so the first-run flow can hand it straight to `importDocuments`.
    const plain = "no structure here, just a sentence";
    const expected = blocksFromMarkdown(plain);
    const converted = (await as("user").invoke(pagesActions.bodyFromMarkdown, { markdown: plain })).body;
    assert.deepEqual(converted, { type: "doc", content: expected ? expected.map(block => block.toJSON()) : [{ type: "paragraph", content: [{ type: "text", text: plain }] }] });
  });
});

test("RAC-615 the action reads and writes no document", async () => {
  await fixture(async ({ as, home }) => {
    const before = openPagesStore(home);
    try { assert.equal(before.list("a").length, 0); } finally { before.close(); }
    await as("user").invoke(pagesActions.bodyFromMarkdown, { markdown: "# Only converted" });
    const after = openPagesStore(home);
    try { assert.equal(after.list("a").length, 0, "no document was made"); } finally { after.close(); }
    assert.equal(pagesActions.bodyFromMarkdown.operation, "query");
    assert.deepEqual(pagesActions.bodyFromMarkdown.action.permissions, ["pages:read"]);
  });
});

test("RAC-616 RAC-617 only the person is offered it: workflows, agents and MCP do not see it and cannot call it", async () => {
  await fixture(async ({ as }) => {
    assert.deepEqual(pagesActions.bodyFromMarkdown.action.audiences, ["user"]);
    const capability = pagesActions.bodyFromMarkdown.capability_id;
    for (const audience of ["workflow", "agent", "mcp"] as const) {
      const rows = await as(audience).discover();
      assert.ok(!rows.some(row => row.capability_id === capability), `${audience}: not in its catalog`);
      await assert.rejects(as(audience).invoke(pagesActions.bodyFromMarkdown, { markdown: "# x" }), `${audience}: cannot call it`);
    }
    assert.ok((await as("user").discover()).some(row => row.capability_id === capability), "the person sees it");
  });
});

test("RAC-617 a text that converts to more than one document holds gets pages.body_too_large, not a cut or a huge body", async () => {
  await fixture(async ({ as }) => {
    // Twenty-five thousand one-letter headings: a short text whose body is far over a document's 1,500,000 characters.
    const markdown = "# a\n\n".repeat(25_000);
    assert.ok(markdown.length < 1_000_000, "within what the action reads");
    await assert.rejects(as("user").invoke(pagesActions.bodyFromMarkdown, { markdown }), { code: "pages.body_too_large" });
    // Under the limit it converts, and the result never passes it.
    const { body } = await as("user").invoke(pagesActions.bodyFromMarkdown, { markdown: "# a\n\n".repeat(5_000) });
    assert.ok(JSON.stringify(body).length <= 1_500_000);
    // Over what the action reads at all, the input is refused before anything is converted.
    await assert.rejects(as("user").invoke(pagesActions.bodyFromMarkdown, { markdown: "a".repeat(1_000_001) }), { code: "actions.input_invalid" });
    await assert.rejects(as("user").invoke(pagesActions.bodyFromMarkdown, { markdown: "" }), { code: "actions.input_invalid" });
  });
});
