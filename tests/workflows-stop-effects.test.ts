import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { bindActionClient, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalHost, MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_PROJECT_ID, type HostCompleteText } from "@molis-ai/molis-work-app-local-host";
import { workflowsActions as w, WORKFLOWS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-workflows";
import { openWorkflowsStore } from "./fixtures/plugin-home-stores.js";
import { formActions, FORM_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-form";
import { pagesActions, PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";

async function setup(t: test.TestContext, completeText: HostCompleteText | null = null, generated?: () => void) {
  const home = await mkdtemp(join(tmpdir(), "workflow-stop-effects-")), databasePath = join(home, "project.db");
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const release: Array<() => void> = [];
  t.after(async () => { release.forEach(done => done()); await host.close(); await rm(home, { recursive: true, force: true }); });
  const caller = { actor_id: "owner", project_id: reference.project_id, audience: "user" as const,
    permissions: [...WORKFLOWS_ACTION_PERMISSIONS, ...FORM_ACTION_PERMISSIONS, ...PAGES_ACTION_PERMISSIONS, "external:write"] };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  const originalRegistry = LocalHost.prototype.actionRegistry;
  let observed = false;
  if (generated) LocalHost.prototype.actionRegistry = function (reference) {
    const registry = originalRegistry.call(this, reference), register = registry.registerProvider;
    return { ...registry, registerProvider: registration => register({ ...registration,
      handlers: registration.handlers.map(handler => {
        if (handler.execution === "sync" || handler.capability_id !== formActions.draft.capability_id) return handler;
        observed = true;
        return { ...handler, handle: async (context: ActionExecutionContext, input: unknown) => {
          try { return await handler.handle(context, input); } finally { generated(); }
        } };
      }),
    }) };
  };
  const document = await (async () => {
    try {
      const result = await actions.invoke(pagesActions.create, { title: "Original source", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The original request" }] }] } });
      if (generated) assert.ok(observed, "the observer wraps the production Form registration");
      return result.document;
    } finally { LocalHost.prototype.actionRegistry = originalRegistry; }
  })();
  const pass = { kind: "function", title_template: "", body_template: "{正文}", instructions: "" };
  return { home, host, reference, actions, release, pageId: document.id, pass };
}

// W5-01-WORKFLOWS-07: a stopped or revoked call leaves no business record; the nested calls go through the action directory.
test("W2-18-WF-STOP-01: stop reaches Form's final effect after its model wait and no later station runs", { timeout: 25_000 }, async t => {
  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>(), childFinished = Promise.withResolvers<void>();
  const f = await setup(t, async () => { entered.resolve(); await finish.promise; return JSON.stringify({ status: "done", questions: [{ title: "Late generated question", type: "text" }] }); }, () => childFinished.resolve());
  f.release.push(() => finish.resolve());
  // The actual Host Form provider is observed in setup; no second provider can shadow it.
  const providerId = "io.molis.work.form";
  const create = { ...formActions.create, provider_id: providerId }, get = { ...formActions.get, provider_id: providerId };
  const { form } = await f.actions.invoke(create, { title: "Current target" });
  const { form: later } = await f.actions.invoke(create, { title: "Later target" });
  const { actions } = await f.actions.invoke(w.actionSteps, {});
  const generate = actions.find(action => action.ref.capability_id === formActions.draft.capability_id && action.ref.provider_id === providerId)!;
  const local = actions.find(action => action.ref.capability_id === formActions.generate.capability_id)!;
  assert.ok(generate && local);
  const { workflow } = await f.actions.invoke(w.create, { title: "Stop uncommitted Form generation", chain: { stations: [{ plugin: "pages" },
    { plugin: "action", action: { ref: generate.ref, title: generate.title, mapping: { id: { value: form.id }, prompt: { from: "body" }, expected_version: { value: form.version } } } },
    { plugin: "action", action: { ref: local.ref, title: local.title, mapping: { id: { value: later.id }, prompt: { from: "body" } } } }], links: [f.pass, f.pass] } });
  const { instance } = await f.actions.invoke(w.start, { id: workflow.workflow_id, item_id: f.pageId });
  const pending = f.actions.invoke(w.continue, { id: instance.instance_id }); const rejected = assert.rejects(pending);
  await entered.promise;
  const stopped = (await f.actions.invoke(w.stop, { id: instance.instance_id })).instance;
  assert.equal(stopped.status, "stopped"); finish.resolve(); await rejected; await childFinished.promise;
  assert.deepEqual((await f.actions.invoke(get, { id: form.id })).form, form, "no late local question or version write");
  assert.equal((await f.actions.invoke(get, { id: later.id })).form.questions.length, 0);
  const reread = (await f.actions.invoke(w.instance, { id: instance.instance_id })).instance;
  assert.equal(reread.status, "stopped"); assert.equal(reread.current, 0);
  assert.ok(reread.steps[0]!.pending?.attempted_at);
  await assert.rejects(f.actions.invoke(w.continue, { id: instance.instance_id, retry_action: true }));
  const reopened = openWorkflowsStore(f.home);
  try { assert.equal(reopened.instance(instance.instance_id, f.reference.project_id).status, "stopped"); } finally { reopened.close(); }
});

test("W2-18-WF-STOP-02: an externally accepted result remains traceable and stopped/reopened runs never redispatch", { timeout: 25_000 }, async t => {
  const f = await setup(t), entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
  f.release.push(() => finish.resolve());
  const receiptFile = join(f.home, "external-accepted.json"); let calls = 0;
  const external = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { body: string };
    calls++; await writeFile(receiptFile, JSON.stringify({ external_id: "accepted-1", calls, body: input.body })); entered.resolve(); await finish.promise;
    response.writeHead(200, { "content-type": "application/json" }); response.end('{"external_id":"accepted-1"}');
  });
  await new Promise<void>(resolve => external.listen(0, "127.0.0.1", resolve)); const address = external.address(); assert.ok(address && typeof address === "object");
  t.after(async () => { finish.resolve(); external.closeAllConnections(); await new Promise<void>(resolve => external.close(() => resolve())); });
  const definition: ActionDefinition<{ body: string }, { external_id: string }> = { capability_id: "fixture.external.accept", version: 1, operation: "command",
    action: { title: "External acceptance", description: "Controlled external delivery", kind: "operation", scope: "project", scheduling: "concurrent", audiences: ["user", "workflow"], permissions: ["external:write"], subject_kinds: [],
      input_schema: { type: "object", properties: { body: { type: "string" } }, required: ["body"], additionalProperties: false },
      output_schema: { type: "object", properties: { external_id: { type: "string" } }, required: ["external_id"], additionalProperties: false } } };
  const unregister = f.host.actionRegistry(f.reference).registerProvider({ provider: { provider_id: "fixture-external", title: "External fixture", kind: "plugin", project_id: f.reference.project_id },
    definitions: [definition], handlers: [{ ...definition, async handle(context, input) {
      await context.beforeEffect(); context.assert_authority_current?.();
      const response = await fetch(`http://127.0.0.1:${address.port}/accept`, { method: "POST", body: JSON.stringify(input), signal: context.signal });
      return response.json();
    } }] });
  t.after(() => unregister());
  const { actions } = await f.actions.invoke(w.actionSteps, {}); const step = actions.find(action => action.ref.capability_id === definition.capability_id)!; assert.ok(step);
  const { workflow } = await f.actions.invoke(w.create, { title: "External delivery", chain: { stations: [{ plugin: "pages" },
    { plugin: "action", action: { ref: step.ref, title: step.title, mapping: { body: { from: "body" } } } }], links: [f.pass] } });
  const { instance } = await f.actions.invoke(w.start, { id: workflow.workflow_id, item_id: f.pageId });
  const pending = f.actions.invoke(w.continue, { id: instance.instance_id }); const rejected = assert.rejects(pending);
  await entered.promise; await f.actions.invoke(w.stop, { id: instance.instance_id }); finish.resolve(); await rejected;
  assert.deepEqual(JSON.parse(await readFile(receiptFile, "utf8")), { external_id: "accepted-1", calls: 1, body: "The original request" }, "stop cannot undo actual external acceptance");
  const reopened = openWorkflowsStore(f.home);
  try {
    const retained = reopened.instance(instance.instance_id, f.reference.project_id);
    assert.equal(retained.status, "stopped"); assert.ok(retained.steps[0]!.pending?.attempted_at);
    assert.match(retained.stopped!.reason, /结果尚未确认/);
  } finally { reopened.close(); }
  await assert.rejects(f.actions.invoke(w.continue, { id: instance.instance_id, retry_action: true })); assert.equal(calls, 1);
});
