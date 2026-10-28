import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { defineDueRemindersAction, defineHomeEventsAction, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { AssistantService, AssistantStore, ComputerDesk, ComputerRecords, ComputerSettings, LocalHost, assistantAuthority, captureHostLog, eachListener, homeAgentDefinitions,
  publisherStanding, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";

type StoredCardOf = ReturnType<AssistantStore["addCard"]>;
type Pins = ReturnType<Parameters<typeof publisherStanding>[0]["publishers"]>;

/**
 * W5-13 third slice: the catches that carried on past a failure and left nothing behind (a listener, a record the main step does not
 * wait for, a background look, the publishers' ledger) still carry on, and now write the failure to the Host log: keys only, once
 * when it starts failing.
 */

async function captured<T>(run: () => T | Promise<T>): Promise<{ value: T; entries: HostLogEntry[] }> {
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try { return { value: await run(), entries }; } finally { restore(); }
}

const of = (entries: HostLogEntry[], event: string) => entries.filter(entry => entry.event === event);
const failure = (code: string) => Object.assign(new Error("C:\\Users\\某人\\secret.txt 读不了"), { code });
const project = { project_id: "project", storage_key: "memory:project" };
const person: ActionCallContext = { actor_id: "web-user", project_id: "project", audience: "user", permissions: [] };
const noRounds = async (): Promise<never> => { throw new Error("no rounds here"); };
const newLocalHost = (options: Partial<ConstructorParameters<typeof LocalHost>[0]> = {}) =>
  new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} }, ...options });

function desk() {
  const home = mkdtempSync(path.join(tmpdir(), "host-log-desk-"));
  const presence = { locked: false, screensaver: false, displays_asleep: false, on_console: true, idle_seconds: 0 };
  const permissions = { accessibility: true, screen_recording: true, input_monitoring: true };
  const status = { version: "test", pid: 1, bundle_id: "test.helper", permissions, presence, watching: false, last_synthetic: 0 };
  const computer = new ComputerDesk({ settings: new ComputerSettings(home), records: new ComputerRecords(home),
    helper: { on: () => () => undefined, ready: true, unsupported: () => null, problem: () => null, status: () => status, ensure: async () => status,
      call: async <T>(op: string): Promise<T> => { throw new Error(op); } } });
  return { computer, close: () => rmSync(home, { recursive: true, force: true }) };
}

test("RAC-1110 W5-13-12 a listener that throws does not stop the others or what told them, and is written once when it starts failing", async t => {
  // The one way the Host tells listeners: a failing one is written by area and what it listens to, with the error's name and code only.
  const heard: number[] = [];
  let broken = true;
  const flaky = (value: number) => { if (broken) throw failure("fixture.listener_broke"); heard.push(-value); };
  const tell = (value: number) => eachListener("fixture", "numbers", [flaky, (n: number) => heard.push(n)], listener => listener(value));
  const { entries } = await captured(() => { tell(1); tell(2); broken = false; tell(3); broken = true; tell(4); });
  assert.deepEqual(heard, [1, 2, -3, 3, 4], "the second listener hears every value");
  assert.deepEqual(entries.map(entry => [entry.level, entry.area, entry.event, entry.fields?.of, entry.error?.code]),
    [["warn", "fixture", "listener_failed", "numbers", "fixture.listener_broke"], ["warn", "fixture", "listener_failed", "numbers", "fixture.listener_broke"]],
    "written when it starts failing, not on every value, and again once it has worked since");
  assert.ok(!JSON.stringify(entries).includes("secret"), "no message or path reaches the log");

  // The Assistant's store: a write is not failed by a listener.
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const changed: string[] = [];
  store.onChange(() => { throw failure("fixture.store_listener"); });
  store.onChange(id => changed.push(id));
  const work = store.create({ actor_id: "web-user", title: "整理", scope: { kind: "project", project_id: "project" }, origin: null, project_ref: project });
  const written = await captured(() => store.update("web-user", work.work_id, null, { title: "整理周报" }));
  assert.equal(written.value.title, "整理周报", "the write went through");
  assert.ok(changed.includes(work.work_id), "the other listener heard it");
  assert.deepEqual(written.entries.map(entry => [entry.area, entry.fields?.of]), [["assistant", "work_changes"]]);

  // The computer desk's state and frames.
  const { computer, close } = desk();
  t.after(close);
  const states: unknown[] = [], frames: Buffer[] = [];
  computer.onState(() => { throw failure("fixture.state_listener"); }); computer.onState(state => states.push(state));
  computer.onFrame(() => { throw failure("fixture.frame_listener"); }); computer.onFrame(png => frames.push(png));
  const desked = await captured(() => { computer.changed(); computer.emitFrame(Buffer.from("a")); computer.emitFrame(Buffer.from("b")); });
  assert.equal(states.length, 1); assert.equal(frames.length, 2);
  assert.deepEqual(desked.entries.map(entry => [entry.area, entry.fields?.of]), [["computer", "desk_state"], ["computer", "desk_frames"]], "a frame listener is written once, not per frame");

});

