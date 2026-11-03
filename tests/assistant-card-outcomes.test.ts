import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority } from "@molis-ai/molis-work-app-local-host";

const definition: ActionDefinition = { capability_id: "fixture.receipt.write", version: 1, operation: "command", action: {
  title: "Save receipt", description: "Persist a receipt", kind: "operation", scope: "project", audiences: ["agent"],
  permissions: ["receipts:write"], subject_kinds: [], input_schema: { type: "object", properties: {}, additionalProperties: false },
  output_schema: { type: "object", properties: { saved: { type: "boolean" } }, required: ["saved"], additionalProperties: false } } };

test("ASC-08 ASC-24: the Assistant preserves the original result link across a database restart without dispatching again", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-card-result-")), file = join(directory, "assistant.sqlite");
  let db = new DatabaseSync(file);
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const host = new AgentHost(), project = { project_id: "trusted-project", storage_key: "memory:card-result" };
  t.after(async () => { await local.close(); db.close(); await rm(directory, { recursive: true, force: true }); });
  let calls = 0;
  const resultDefinition: ActionDefinition = { ...definition, action: { ...definition.action,
    output_schema: { type: "object", properties: { saved: { type: "boolean" }, id: { type: "string" }, project_id: { type: "string" }, unselected: { type: "string" } }, required: ["saved", "id"], additionalProperties: false },
    result_view: { summary: "Request prepared", link: { label: "Open request", href_template: "/projects/{project_id}/requests/{/id}" } } } };
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.receipts", kind: "plugin", title: "Receipts" }, definitions: [resultDefinition],
    handlers: [{ ...resultDefinition, async handle(context) { await context.beforeEffect(); calls++; return { saved: true, id: "request/1", project_id: "untrusted-project", unselected: "PRIVATE-FIXTURE" }; } }] });
  const service = () => new AssistantService(new AssistantStore(db), { pages: async () => ["home"], host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "Project" }, "web-user");
  let assistant = service();
  const placed = await assistant.offers.offerFromPage({ message_id: "result-page-0001", source: { surface: "fixture", title: "Receipts" },
    card: { title: "Prepare request", summary: "Prepare one request", reference: { capability_id: definition.capability_id, version: 1, provider_id: "fixture.receipts" }, input: {} } }, { project_ref: project });
  const first = await assistant.offers.runCard(placed.work_id, placed.card.card_id, { revision: placed.card.revision });
  assert.equal(first.status, "done");
  assert.equal(first.presentation?.link?.href, "/projects/trusted-project/requests/request%2F1");
  assert.doesNotMatch(JSON.stringify(first), /PRIVATE-FIXTURE|untrusted-project/);
  db.close(); db = new DatabaseSync(file); assistant = service();
  const second = await assistant.offers.runCard(placed.work_id, first.card_id, { revision: first.revision });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  assert.match(assistant.offers.html(second, text => text), /href="\/projects\/trusted-project\/requests\/request%2F1"/);
});

for (const outcome of ["invalid-output", "unknown", "before-effect"] as const) {
  test(`W2-18-CARD-UNKNOWN-01 a real action ${outcome} is kept across restart with no duplicate effect`, async t => {
    const directory = await mkdtemp(join(tmpdir(), "molis-card-outcome-"));
    const file = join(directory, "assistant.sqlite");
    let db = new DatabaseSync(file);
    const receipts = new DatabaseSync(":memory:");
    receipts.exec("CREATE TABLE receipts (body TEXT NOT NULL)");
    const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
    t.after(async () => { await local.close(); db.close(); receipts.close(); await rm(directory, { recursive: true, force: true }); });
    const project = { project_id: "project", storage_key: "memory:card-project" };
    let calls = 0;
    local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.receipts", kind: "plugin", title: "Receipts" },
      definitions: [definition], handlers: [{ ...definition, async handle(context) {
        calls++;
        if (outcome === "before-effect") throw new ActionError("actions.service_unavailable", "Not dispatched");
        await context.beforeEffect();
        receipts.prepare("INSERT INTO receipts VALUES (?)").run("committed");
        if (outcome === "unknown") throw new ActionError("actions.outcome_unknown", "The owner has no confirmed receipt");
        // ActionService itself detects this invalid return after the write, producing output_invalid_after_effect.
        return { saved: "invalid" };
      } }] });
    const host = new AgentHost();
    const service = () => {
      const store = new AssistantStore(db);
      return new AssistantService(store, { pages: async () => ["home"], host: async () => host,
        authority: async work => assistantAuthority(local, work, () => new Set()), projectTitle: async () => "Project" }, "web-user");
    };
    let assistant = service();
    const placed = await assistant.offers.offerFromPage({ message_id: "receipt-page-0001", source: { surface: "fixture", title: "Receipts" },
      card: { title: "Save receipt", summary: "Save this receipt", reference: { capability_id: definition.capability_id, version: 1,
        provider_id: "fixture.receipts" }, input: {} } }, { project_ref: project });
    const first = await assistant.offers.runCard(placed.work_id, placed.card.card_id, { revision: placed.card.revision });
    assert.equal(first.status, outcome === "before-effect" ? "failed" : "unknown");
    assert.equal(receipts.prepare("SELECT COUNT(*) AS count FROM receipts").get()!.count, outcome === "before-effect" ? 0 : 1);
    if (outcome !== "before-effect") assert.match(first.outcome ?? "", /结果未确认.*不会自动重试/);
    db.close(); db = new DatabaseSync(file); assistant = service();
    const second = await assistant.offers.runCard(placed.work_id, placed.card.card_id, { revision: first.revision });
    assert.equal(second.status, first.status);
    assert.equal(calls, outcome === "before-effect" ? 2 : 1);
    assert.equal(receipts.prepare("SELECT COUNT(*) AS count FROM receipts").get()!.count, outcome === "before-effect" ? 0 : 1);
  });
}

