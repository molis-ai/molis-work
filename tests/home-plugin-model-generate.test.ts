import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test, { type TestContext } from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { pluginInstallActions, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { SECOND_PLUGIN_ID, mac, operate, operationsOf, person, ref } from "./fixtures/home-sandbox.js";
import { openTestHome } from "./fixtures/test-home.js";

// BL-714 (PG-011, S-66, S-91; specs/repository-anti-corruption/slices/pg011-pg017-remaining.md §2): a package installed in the Home
// reaches the model through the `model.generate` capability its `prompts.json` is for. The registry holds one entry per id, so the Home's
// instance is registered as `model.generate.home` under the Home's own provider and the Home's catalog shows it to the package under the
// name the package calls. It answers only the Home's own installations, with the instructions the package registered, and nothing is
// sent to the model unless every one of those holds.

/** A Home whose own text model is a local server that records the system text of every request it gets. */
async function modelHome(t: TestContext) {
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  const systems: string[] = [];
  const server: Server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { model: string; messages: Array<{ role: string; content: string }> };
    systems.push(body.messages.filter(message => message.role === "system").map(message => message.content).join("\n"));
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write(`data: ${JSON.stringify({ model: body.model, choices: [{ index: 0, delta: { content: "GENERATED" }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
    response.end("data: [DONE]\n\n");
  });
  t.after(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); resetSecretStoreCache();
    if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior;
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const home = await openTestHome(t);
  // The Host owns the Home's inference service; the model it reaches is the one the Home's settings name.
  const connection = withConnectorConnections(home.home, store => store.createToken({ serviceId: "model-api", displayName: "Fixture", token: "local-fixture" }));
  withConnectorConnections(home.home, store => store.assertTarget(connection.connection_id, "model-api", origin));
  withMolisWorkProjectCatalog({ homeDirectory: home.home }, catalog => catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "fixture", display_name: "Fixture",
    base_url: origin + "/v1", api_format: "openai-chat-completions", models: [{ model_id: "fixture", enabled: true }] }));
  const project = await home.createProject("Model");
  const client = home.host.actionClient(project.reference);
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: [] };
  const install = async (pluginId = PACKAGE_PLUGIN_ID, scope: "home" | "project" = "home", capabilities?: string[], prompts?: Array<{ id: string; body: string }>) => {
    const preview = await client.invoke(person(project.project_id), ref(pluginInstallActions.preview), { bundle: askingPackage(pluginId, scope, capabilities, prompts) }) as { preview_id: string };
    await client.invoke(person(project.project_id), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
    return scope === "home" ? home.host.homePlugins!.installation(pluginId)!.install_id : pluginId;
  };
  /** The package's own operation, as a person's page calls it: the package code asks the model by the name it always used. */
  const ask = async (prompt: string, via?: string, pluginId = PACKAGE_PLUGIN_ID) => operate(client, caller, await operationsOf(client, caller, pluginId), "notes.ask", via ? { prompt, via } : { prompt });
  return { home, project, client, caller, install, ask, systems };
}

/** A signed package for the Home whose `notes.ask` asks the model with one of the instructions it registered, as an author writes it. */
function askingPackage(pluginId: string, scope: "home" | "project" = "home", capabilities = ["model.generate"], prompts = [{ id: "summary", body: "Summarize the notes." }]) {
  return signedPackage(newPublisher(), (files, manifest) => {
    if (scope === "home") manifest.runtime = { scope: "home" };
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.push({ id: "notes.ask", kind: "command", input: { type: "object", properties: { prompt: { type: "string", maxLength: 40 }, via: { type: "string", maxLength: 40 } }, required: ["prompt"], additionalProperties: false },
      output: { type: "string" }, errors: [], effects: { capabilities }, examples: [{ input: { prompt: "summary" }, output: "GENERATED" }] });
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] += "operations['notes.ask'] = async (input, sdk) => (await sdk.capability.call(input.via ?? 'model.generate', { prompt: input.prompt, input: 'the notes' })).text;\n";
    files[SANDBOX_PACKAGE_FILES.prompts] = JSON.stringify(prompts.map(prompt => ({ id: prompt.id, title: prompt.id, purpose: "Ask the model", body: prompt.body })));
  }, { pluginId });
}

const refusedWith = (code: string, message: RegExp) => (error: unknown) => error instanceof ActionError && error.code === code && message.test(error.message);

test("RAC-2614 a package installed in the Home asks the model by the name it always used, and the Home answers with the instruction the package registered", mac, async t => {
  const h = await modelHome(t);
  await h.install();
  assert.equal(await h.ask("summary"), "GENERATED");
  assert.equal(h.systems.length, 1, "one request reached the model");
  assert.match(h.systems[0]!, /Summarize the notes\./, "with the instruction the package registered under the Home");
});

/** What a plugin sees of the platform's model entries in a directory: the Home's (no project) or a project's. */
async function modelEntries(h: Awaited<ReturnType<typeof modelHome>>, scope: "home" | "project") {
  const caller: ActionCallContext = { actor_id: "plugin:probe", audience: "plugin", project_id: scope === "project" ? h.project.project_id : null, permissions: [] };
  const views = await h.home.host.inspectActions(caller, scope === "project" ? h.project.reference : undefined);
  return views.filter(view => view.capability_id === "model.generate" || view.capability_id === "model.generate.home")
    .map(view => ({ id: view.capability_id, provider: view.provider.provider_id, available: view.availability.available, code: view.availability.available ? undefined : view.availability.code }));
}

test("RAC-2610 a project caller cannot reach the Home's instance: the action service refuses it by scope, the project's directory lists only the project's own, and a project package that names the Home's id is refused with the model not asked", mac, async t => {
  const h = await modelHome(t);
  await h.install();
  await h.ask("summary");
  const before = h.systems.length;
  // The Home's entry is in every project's directory (an entry without a project is), and it answers only the Home's own callers.
  assert.deepEqual((await modelEntries(h, "project")).sort((a, b) => a.id.localeCompare(b.id)), [
    { id: "model.generate", provider: "plugin-platform", available: true, code: undefined },
    { id: "model.generate.home", provider: "plugin-platform.home", available: false, code: "actions.scope_mismatch" }]);
  // The project's catalog, which a package's operations are checked against, does not list the Home's entry under any name.
  const unavailable = /这项功能依赖的能力当前不可用：model\.generate\.home/;
  await h.install("io.molis.work.example.projectbound", "project", ["model.generate.home"]);
  await assert.rejects(h.ask("summary", "model.generate.home", "io.molis.work.example.projectbound"), unavailable, "a package of a project names the Home's id");
  assert.equal(h.systems.length, before, "nothing was sent to the model");
});

test("RAC-2610 the Home's instance has no project half: a Home package that names the Home's id is refused, and the Home's directory holds the Home's entry alone", mac, async t => {
  const h = await modelHome(t);
  await h.install();
  await h.ask("summary");
  const before = h.systems.length;
  assert.deepEqual(await modelEntries(h, "home"), [{ id: "model.generate.home", provider: "plugin-platform.home", available: true, code: undefined }],
    "the Home's directory has the Home's entry and not the project's");
  // The package calls the name it always used; the Home's catalog gives it the Home's instance under that name and under no other.
  await h.install("io.molis.work.example.homebound", "home", ["model.generate.home"]);
  await assert.rejects(h.ask("summary", "model.generate.home", "io.molis.work.example.homebound"), /这项功能依赖的能力当前不可用：model\.generate\.home/, "a package of the Home names the id the instance is registered under");
  assert.equal(h.systems.length, before, "nothing was sent to the model");
});

test("RAC-2610 a package installed in a project asks the project's instance: the model is asked once, with the instruction the package registered in the project", mac, async t => {
  const h = await modelHome(t);
  const pluginId = await h.install("io.molis.work.example.projectasks", "project", undefined, [{ id: "summary", body: "PROJECT_SUMMARY" }]);
  assert.equal(await h.ask("summary", undefined, pluginId), "GENERATED");
  assert.equal(h.systems.length, 1, "one request reached the model");
  assert.match(h.systems[0]!, /PROJECT_SUMMARY/, "with the project's registration");
});

test("RAC-2611 each installation asks with the instructions it registered itself: a sibling's same-named instruction is the sibling's text, and one only the sibling registered is refused", mac, async t => {
  const h = await modelHome(t);
  await h.install(PACKAGE_PLUGIN_ID, "home", undefined, [{ id: "summary", body: "FIRST_SUMMARY" }, { id: "only-first", body: "FIRST_ONLY" }]);
  await h.install(SECOND_PLUGIN_ID, "home", undefined, [{ id: "summary", body: "SECOND_SUMMARY" }]);
  assert.equal(await h.ask("summary"), "GENERATED");
  assert.match(h.systems.at(-1)!, /FIRST_SUMMARY/);
  assert.equal(await h.ask("summary", undefined, SECOND_PLUGIN_ID), "GENERATED");
  assert.match(h.systems.at(-1)!, /SECOND_SUMMARY/); assert.doesNotMatch(h.systems.at(-1)!, /FIRST_/);
  const before = h.systems.length;
  await assert.rejects(h.ask("only-first", undefined, SECOND_PLUGIN_ID), /没有声明的模型要求/);
  assert.equal(h.systems.length, before, "the model was not reached");
});

test("RAC-2612 a package that asks with an instruction it did not register is refused, and the model is not reached", mac, async t => {
  const h = await modelHome(t);
  await h.install();
  await h.ask("summary");
  const before = h.systems.length;
  await assert.rejects(h.ask("someone-elses"), /没有声明的模型要求/);
  assert.equal(h.systems.length, before);
});

test("RAC-2613 a package that was switched off is not offered, cannot ask the model, and comes back when switched on", mac, async t => {
  const h = await modelHome(t);
  await h.install();
  await h.ask("summary");
  const before = h.systems.length;
  assert.equal((await h.home.web.post<{ disabled: boolean }>(`/api/plugins/${PACKAGE_PLUGIN_ID}/disable`, {})).disabled, true);
  assert.deepEqual(await operationsOf(h.client, h.caller), [], "its operations are not offered");
  await assert.rejects(h.ask("summary"), /not offered|notes\.ask/);
  assert.equal(h.systems.length, before, "the model was not reached");
  await h.home.web.post(`/api/plugins/${PACKAGE_PLUGIN_ID}/enable`, {});
  assert.equal(await h.ask("summary"), "GENERATED");
});