const command: ActionDefinition = { capability_id: "fixture.relation.change", version: 1, operation: "command", action: {
  title: "改一处", description: "A command the assistant may run", kind: "operation", scope: "project", audiences: ["agent"], permissions: [],
  subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "object" } } };

test("RAC-1111 W5-13-13 a record the main step does not wait for (a command's relation, a Send's materials, a prompt's use) fails: the step still succeeds, and the failure is written without the person's text", async t => {
  const local = newLocalHost();
  t.after(() => local.close());
  let changes = 0;
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.relation", kind: "plugin", title: "Relation" }, definitions: [command],
    handlers: [{ ...command, handle: () => ({ changed: ++changes }) }] });
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const work = store.create({ actor_id: "web-user", title: "改一处", scope: { kind: "project", project_id: "project" }, origin: null, project_ref: project });

  // A command the assistant ran: its relation to the work fails to record, the change is still returned as made.
  const authority = assistantAuthority(local, work, () => new Set(), undefined, () => { throw failure("fixture.relation_store"); });
  const client = await authority.actions!("prologue");
  const ran = await captured(() => client!.invoke({ capability_id: command.capability_id, version: 1, provider_id: "fixture.relation" }, {}));
  assert.deepEqual(ran.value, { changed: 1 });
  assert.deepEqual(of(ran.entries, "relation_unrecorded").map(entry => [entry.area, entry.event, entry.fields?.step, entry.fields?.capability_id, entry.error?.code]),
    [["assistant", "relation_unrecorded", "command", "fixture.relation.change", "fixture.relation_store"]]);

  // The person's Send: the materials' relations fail to record, the Send goes on (here to the round, which this fixture has none of).
  const service = new AssistantService(store, { pages: async () => ["home"], host: noRounds, authority: noRounds }, "web-user");
  t.after(() => service.continuations.close());
  store.relations.link = () => { throw failure("fixture.relation_store"); };
  const said = "我的私人计划：周五前交";
  const sent = await captured(() => service.send({ work_id: work.work_id, text: said, request_id: "relation-send-0001",
    materials: [{ material_id: "m1", kind: "object", title: "笔记", explicit: true, object: { kind: "note", id: "n1", title: "笔记", version: "1" } }] }, {}).catch((error: unknown) => error));
  assert.ok(sent.value, "the Send ran on past the relation");
  const relation = of(sent.entries, "relation_unrecorded");
  assert.deepEqual(relation.map(entry => [entry.area, entry.fields?.step, entry.error?.code]), [["assistant", "send", "fixture.relation_store"]]);
  assert.ok(!JSON.stringify(sent.entries).includes("私人计划"), "the person's text is not in the log");

  // A model call's instructions: the use fails to record (its table is gone), the instructions are still given.
  const home = mkdtempSync(path.join(tmpdir(), "host-log-prompts-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const prompts = homeAgentDefinitions(home);
  const [owner, prompt] = prompts.registrations().flatMap(entry => entry.prompts.map(one => [entry.owner_id, one] as const)).find(([, one]) => one.kind === "instruction")!;
  const db = new DatabaseSync(homeSqlitePath(home, "agent-definitions"));
  db.exec("DROP TABLE prompt_uses"); db.close();
  const given = await captured(() => prompts.instructionForDeclaration(owner, prompt, "fixture"));
  assert.equal(given.value.body, prompt.body);
  assert.deepEqual(of(given.entries, "prompt_use_unrecorded").map(entry => [entry.area, entry.fields?.owner, entry.fields?.prompt]), [["agents", owner, prompt.prompt_id]],
    "the prompt is named by its owner and id, each a key");
});

