import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { pagesActions as actions, PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { handleContextualHttp, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { initializeBoard } from "./fixtures/goals-board.js";

// specs/context-program §21.8 step 4 (W3-B1): Pages' three 「放进左边」 writes at the landing the page reported.
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...texts: string[]) => ({ type: "doc" as const, content: texts.map(paragraph) });
const landing = (mode: "insert" | "replace" | "quote"): ActionReference => ({ capability_id: `pages.landing.${mode}`, version: 1 });
type Block = { type: string; text?: string; content?: Block[] };
const inline = (node: Block): string => node.text ?? (node.content ?? []).map(inline).join("");
/** Each top-level block as its text; a quote as "> " and its paragraphs joined by " | ". */
const texts = (body: unknown) => ((body as Block).content ?? []).map(node => node.type === "blockquote" ? "> " + (node.content ?? []).map(inline).join(" | ") : inline(node));
type Written = { document: { id: string; version: number; body: unknown }; change_id: string };

async function fixture(run: (f: { client: ReturnType<MolisWorkLocalHost["actionClient"]>; caller: ActionCallContext; bound: ReturnType<typeof bindActionClient> }) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "pages-landing-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: PAGES_ACTION_PERMISSIONS };
  const client = host.actionClient(ref);
  try {
    await initializeBoard(host, ref, { actor_id: "owner", idempotency_key: "init" });
    await run({ client, caller, bound: bindActionClient(client, () => caller) });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
}

test("Pages declares three attaches on its own documents, each taken back by pages.revert", async () => {
  await fixture(async ({ client, caller }) => {
    const pages = (await client.discover(caller)).filter(row => row.capability_id.startsWith("pages."));
    const attaches = pages.filter(row => row.action.attach).map(row => [row.capability_id, row.action.attach!.attach_id, row.action.attach!.positions, row.action.attach!.item_kind, row.action.undo?.capability_id]);
    assert.deepEqual(attaches.sort(), [
      ["pages.landing.insert", "insert", ["cursor", "end"], "pages_document", "pages.revert"],
      ["pages.landing.quote", "quote", ["cursor", "end"], "pages_document", "pages.revert"],
      ["pages.landing.replace", "replace", ["selection"], "pages_document", "pages.revert"],
    ]);
    assert.deepEqual(inspectActionDeclarations(pages.map(({ capability_id, version, operation, action }) => ({ capability_id, version, operation, action })), undefined), []);
  });
});

test("insert, replace and quote write at the reported positions, and pages.revert takes the last one back", async () => {
  await fixture(async ({ client, caller, bound }) => {
    const { document } = await bound.invoke(actions.create, { title: "Notes", body: doc("Hello world", "Second") });
    // "Hello world" spans 1..12 inside the first paragraph; the cursor sits after "Hello".
    const inserted = await client.invoke(caller, landing("insert"), { id: document.id, expected_version: document.version, anchor: 6, head: 6, text: " brave" }) as Written;
    assert.deepEqual(texts(inserted.document.body), ["Hello brave world", "Second"]);
    const replaced = await client.invoke(caller, landing("replace"), { id: document.id, expected_version: inserted.document.version, anchor: 7, head: 12, text: "bold\nNew line" }) as Written;
    assert.deepEqual(texts(replaced.document.body), ["Hello bold", "New line world", "Second"]);
    const size = 12 + 16 + 8; // the end of the document: each paragraph is its text plus its two edges
    const quoted = await client.invoke(caller, landing("quote"), { id: document.id, expected_version: replaced.document.version, anchor: size, head: size,
      text: "They said so.", source: { title: "Interview", url: "https://example.com/interview" } }) as Written;
    assert.deepEqual(texts(quoted.document.body), ["Hello bold", "New line world", "Second", "> They said so. | — Interview"]);
    assert.match(JSON.stringify(quoted.document.body), /"link","attrs":\{"href":"https:\/\/example.com\/interview"\}/);
    await bound.invoke(actions.revert, { change_id: quoted.change_id });
    assert.deepEqual(texts((await bound.invoke(actions.get, { id: document.id })).document.body), ["Hello bold", "New line world", "Second"]);
    // An earlier write is not taken back over a later one, the same rule as an agent's update.
    await assert.rejects(bound.invoke(actions.revert, { change_id: inserted.change_id }), { code: "pages.conflict" });
  });
});

test("a landing that went stale, a position outside the document or a cancelled call writes nothing", async () => {
  await fixture(async ({ client, caller, bound }) => {
    const { document } = await bound.invoke(actions.create, { title: "Notes", body: doc("Hello") });
    const at = { id: document.id, expected_version: document.version, anchor: 6, head: 6, text: "!" };
    await bound.invoke(actions.update, { id: document.id, body: doc("Changed"), expected_version: document.version });
    await assert.rejects(client.invoke(caller, landing("insert"), at), { code: "pages.conflict" });
    const current = (await bound.invoke(actions.get, { id: document.id })).document;
    const fresh = { ...at, expected_version: current.version };
    await assert.rejects(client.invoke(caller, landing("insert"), { ...fresh, anchor: 99, head: 99 }), { code: "pages.invalid" });
    await assert.rejects(client.invoke(caller, landing("replace"), fresh), { code: "pages.invalid" }, "replacing needs a selection");
    await assert.rejects(client.invoke(caller, landing("insert"), { ...fresh, head: 3 }), { code: "pages.invalid" }, "inserting needs a cursor");
    await assert.rejects(client.invoke(caller, landing("quote"), fresh), { code: "actions.input_invalid" }, "a quote names its source");
    await assert.rejects(client.invoke({ ...caller, permissions: ["pages:read"] }, landing("insert"), fresh), { code: "actions.forbidden" });
    // Refused at its first authority check, before Pages starts: nothing is written. A call accepted first and withdrawn
    // while it waits at the check before the write is tests/pages-landing-late-authority.test.ts (QA-015).
    const cancelled: ActionCallContext = { ...caller, validate_authority: async () => { throw new Error("revoked"); } };
    await assert.rejects(client.invoke(cancelled, landing("insert"), fresh), /revoked/);
    assert.deepEqual((await bound.invoke(actions.get, { id: document.id })).document, current);
  });
});

// §21.8 step 6 (W3-B1): the Host reads the landing object again from its owner right before it runs the confirmed attach
// (H3's confirmReferences). Gone or not the person's to use now, and nothing is written; a Host without the check writes
// nothing either. The version is still Pages' own to compare.
test("W3-B1 step 6: /api/contextual/attach writes only once the landing object is confirmed with its owner", async () => {
  await fixture(async ({ client, caller, bound }) => {
    const { document } = await bound.invoke(actions.create, { title: "Notes", body: doc("Hello world") });
    const views = await client.discover(caller);
    const insert = views.find(view => view.capability_id === "pages.landing.insert")!;
    const focus = { context_id: "side:1", plugin_id: "io.molis.work.files", activity: "selecting", granularity: "range", place: "side",
      object: { kind: "file", id: "f1", title: "Interview" }, targets: [{ kind: "text_range", role: "paragraph", text: " brave" }] };
    const at = { pane_id: "p", plugin_id: insert.provider.plugin_id ?? insert.provider.provider_id, position: "cursor", version: document.version,
      object: { kind: "pages_document", id: document.id, title: "Notes" }, targets: [{ kind: "text_range", role: "paragraph", text: "", anchor: 6, head: 6 }] };
    const asked: unknown[] = [];
    const serve = async (confirm: ((picked: readonly { kind: string; id: string }[], kinds: readonly string[]) => Promise<boolean[]>) | undefined) => {
      const ports = { scope: "a", actor_id: "user", actions: () => ({ discover: () => client.discover(caller), invoke: (reference: ActionReference, input: unknown) => client.invoke(caller, reference, input) }),
        ...(confirm ? { confirmReferences: async (picked: readonly { kind: string; id: string }[], kinds: readonly string[]) => { asked.push([picked, kinds]); return confirm(picked, kinds); } } : {}) };
      const server = createServer((request, response) => { void handleContextualHttp(request, response, new URL(request.url!, "http://local"), ports); });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const post = async (path: string, body: unknown) => {
        const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return { status: response.status, body: await response.json() as { code?: string; plan?: { candidates: { key: string; origin?: string; title: string }[] } } };
      };
      return { post, close: () => server.close() };
    };
    const stored = async () => texts((await bound.invoke(actions.get, { id: document.id })).document.body);

    const refusing = await serve(async picked => picked.map(() => false));
    try {
      const { body } = await refusing.post("/api/contextual/candidates", { pane_id: "p", focus, landing: at, request_id: "r1" });
      const key = body.plan!.candidates.find(item => item.origin === "attach" && item.title === "插入到光标处")!.key;
      const refused = await refusing.post("/api/contextual/attach", { pane_id: "p", focus, landing: at, key, request_id: "r2" });
      assert.deepEqual([refused.status, refused.body.code], [409, "contextual.reference_unavailable"]);
      assert.deepEqual(asked, [[[{ kind: "pages_document", id: document.id }], ["pages_document"]]], "the landing object, of the kind the attach declares");
      assert.deepEqual(await stored(), ["Hello world"], "nothing written");
    } finally { refusing.close(); }

    const unchecked = await serve(undefined);
    try {
      const { body } = await unchecked.post("/api/contextual/candidates", { pane_id: "p", focus, landing: at, request_id: "r3" });
      const key = body.plan!.candidates.find(item => item.origin === "attach" && item.title === "插入到光标处")!.key;
      assert.equal((await unchecked.post("/api/contextual/attach", { pane_id: "p", focus, landing: at, key, request_id: "r4" })).body.code, "contextual.reference_unavailable", "no check, no write");
      assert.deepEqual(await stored(), ["Hello world"]);
    } finally { unchecked.close(); }

    const confirming = await serve(async picked => picked.map(() => true));
    try {
      const { body } = await confirming.post("/api/contextual/candidates", { pane_id: "p", focus, landing: at, request_id: "r5" });
      const key = body.plan!.candidates.find(item => item.origin === "attach" && item.title === "插入到光标处")!.key;
      assert.equal((await confirming.post("/api/contextual/attach", { pane_id: "p", focus, landing: at, key, request_id: "r6" })).status, 200);
      assert.deepEqual(await stored(), ["Hello brave world"]);
      // The landing is now a version behind: Pages refuses, after the owner check passed.
      assert.equal((await confirming.post("/api/contextual/attach", { pane_id: "p", focus, landing: at, key, request_id: "r7" })).body.code, "pages.conflict");
    } finally { confirming.close(); }
  });
});
