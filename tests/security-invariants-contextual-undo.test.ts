import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createChosen, handleContextualHttp, undoCreated, type DraftPorts, type UndoOwner } from "@molis-ai/molis-work-app-local-host";
import { FRAGMENT_ANY_OBJECT, defineFragmentOffersAction, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { screenModelMaterial } from "@molis-ai/molis-work-service-agent-host";
import { contextualCandidates } from "@molis-ai/molis-work-kernel/contextual";

/**
 * S-39 (docs/system/SECURITY-INVARIANTS.md; specs/context-program W4-1): a creation entry the bar made at once keeps its owner's
 * undo on the Host, behind a token. The token is spent once, only by the same person in the same project, within 30 minutes, and
 * only while the undo's provider is the installation that made the thing; the page hands back the token and nothing else.
 */
const ports: DraftPorts = { instruction: () => "DRAFT-INSTRUCTION", screen: screenModelMaterial, today: () => "2026-10-18" };
const OWNER: UndoOwner = { project: "project-a", actor: "person-a" };
const focus: SurfaceFocus = { context_id: "c1", plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "range",
  object: { kind: "pages_document", id: "doc-1", version: 3, title: "留存计划" }, targets: [{ kind: "text_range", role: "paragraph", text: "约设计评审" }] };
const provider = { provider_id: "io.example.notes", title: "Notes", kind: "plugin", plugin_install_id: "install-1" } as ActionView["provider"];
const view = (capability_id: string, action: Partial<ActionView["action"]> = {}, operation: ActionView["operation"] = "command", install = provider): ActionView => ({
  capability_id, version: 1, provider_id: provider.provider_id, operation, provider: install, availability: { available: true },
  action: { title: capability_id, description: capability_id, kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user"], permissions: [],
    subject_kinds: ["note"], input_schema: { type: "object", required: ["title"], properties: { title: { type: "string" }, request_id: { type: "string" } } }, ...action },
} as ActionView);
const intake = { intake_id: "note", item_kind: "note", title: "笔记", verb: "记成笔记", describe: "一条笔记", examples: ["一句话"], prepare: { capability_id: "notes.offers", version: 1 } };
const DIRECTORY = [
  view("notes.create", { intake, undo: { capability_id: "notes.remove", version: 1, input: { id: "note.id" } }, result_subject: { id: "note.id" } }),
  view("notes.offers", defineFragmentOffersAction("notes.offers", [FRAGMENT_ANY_OBJECT], "n", [], []).action, "query"),
  view("notes.remove"),
];

/** A fake owner: what was called, and the directory it shows now. */
function owner(directory: readonly ActionView[] = DIRECTORY) {
  const called: string[] = [];
  const actions = { discover: async () => actions.directory, directory, invoke: async (reference: ActionReference) => {
    called.push(reference.capability_id);
    return reference.capability_id === "notes.offers" ? { offers: [{ offer_id: "note", title: "记成笔记", action: { capability_id: "notes.create", version: 1 }, input: { title: "约设计评审" } }] }
      : reference.capability_id === "notes.create" ? { note: { id: "n-1" } } : { ok: true };
  } };
  return { actions, called, removed: () => called.filter(id => id === "notes.remove").length };
}
async function made(fake: ReturnType<typeof owner>, by: UndoOwner = OWNER): Promise<string> {
  const key = contextualCandidates(DIRECTORY, focus).find(item => item.origin === "intake")!.key;
  const out = await createChosen(by, DIRECTORY, focus, undefined, key, `req-${Math.random()}`, { actions: fake.actions, ports });
  assert.equal(out.created, true);
  return out.undo_token!;
}
const stale = (error: Error & { code?: string }) => error.code === "contextual.stale";

test("S-39 an undo token is spent once: the second 撤销 is refused and runs nothing", async () => {
  const fake = owner(), token = await made(fake);
  assert.deepEqual(await undoCreated(OWNER, token, fake.actions), { undone: true });
  await assert.rejects(undoCreated(OWNER, token, fake.actions), stale);
  assert.equal(fake.removed(), 1);
});

test("S-39 another project or another person cannot spend the token, and does not use it up for its owner", async () => {
  const fake = owner(), token = await made(fake);
  await assert.rejects(undoCreated({ ...OWNER, project: "project-b" }, token, fake.actions), stale);
  await assert.rejects(undoCreated({ ...OWNER, actor: "person-b" }, token, fake.actions), stale);
  assert.equal(fake.removed(), 0, "nothing undone for them");
  await undoCreated(OWNER, token, fake.actions);
  assert.equal(fake.removed(), 1, "still its owner's");
});

test("S-39 a token past its 30 minutes is refused, spent, and nothing is undone", async () => {
  const fake = owner(), token = await made(fake);
  await assert.rejects(undoCreated(OWNER, token, fake.actions, Date.now() + 31 * 60_000), stale);
  await assert.rejects(undoCreated(OWNER, token, fake.actions), stale);
  assert.equal(fake.removed(), 0);
});

test("S-39 once the undo's provider is another installation, or no longer offers it, the old token undoes nothing", async () => {
  for (const now of [
    DIRECTORY.map(item => item.capability_id === "notes.remove" ? view("notes.remove", {}, "command", { ...provider, plugin_install_id: "install-2" }) : item),
    DIRECTORY.map(item => item.capability_id === "notes.remove" ? { ...item, availability: { available: false, code: "plugin.disabled", reason: "停用" } } as ActionView : item),
    DIRECTORY.filter(item => item.capability_id !== "notes.remove"),
  ]) {
    const fake = owner(), token = await made(fake);
    fake.actions.directory = now;
    await assert.rejects(undoCreated(OWNER, token, fake.actions), stale);
    assert.equal(fake.removed(), 0);
  }
});

test("S-39 the page hands back the token and nothing else: a body that names an undo or its input is refused and runs nothing", async t => {
  const fake = owner(), token = await made(fake);
  const server = createServer((request, response) => { void handleContextualHttp(request, response, new URL(request.url!, "http://local"),
    { scope: OWNER.project, actor_id: OWNER.actor, actions: () => fake.actions }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const undo = (body: unknown) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/contextual/undo`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  for (const body of [
    { undo_token: token, capability_id: "notes.create", version: 1 },
    { undo_token: token, input: { id: "n-other" } },
    { undo_token: token, reference: { capability_id: "notes.remove", version: 1, provider_id: "io.example.notes" } },
  ]) {
    const refused = await undo(body);
    assert.equal(refused.status, 400, JSON.stringify(body));
    assert.equal((await refused.json() as { code?: string }).code, "contextual.input_invalid");
  }
  assert.equal(fake.removed(), 0, "nothing undone, and the token not spent");
  const spent = await undo({ undo_token: token });
  assert.equal(spent.status, 200);
  assert.equal(fake.removed(), 1);
});
