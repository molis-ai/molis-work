import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join as joinPath } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, defineSubjectContextAction, defineWorkflowContentActions, LOCAL_PERSON_ACTOR_ID, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { CONTEXT_RELATION_TYPES } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { placementActions, type PlacementConvertResponse } from "@molis-ai/molis-work-contracts/services/placement";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { surfaceCompositionActions } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-app-workbench";
import type { ImMessage, ImRoom } from "@molis-ai/molis-work-contracts/services/im";
import { openServerDatabase } from "@molis-ai/molis-work-server";
import { addProjectPlugin, LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";

type Runtime = Awaited<ReturnType<typeof serveHomeRuntime>>;
type Project = Awaited<ReturnType<Runtime["project"]>>;
type Prepared = { prepared: string; choices: { key: string; label: string; consequence: string[] }[] };
type View = { message_id: string; part: "message" | "quote" };

async function read<Result>(response: Response, status = 200): Promise<Result> {
  const value = await response.json();
  assert.equal(response.status, status, JSON.stringify(value));
  return value;
}
async function proof(f: Runtime, prefix: string) {
  const response = await f.request(prefix + "/", { authorized: false, headers: { connection: "close" } });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().find(value => value.startsWith("molis-work-web-"))?.split(";")[0];
  const token = /<meta name="molis-work-page-session" content="([^"]+)"/u.exec(await response.text())?.[1];
  assert.ok(cookie && token);
  return { cookie, "x-molis-work-page-session": token, connection: "close" };
}
async function imSession(f: Runtime, name: string) {
  const cookie = (await f.request("/im/api/session", { authorized: false })).headers.get("set-cookie")!.split(";")[0]!;
  const { member } = await read<{ member: { id: string } }>(await f.request("/im/api/session", { method: "POST", authorized: false, headers: { cookie },
    body: { client_id: randomUUID(), display_name: name } }));
  return { cookie, member: member.id };
}
async function feedItem(t: Parameters<typeof serveHomeRuntime>[0], f: Runtime, project: Project) {
  const web = new LocalHostHttpClient({ origin: f.origin, controlToken: f.token });
  for (const plugin of ["feed", "inbox"]) await addProjectPlugin(web, project.project_id, plugin);
  const store = new LocalProjectDatabase(project.database_path, { existingOnly: true });
  t.after(() => store.close());
  const feed = createLocalFeedApplication(store.db), sources = createLocalFeedSourceService(store.db, project.project_id);
  const source = sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "position-offers" }).source;
  const { item } = feed.ingestItem({ source, externalId: "offer", title: "Original object attached to a position", summary: "An owner value", occurredAt: new Date().toISOString(), attention: false });
  const { entry } = feed.ensureInboxEntryForFeedItem(project.project_id, item.item_id, "manual");
  return { item, entry, current: () => feed.getFeedItem(project.project_id, item.item_id), attention: () => feed.getInboxEntry(project.project_id, entry.entry_id) };
}
async function prepare(post: (body: unknown) => Promise<Response>, subjectId: string, request: Record<string, unknown> = {}) {
  const list = await read<SurfaceHomeDisplay>(await post(request)), row = list.display.rows.find(row => row.subject.id === subjectId);
  assert.ok(row && row.read.state === "ok", JSON.stringify(list.groups));
  const click = { owner_plugin_id: row.owner, target: { kind: "peek", subject: row.subject, installation: row.installation } };
  const peek = await read<{ kind: "peek"; offers: Prepared }>(await post({ ...request, click }));
  assert.equal(peek.kind, "peek");
  assert.deepEqual(Object.keys(peek.offers).sort(), ["choices", "prepared"]);
  assert.ok(peek.offers.choices.every(choice => Object.keys(choice).sort().join(",") === "consequence,key,label"));
  return peek.offers;
}
const confirm = (offer: Prepared, label: string) => {
  const selected = offer.choices.find(choice => choice.label === label);
  assert.ok(selected, JSON.stringify(offer.choices));
  return { intent: "confirm", prepared: offer.prepared, choice: selected.key };
};

