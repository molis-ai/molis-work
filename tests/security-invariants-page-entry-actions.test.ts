import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionUserAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { agentReviewProvider, assistantPanelProvider, contextOnboardingProvider, webEntryDoor, webEntryProvider } from "@molis-ai/molis-work-app-local-host";

// S-page-entry-actions (docs/system/security-invariants/S-page-entry-actions.md; B9, specs/visual-ui-experience/work-items/batch27-http-write-actions):
// the writes of the first-run journey, the review queue and the Assistant panel became actions, and stay the person's own on that page. Each
// serves only a call its page's route issued for this request; no Agent, MCP client, workflow or plugin sees them, and no text a caller can
// write, no other door's credential and no credential after its request is that call.

const refused = (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden";
const person = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: [], ...extra });
const pages = () => {
  const service = new ActionService();
  const providers = [contextOnboardingProvider(), agentReviewProvider(), assistantPanelProvider()];
  for (const provider of providers) service.registerProvider(provider);
  return { service, definitions: providers.flatMap(provider => provider.definitions) };
};

test("S-page-entry-actions 1: the pages' writes are listed for the person only; agents, MCP clients, workflows and plugins do not see them", async () => {
  const { service, definitions } = pages();
  assert.ok(definitions.length >= 30, "the three groups' writes are registered");
  const ids = new Set(definitions.map(definition => definition.capability_id));
  assert.ok(["onboarding.context.adopt", "agent.reviews.decide", "assistant.panel.send", "assistant.panel.works.cards.run"].every(id => ids.has(id)));
  assert.equal((await service.discover(person())).filter(view => ids.has(view.capability_id)).length, ids.size);
  for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
    assert.deepEqual((await service.discover(person({ audience }))).filter(view => ids.has(view.capability_id)), [], `${audience} does not see them`);
  }
  for (const definition of definitions) assert.deepEqual(definition.action.audiences, ["user"], definition.capability_id);
});

test("S-page-entry-actions 2: without the page's own credential every write is refused before its owner is reached", async () => {
  const { service, definitions } = pages();
  const text = { source: "web", conversation_ref: "web:assistant:panel", message_ref: "web:forged" } as const;
  const cases: Array<[string, Partial<ActionCallContext>]> = [
    ["no user_action", {}],
    ["the credential's text written by hand", { user_action: text }],
    ["the same text, frozen", { user_action: Object.freeze({ ...text }) }],
    ["a call made on the person's behalf", { delegated_by: "io.molis.work.example", user_action: text }],
    ["an Agent's call", { audience: "agent", user_action: text }],
  ];
  for (const definition of definitions) {
    for (const [label, extra] of cases) {
      // The handler's first step is the door: an input of any shape is never read when the call did not come through it.
      await assert.rejects(service.invoke(person(extra), definition, {}), error => error instanceof ActionError, `${definition.capability_id}: ${label}`);
    }
    await assert.rejects(service.invoke(person({ user_action: text }), definition, minimalInput(definition.action.input_schema)), refused, `${definition.capability_id} with a valid input`);
  }
});

test("S-page-entry-actions 3: a door's credential is good for its own actions, during its own request", async () => {
  const service = new ActionService(), ran: Array<{ door: string; entry: string; user_action: ActionUserAction | undefined }> = [];
  const doorA = webEntryDoor<string>("test:a", "A only"), doorB = webEntryDoor<string>("test:b", "B only");
  const schema = { type: "object", properties: {}, additionalProperties: false } as const;
  const a = doorA.define({ capability_id: "test.door.a", version: 1, title: "A", description: "A", scope: "home", input_schema: schema },
    (entry, _input, caller) => { ran.push({ door: "a", entry, user_action: caller.user_action }); return {}; });
  const b = doorB.define({ capability_id: "test.door.b", version: 1, title: "B", description: "B", scope: "home", input_schema: schema },
    (entry, _input, caller) => { ran.push({ door: "b", entry, user_action: caller.user_action }); return {}; });
  service.registerProvider(webEntryProvider("system.test-doors", "Doors", [a, b]));
  const host = { homeActionClient: () => service, actionClient: () => service };
  const request = { headers: { "x-molis-work-idempotency-key": "request-1" } };

  await doorA.invoke({ host, request, entry: "request one" }, a.definition, {});
  assert.deepEqual(ran.map(row => [row.door, row.entry]), [["a", "request one"]], "the handler gets this request's entry");
  const issued = ran[0]!.user_action!;
  assert.ok(Object.isFrozen(issued));

  await assert.rejects(doorA.invoke({ host, request, entry: "request two" }, b.definition, {}), refused, "one door's credential does not open another's action");
  await assert.rejects(service.invoke(person({ user_action: issued }), a.definition, {}), refused, "the credential ends with its request");
  await assert.rejects(service.invoke(person({ user_action: { ...issued } }), a.definition, {}), refused, "a copy of it is not it");
  await assert.rejects(service.invoke(person({ user_action: issued, project_id: "project-one" }), a.definition, {}), refused, "nor for another project");
  assert.equal(ran.length, 1, "no refused call reached a handler");
});

/** The smallest input the schema accepts, so a refusal is the door's and not the schema's. */
function minimalInput(schema: unknown): unknown {
  const shape = schema as { properties?: Record<string, { type?: unknown; enum?: unknown[]; pattern?: string }>; required?: string[] };
  const input: Record<string, unknown> = {};
  for (const name of shape.required ?? []) {
    const property = shape.properties?.[name] ?? {};
    input[name] = property.enum ? property.enum[0] : property.type === "object" ? {} : Array.isArray(property.type) && property.type.includes("null") ? null : "x";
  }
  return input;
}