test("RAC-1112 W5-13-14 settling a job's cards: a card changed meanwhile is expected and not written; any other failure is written", async t => {
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const step = { node_id: "job-1", title: "导出", job: { ended: "done" } };
  const graphs = { read: async () => [step], onJobEnded: () => () => undefined, follow: async () => ({ node_id: "job-1" }) };
  const host = { adapter: () => ({ collaboration: { works: graphs } }) };
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => host as never, authority: noRounds }, "web-user");
  t.after(() => service.continuations.close());
  let cards = 0;
  // Each case its own work, so only its own card waits on the job.
  const card = () => store.addCard({ card_id: `card-${++cards}`, work_id: store.create({ actor_id: "web-user", title: "导出", scope: { kind: "project", project_id: "project" }, origin: null, project_ref: project }).work_id, revision: 1, run_id: null, title: "导出", summary: "", provider: "Export",
    capability_title: "导出", effect: "write", reference: { capability_id: "fixture.export.start", version: 1, provider_id: "fixture.export" }, input: {}, input_schema: {},
    editable: [], missing: [], status: "running", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const update = store.updateCard.bind(store);
  // The card is linked first; settling it is the second write, which here fails.
  const settleWith = async (fail: (card: StoredCardOf, expected: number, patch: Partial<StoredCardOf>) => StoredCardOf) => {
    let calls = 0;
    store.updateCard = (one, expected, patch) => ++calls === 2 ? fail(one, expected, patch) : update(one, expected, patch);
    try { return await captured(() => service.jobs.linkCard(card(), { graph_id: "graph-1", node_id: "job-1" })); }
    finally { store.updateCard = update; }
  };
  // Changed meanwhile: the store's own compare-and-set refuses the stale revision.
  const conflict = await settleWith((one, expected, patch) => update(one, expected - 1, patch));
  assert.deepEqual(of(conflict.entries, "job_card_unsettled"), [], "a card changed meanwhile is the expected answer");
  const broken = await settleWith(() => { throw failure("fixture.cards_unwritable"); });
  assert.equal(broken.value.status, "running", "the card that could not be written stays as it was");
  assert.deepEqual(of(broken.entries, "job_card_unsettled").map(entry => [entry.area, entry.event, entry.error?.code]), [["assistant", "job_card_unsettled", "fixture.cards_unwritable"]]);
});

test("RAC-1113 W5-13-15 a publishers' ledger that cannot be read still trusts nobody, and says so once; read again, it trusts as before", async () => {
  const pinned = { publisher_trust: "pinned" as const, publisher_signature: "key-1" };
  const host = { publisher_trust: "host" as const, publisher_signature: "" };
  let readable = false;
  const ledger = { publishers: (): Pins => { if (!readable) throw failure("storage.ledger_unreadable"); return [{ key_id: "key-1", revoked_at: null }] as Pins; } };
  const standing = publisherStanding(ledger);
  const unread = await captured(() => [standing.trusted(pinned), standing.trusted(pinned), standing.trusted(host)]);
  assert.deepEqual(unread.value, [false, false, true], "the refusal does not change: a pinned installation stays denied, the Host's own runs");
  assert.deepEqual(unread.entries.map(entry => [entry.level, entry.area, entry.event, entry.error?.code]),
    [["warn", "plugins", "publisher_ledger_unreadable", "storage.ledger_unreadable"]], "written once, not on every question");
  readable = true;
  const read = await captured(() => standing.trusted(pinned));
  assert.equal(read.value, true); assert.deepEqual(read.entries, []);
  // A ledger that fails again after it was read is written again.
  readable = false;
  const again = await captured(() => publisherStanding(ledger).trusted(pinned));
  assert.equal(again.value, false); assert.equal(again.entries.length, 1);
});