for (const outcome of ["success", "invalid-output", "unknown"] as const) test(`ASC-08 ASC-24: a directly executed setup ${outcome} exposes only its confirmed entry and never runs again from the result card`, async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-direct-result-")), file = join(directory, "assistant.sqlite");
  let db = new DatabaseSync(file), store = new AssistantStore(db);
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } }), host = new AgentHost();
  const project = { project_id: "trusted-project", storage_key: "memory:direct-result" };
  let calls = 0;
  const action: ActionDefinition = { ...definition, action: { ...definition.action,
    output_schema: { type: "object", properties: { saved: { type: "boolean" }, id: { type: "string" }, unselected: { type: "string" } }, required: ["saved", "id"], additionalProperties: false },
    result_view: { summary: "Ready to connect", link: { label: "Continue setup", href_template: "/projects/{project_id}/requests/{/id}" } } } };
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.receipts", kind: "plugin", title: "Receipts" }, definitions: [action],
    handlers: [{ ...action, async handle(context) {
      await context.beforeEffect(); calls++;
      if (outcome === "unknown") throw new ActionError("actions.outcome_unknown", "Outcome is not confirmed");
      return { saved: outcome === "invalid-output" ? "invalid" : true, id: "request/1", unselected: "PRIVATE-RESULT-FIXTURE" };
    } }] });
  const make = (): AssistantService => new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async (work, origin) => assistantAuthority(local, work, () => new Set(), undefined,
      (view, input, output) => assistant.outcomes.recordResult(work, view, input, output, origin?.source !== "card")) }, "web-user");
  let assistant = make();
  t.after(async () => { assistant.continuations.close(); await local.close(); db.close(); await rm(directory, { recursive: true, force: true }); });
  const work = store.create({ actor_id: "web-user", title: "Connect a service", scope: { kind: "project", project_id: project.project_id }, project_ref: project, origin: null });
  const authority = assistantAuthority(local, work, () => new Set(), undefined, (view, input, output) => assistant.outcomes.recordResult(work, view, input, output));
  const client = await authority.actions!("prologue");
  const reference = { capability_id: action.capability_id, version: 1, provider_id: "fixture.receipts" };
  if (outcome !== "success") {
    await assert.rejects(client.invoke(reference, {}));
    assert.deepEqual(store.cards(work.work_id), [], "failed and unconfirmed calls have no successful entry");
    return;
  }
  await client.invoke(reference, {});
  const [card] = store.cards(work.work_id); assert.ok(card);
  assert.equal(card.presentation?.link?.href, "/projects/trusted-project/requests/request%2F1");
  assert.deepEqual(card.input, {}, "a completed result keeps no original input");
  assert.doesNotMatch(JSON.stringify(card), /PRIVATE-RESULT-FIXTURE/);
  assistant.continuations.close(); db.close(); db = new DatabaseSync(file); store = new AssistantStore(db); assistant = make();
  const reopened = await assistant.offers.runCard(work.work_id, card.card_id, { revision: card.revision });
  assert.equal(reopened.status, "done"); assert.equal(calls, 1);
  assert.match(assistant.offers.html(reopened, text => text), /href="\/projects\/trusted-project\/requests\/request%2F1"/);
  const offered = await assistant.offers.offerFromPage({ message_id: "second-card-0001", work_id: work.work_id, source: { surface: "fixture" },
    card: { title: "Prepare another", summary: "Prepare one request", reference, input: {} } }, { project_ref: project });
  await assistant.offers.runCard(work.work_id, offered.card.card_id, { revision: offered.card.revision });
  assert.equal(calls, 2); assert.equal(store.cards(work.work_id).length, 2, "a call made from a card updates that card and adds no duplicate");
});