test("IUI-07 IUI-08 IUI-10: Attention can remove its own source through the original offer and still return the real receipt", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Attention offer"), prefix = "/projects/" + project.project_id;
  const { item, entry, current, attention } = await feedItem(t, f, project), headers = await proof(f, prefix);
  const endpoint = prefix + "/api/host/surface-attention";
  const post = (body: unknown) => f.request(endpoint, { authorized: false, headers, method: "POST", body });
  const prepared = await prepare(post, item.item_id);
  assert.equal(current().revision, item.revision);
  const { title, result } = await read<{ title: string; result: { item: { item_id: string; disposition: string; revision: number } } }>(
    await post({ offer: confirm(prepared, "保存为资料") }));
  assert.equal(title, "保存为资料");
  assert.deepEqual([result.item.item_id, result.item.disposition, result.item.revision], [item.item_id, "saved", item.revision + 1]);
  assert.deepEqual([attention().status, attention().revision], ["done", entry.revision + 1]);
  const display = await read<SurfaceHomeDisplay>(await post({}));
  assert.equal(display.display.rows.some(row => row.subject.id === item.item_id), false);
  await read(await post({ offer: confirm(prepared, "保存为资料") }), 409);
  assert.equal(current().revision, item.revision + 1);
});

test("S-protected-position-commands IUI-07 IUI-10 IUI-13: discussion confirms once with the original web and IM identities, relationship and write guard", { timeout: 75_000 }, async t => {
  const replaceDisposition = watchReceiver(t, "feed.items.disposition");
  const f = await serveHomeRuntime(t), project = await f.project("Discussion offer"), prefix = "/projects/" + project.project_id;
  const { item, current } = await feedItem(t, f, project), first = await proof(f, prefix), other = await proof(f, prefix);
  const owner = await imSession(f, "Owner"), guest = await imSession(f, "Guest");
  const join = (web = first, im = owner) => ({ ...web, cookie: web.cookie + "; " + im.cookie });
  const call = (path: string, body: unknown, headers = join()) => f.request(path, { authorized: false, method: "POST", body, headers });
  await read(await call(prefix + "/api/im/connect", {}));
  const { room } = await read<{ room: ImRoom }>(await call("/im/api" + prefix + "/room", {}));
  const base = "/im/api/rooms/" + room.id, db = openServerDatabase(joinPath(f.home, "server"));
  t.after(() => db.close());
  db.db.prepare("INSERT INTO mw_access VALUES (?,?,'editor')").run(project.project_id, guest.member);
  const send = async (data: Record<string, unknown>) =>
    (await read<{ message: ImMessage }>(await call(base + "/messages", { client_id: randomUUID(), body: "", ...data }))).message;
  const message = await send({ subjects: [{ kind: "feed_item", id: item.item_id }] }), quote = await send({ body: "Original quote", quote_id: message.id });
  const replacement = await send({ body: "Unrelated message" });
  const setQuote = (id: string) => db.db.prepare("UPDATE im_messages SET quote_id=? WHERE id=?").run(id, quote.id);
  const view: View = { message_id: quote.id, part: "quote" }, request = { views: [view] };
  const post = (body: unknown, headers = join()) => call(base + "/surfaces", body, headers);
  const initial = await read<SurfaceHomeDisplay>(await post(request));
  assert.equal(initial.groups[0]?.items[0]?.form, "card");
  const actions = bindActionClient(f.host.actionClient(project.reference), () =>
    ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", permissions: [], project_id: project.project_id }));
  await actions.invoke(surfaceCompositionActions.correct, { slot: { kind: "discussion" }, correction: "form", form: "chip",
    subject: { kind: "feed_item", id: item.item_id }, expected_revision: initial.corrections_revision });
  const held = () => prepare(post, item.item_id, request);
  const firstOffer = await held(), action = confirm(firstOffer, "保存为资料");
  await read(await post({ ...request, offer: action }, join(other)), 409);
  await read(await post({ ...request, offer: action }, join(first, guest)), 403);
  await read(await post({ views: [{ message_id: message.id, part: "message" }], offer: action }), 409);
  await read(await post({ ...request, offer: { ...action, input: { expected_revision: 10 } } }), 400);
  await read(await post({ ...request, offer: { intent: "cancel", prepared: firstOffer.prepared } }));
  await read(await post({ ...request, offer: action }), 409);
  assert.equal(current().revision, item.revision, "wrong context, cancellation and stale confirmation did not write");

  const log = f.host.callLog!, originalLog = log.record;
  const at = (capability: string, change: () => void) => {
    let reached = false;
    log.record = function (caller, action, outcome) {
      if (!reached && action.capability_id === capability && outcome.ok) { reached = true; change(); }
      return originalLog.call(this, caller, action, outcome);
    };
    return () => { log.record = originalLog; assert.ok(reached, "the real owner action reached the controlled wait boundary"); };
  };
  const beforeChange = await held();
  const relationChanged = at("feed.items.offers", () => setQuote(replacement.id));
  try { await read(await post({ ...request, offer: confirm(beforeChange, "保存为资料") }), 404); }
  finally { relationChanged(); setQuote(message.id); }
  assert.equal(current().revision, item.revision);

  const beforeWrite = await held(), surface = f.host.surfaceOperation, arrived = deferred(), go = deferred();
  const pause: typeof surface = (reference, signal, current, use, slot) => surface(reference, signal, current, context => use({
    ...context, client: { ...context.client, invoke(caller, action, input) {
      if (action.capability_id !== "feed.items.disposition") return context.client.invoke(caller, action, input);
      let validations = 0;
      return context.client.invoke({ ...caller, async validate_authority(ref) {
        await caller.validate_authority?.(ref);
        if (++validations === 2) { arrived.resolve(); await go.promise; }
      } }, action, input);
    } },
  }), slot);
  Object.defineProperty(f.host, "surfaceOperation", { value: pause, configurable: true });
  const pending = post({ ...request, offer: confirm(beforeWrite, "保存为资料") });
  const writeRefused = pending.then(response => read(response, 403));
  try {
    await Promise.race([arrived.promise, writeRefused.then(() => { throw new Error("The action did not reach its own write check"); })]);
    db.db.prepare("DELETE FROM mw_access WHERE project_id=? AND member_id=?").run(project.project_id, owner.member);
  } finally { Object.defineProperty(f.host, "surfaceOperation", { value: surface }); go.resolve(); }
  await writeRefused;
  assert.equal(current().revision, item.revision, "a late loss of the IM authority before the actual owner transaction writes nothing");
  db.db.prepare("INSERT INTO mw_access VALUES (?,?,'owner')").run(project.project_id, owner.member);

  let pastCommit = false;
  replaceDisposition(() => {
    pastCommit = true;
    assert.deepEqual([current().revision, current().disposition], [item.revision + 1, "saved"]);
    setQuote(replacement.id);
  });
  const final = await held(), last = { ...request, offer: confirm(final, "保存为资料") };
  try {
    const outcomes = await Promise.all([post(last), post(last)]);
    assert.deepEqual(outcomes.map(response => response.status).sort(), [409, 500]);
    const errors = await Promise.all(outcomes.map(response => response.json()));
    assert.deepEqual(errors.map(error => error.code).sort(), ["actions.offer_changed", "actions.outcome_unknown"]);
  } finally { setQuote(message.id); }
  assert.equal(pastCommit, true, "the actual handler reached the tail check after the owner committed");
  assert.deepEqual([current().revision, current().disposition], [item.revision + 1, "saved"], "commit happened once even though delivery was refused");
  await read(await post(last), 409);
  assert.equal(current().revision, item.revision + 1);
});

function watchReceiver(t: Parameters<typeof serveHomeRuntime>[0], receive = "pages.content.receive") {
  const register = ActionService.prototype.registerProvider;
  let pages: { registry: ActionService; remove: () => void; original: ActionProviderRegistration } | undefined;
  t.mock.method(ActionService.prototype, "registerProvider", function (this: ActionService, registration: ActionProviderRegistration) {
    const remove = register.call(this, registration);
    if ((receive !== "pages.content.receive" || registration.provider.plugin_id === "io.molis.work.pages")
      && registration.definitions.some(action => action.capability_id === receive)) pages = { registry: this, remove, original: registration };
    return remove;
  });
  return (change: "same" | "consequence" | ((input: unknown) => void)) => {
    assert.ok(pages, "the original action is registered: " + receive);
    const { registry, remove, original } = pages;
    const late = typeof change === "function" ? change : undefined;
    remove();
    pages = { registry, original, remove: register.call(registry, { ...original,
      definitions: original.definitions.map(definition => change === "consequence" && definition.capability_id === receive
        ? { ...definition, action: { ...definition.action, effect: "irreversible" } } : definition),
      handlers: original.handlers.map(handler => !late || handler.capability_id !== receive ? handler : { ...handler, async handle(caller, input) {
        const result = await handler.handle(caller, input);
        late(input);
        caller.assert_authority_current?.(); // The nested receive reports lost delivery after its real committed document.
        return result;
      } }),
    }) };
  };
}

test("S-protected-position-commands IUI-07 IUI-08 IUI-10 IUI-13: a discussion card links and converts through the original Placement and receiver", { timeout: 90_000 }, async t => {
  const swap = watchReceiver(t);
  const f = await serveHomeRuntime(t), project = await f.project("Card source"), target = await f.project("A real linked project");
  const prefix = "/projects/" + project.project_id;
  const web = new LocalHostHttpClient({ origin: f.origin, controlToken: f.token });
  await addProjectPlugin(web, project.project_id, "pages");
  const original = await read<{ goal: { goal_id: string } }>(await f.request(prefix + "/api/plugins/io.molis.work.goals/goals", {
    method: "POST", body: { title: "Original goal for the card", outcome: "A source document", idempotency_key: randomUUID() },
  }), 201);
  const subject = { kind: "goal", id: original.goal.goal_id }, workbench = await proof(f, prefix), owner = await imSession(f, "Card owner");
  const headers = { ...workbench, cookie: workbench.cookie + "; " + owner.cookie };
  const post = (path: string, body: unknown) => f.request(path, { authorized: false, headers, method: "POST", body });
  await read(await post(prefix + "/api/im/connect", {}));
  const { room } = await read<{ room: ImRoom }>(await post("/im/api" + prefix + "/room", {}));
  const base = "/im/api/rooms/" + room.id, surfaces = (body: unknown) => post(base + "/surfaces", body);
  const send = async (data: Record<string, unknown>) => (await read<{ message: ImMessage }>(await post(base + "/messages", { client_id: randomUUID(), body: "", ...data }))).message;
  const message = await send({ subjects: [subject] }), quote = await send({ body: "Card quote", quote_id: message.id });
  const unrelated = await send({ body: "Unrelated message" }), request = { views: [{ message_id: quote.id, part: "quote" }] };
  const list = await read<SurfaceHomeDisplay>(await surfaces(request)), item = list.groups[0]?.items.find(item => item.subject.id === subject.id);
  const row = list.display.rows.find(row => row.subject.id === subject.id);
  assert.equal(item?.form, "card");
  assert.ok(row && "revision" in row.read);
  const declared = f.host.inspectActionMetadata({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] }, project.reference)
    .filter(view => view.action.workflow_content?.role === "receive" || view.action.subject_kinds.includes("pages_document") && view.capability_id.includes("subject"))
    .map(view => ({ id: view.capability_id, provider: view.provider, scope: view.action.scope, kinds: view.action.subject_kinds, permissions: view.action.permissions }));
  assert.ok(item?.actions.some(action => action.ref === "place") && item.actions.some(action => action.ref === "hand_off"), JSON.stringify({ item, declared }));
  const click = (kind: string, revision = row.read.state === "unreadable" ? "" : row.read.revision) =>
    ({ ...request, click: { owner_plugin_id: row.owner, target: { kind, subject, installation: row.installation, revision } } });
  const prepare = async (kind: "place" | "hand_off") => {
    const result = await read<{ kind: string; offers: Prepared; title: string; description: string }>(await surfaces(click(kind)));
    assert.equal(result.kind, "placement");
    assert.ok(result.description && result.offers?.choices.length, JSON.stringify(result));
    return result.offers;
  };
  const issue = (offer: Prepared, label: string) => ({ ...request, offer: confirm(offer, label) });
  const db = new DatabaseSync(homeSqlitePath(f.home, "placement"), { readOnly: true });
  const serverDb = openServerDatabase(joinPath(f.home, "server"));
  t.after(() => { db.close(); serverDb.close(); });
  const edits = () => ({ titles: db.prepare("SELECT kind,id,title,seen_at FROM placement_titles ORDER BY kind,id").all(),
    edges: db.prepare("SELECT edge_key AS key,relation_type AS type,revision FROM context_edges ORDER BY edge_key").all() });
  const originalPlacement = edits();
  await read(await surfaces(click("place", "older-value")), 409);
  const cancelled = await prepare("place");
  await read(await surfaces({ ...request, offer: { intent: "cancel", prepared: cancelled.prepared } }));
  await read(await surfaces(issue(cancelled, "A real linked project")), 409);
  assert.deepEqual(edits(), originalPlacement, "preparing and cancelling writes neither title nor relation rows");

  const added = await prepare("place");
  const competing = defineSubjectContextAction("fixture.competing.subject", 1, "goal", "Competing reader", []);
  const stop = f.host.actionRegistry(project.reference).registerProvider({ provider: { provider_id: "system.competing-reader", title: "Competing reader", kind: "system" },
    definitions: [competing], handlers: [{ ...competing, handle() { assert.fail("the current operation must never select the added reader"); } }] });
  try { await read(await surfaces(issue(added, "A real linked project")), 409); }
  finally { stop(); }
  assert.deepEqual(edits(), originalPlacement);
  const linked = await read<{ result: { key: string }; title: string }>(await surfaces(issue(await prepare("place"), "A real linked project")));
  assert.match(linked.title, /A real linked project/u);
  assert.deepEqual(JSON.parse(linked.result.key), ["used_in", "goal", subject.id, target.project_id]);
  assert.ok(edits().edges.some(edge => edge.key === linked.result.key && edge.type === "placement.used_in"));
  const source = await f.host.actionClient(project.reference).invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: ["placement:read"] },
    placementActions.locate, { object: { ...subject, project_id: project.project_id } });
  assert.deepEqual(source, { object: { ...subject, project_id: project.project_id }, moved: false });

  const all = await prepare("hand_off");
  assert.ok(all.choices.some(choice => choice.label === "Pages") && all.choices.length > 1, "the default project keeps multiple real stations");
  const dataset = f.host.inspectActionMetadata({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] }, project.reference)
    .find(view => view.capability_id === "dataset.content.receive");
  assert.ok(dataset);
  const extraStation = (id: string) => {
    const { receive: original } = defineWorkflowContentActions({ id: "dataset-probe-" + id, title: "Another station", icon: "database", subject_kind: "dataset",
      read_permissions: [...dataset.action.permissions], write_permissions: [...dataset.action.permissions] });
    const receive = { ...original, action: { ...original.action, workflow_content: { ...original.action.workflow_content!, id } } };
    return f.host.actionRegistry(project.reference).registerProvider({ provider: dataset.provider, definitions: [receive],
      handlers: [{ ...receive, handle() { assert.fail("an unselected receiver must not execute"); } }] });
  };
  const ambiguous = extraStation("pages");
  try {
    await read(await surfaces(issue(all, "Pages")), 409);
    const eligible = await prepare("hand_off");
    assert.ok(eligible.choices.length > 0 && eligible.choices.every(choice => choice.label !== "Pages"), "only the ambiguous station is withheld");
    await read(await surfaces({ ...request, offer: { intent: "cancel", prepared: eligible.prepared } }));
  } finally { ambiguous(); }
  for (const change of ["same", "consequence"] as const) {
    const held = await prepare("hand_off").catch(cause => { throw new Error(JSON.stringify(declared), { cause }); });
    swap(change);
    await read(await surfaces(issue(held, "Pages")), 409);
  }
  swap("same");
  const pages = openPagesStore(f.home);
  t.after(() => pages.close());
  assert.deepEqual(pages.list(project.project_id), [], "same-ref re-registration or changed consequences cannot create a document");
  const calls: { action: string; state: string }[] = [], log = f.host.callLog!, record = log.record;
  log.record = function (caller, action, outcome) {
    if (action.capability_id.startsWith("pages.") || action.capability_id.startsWith("placement.") || action.capability_id.includes("goal.subject"))
      calls.push({ action: action.capability_id, state: outcome.ok ? "ok" : outcome.code ?? outcome.message });
    return record.call(this, caller, action, outcome);
  };
  t.after(() => { log.record = record; });
  const selected = await prepare("hand_off"), unrelatedStation = extraStation("dataset-extra");
  const converted = await read<{ result: PlacementConvertResponse; title: string; request_id: string }>(await surfaces(issue(selected, "Pages")))
    .catch(cause => { throw new Error(JSON.stringify({ calls, stored: pages.list(project.project_id).map(page => page.id) }), { cause }); })
    .finally(unrelatedStation);
  assert.equal(converted.result.location.project_id, project.project_id);
  assert.equal(converted.result.title, "Original goal for the card");
  assert.ok(converted.result.open && converted.request_id && pages.list(project.project_id).some(page => page.id === converted.result.object.id));
  assert.ok(edits().edges.some(edge => edge.type === CONTEXT_RELATION_TYPES.derived_from
    && edge.key === JSON.stringify(["derived_from", converted.result.object.kind, converted.result.object.id])));
  const unchanged = await read<SurfaceHomeDisplay>(await surfaces(request));
  assert.equal(unchanged.display.rows[0]?.subject.id, subject.id, "the actual discussion keeps the source reference after the placement");

  let receivedRequest = "";
  swap(input => {
    receivedRequest = (input as { request_id: string }).request_id;
    assert.equal(pages.list(project.project_id).length, 2, "the receiver has already written its second document");
    serverDb.db.prepare("UPDATE im_messages SET quote_id=? WHERE id=?").run(unrelated.id, quote.id);
  });
  const late = issue(await prepare("hand_off"), "Pages");
  const refusal = await read<{ code: string }>(await surfaces(late), 500);
  assert.equal(refusal.code, "actions.outcome_unknown");
  assert.match(receivedRequest, /^placement:[a-f0-9-]{36}$/u);
  serverDb.db.prepare("UPDATE im_messages SET quote_id=? WHERE id=?").run(message.id, quote.id);
  await read(await surfaces(late), 409);
  assert.equal(pages.list(project.project_id).length, 2, "an already committed receive was not invoked again");
});