test("RAC-1114 W5-13-16 a background look that keeps failing (a source of new material, a reminder source, a continuation watch) is written when it starts, by its key, and the look carries on", async t => {
  const local = newLocalHost();
  t.after(() => local.close());
  let eventsBroken = true, remindersBroken = true;
  const events = defineHomeEventsAction("fixture.material.events", ["note"], "事项", []);
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.material", kind: "plugin", title: "Material" }, definitions: [events],
    handlers: [{ ...events, handle: () => { if (eventsBroken) throw failure("fixture.events_down"); return { source: { surface: "notes", title: "Notes", icon: "note" }, events: [] }; } }] });
  const reminders = defineDueRemindersAction("fixture.material.reminders", ["note"], "提醒", []);
  local.actionRegistry().registerProvider({ provider: { provider_id: "fixture.reminders", kind: "plugin", title: "Reminders" }, definitions: [reminders],
    handlers: [{ ...reminders, handle: () => { if (remindersBroken) throw failure("fixture.reminders_down"); return { source: { surface: "notes", title: "Notes" }, reminders: [] }; } }] });
  const inHome: ActionCallContext = { ...person, project_id: null };
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => { throw failure("fixture.runtime_down"); }, authority: noRounds,
    scopeActions: async () => ({ discover: () => local.actionClient(project).discover(person), invoke: (action, input) => local.actionClient(project).invoke(person, action, input) }),
    homeActions: async () => ({ discover: () => local.homeActionClient().discover(inHome), invoke: (action, input) => local.homeActionClient().invoke(inHome, action, input) }) }, "web-user");
  t.after(() => service.continuations.close());
  const work = store.create({ actor_id: "web-user", title: "整理", scope: { kind: "project", project_id: "project" }, origin: null, project_ref: project });
  store.relations.link({ work_id: work.work_id, project_id: "project" }, "material", { kind: "goal", id: "g1", revision: "1" }, "测试");

  // New material: each look asks the source, which fails; it is written once, then again only after it answered.
  const looks = await captured(async () => { await service.notices.scanNewMaterial(); await service.notices.scanNewMaterial(); eventsBroken = false;
    await service.notices.scanNewMaterial(); eventsBroken = true; await service.notices.scanNewMaterial(); });
  assert.deepEqual(of(looks.entries, "material_source_failed").map(entry => [entry.area, entry.fields?.capability_id, Boolean(entry.error)]),
    Array(2).fill(["assistant", "fixture.material.events", true]));

  // Reminders: the stretch a source could not answer is asked again next time, and its failure is written once.
  const swept = await captured(async () => [await service.followUps.sweepReminders(), await service.followUps.sweepReminders()]);
  assert.deepEqual(swept.value, [0, 0]);
  assert.equal(store.setting("web-user", "reminder_sweep"), null, "the missed stretch is not marked as looked at");
  assert.deepEqual(of(swept.entries, "reminder_source_failed").map(entry => [entry.area, entry.fields?.capability_id, Boolean(entry.error)]),
    [["assistant", "fixture.material.reminders", true]]);
  remindersBroken = false;
  await service.followUps.sweepReminders();
  assert.notEqual(store.setting("web-user", "reminder_sweep"), null, "a source that answers again moves the look on");

  // A continuation watch whose runtime cannot be reached is retried every 5 seconds: written once, by scope, when it starts failing.
  store.update("web-user", work.work_id, null, { session_id: "session-1" }, false);
  const watched = await captured(async () => { service.continuations.attach(); service.continuations.attach(); await new Promise(resolve => setTimeout(resolve, 50)); });
  assert.deepEqual(of(watched.entries, "continuation_watch_failed").map(entry => [entry.area, entry.fields?.scope, entry.error?.code]),
    [["assistant", "project", "fixture.runtime_down"]]);
  assert.ok(!JSON.stringify([looks.entries, swept.entries, watched.entries]).includes("secret"), "no message or path reaches the log");
});
