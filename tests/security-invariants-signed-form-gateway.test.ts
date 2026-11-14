import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { SANDBOX_PACKAGE_FILES } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { SqlitePluginPrivateStorage, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { APPROVED, operate, operationsOf, person, ref } from "./fixtures/home-sandbox.js";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";

const mac = { skip: process.platform !== "darwin", timeout: 90_000 };
const holdAction = { capability_id: "fixture.signed_form_wait", version: 1 };
const dependencyGrant = "fixture:signed-form-read";
const unapproved = { capability_id: "fixture.signed_form_unapproved", version: 1 };

async function signedPage(t: TestContext, scope: "project" | "home" = "project") {
  const f = await serveHomeRuntime(t), project = await f.project("Original signed page"), other = await f.project("Other project");
  const prefix = "/projects/" + project.project_id;
  const endpoint = "/api/host/plugin-page-actions", componentReadPath = "/api/plugins/" + PACKAGE_PLUGIN_ID + "/call";
  let hold: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  let unapprovedCalls = 0;
  const registerWait = (target: "project" | "home", provider_id: string) => {
    const owner = target === "project" ? project.reference : undefined;
    const action = { title: "Wait before save", description: "Hold the real signed operation before its storage effect", scope: target,
      kind: "query" as const, effect: "read" as const, execution: { cost: "none" as const }, audiences: ["plugin" as const],
      permissions: scope === "project" ? [dependencyGrant] : [], subject_kinds: [],
      input_schema: { type: "null" }, output_schema: { type: "null" } };
    return f.host.actionRegistry(owner).registerProvider({
      provider: { provider_id, title: "Wait before save", kind: "system", project_id: owner?.project_id },
      definitions: [holdAction, unapproved].map(reference => ({ ...reference, operation: "query" as const, action })),
      handlers: [{ ...holdAction, async handle() {
        const waiting = hold;
        if (waiting) { waiting.entered.resolve(); await waiting.release.promise; }
        return null;
      } }, { ...unapproved, handle() { unapprovedCalls++; return null; } }],
    });
  };
  const provider = "system.signed_form_wait";
  let withdraw = registerWait(scope, provider);
  t.after(() => withdraw());
  const bundle = signedPackage(newPublisher(), (files, manifest) => {
    assert.equal(manifest.actions, undefined, "the signed package deliberately has no Manifest action projection");
    if (scope === "home") manifest.runtime = { scope };
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    const operation = contract.operations.find(item => item.id === "notes.add")!;
    operation.effects = { storage: ["read", "write"], capabilities: [holdAction.capability_id] };
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] += `
const add = operations["notes.add"];
operations["notes.add"] = async (input, sdk) => {
  if (input.text === "unapproved") await sdk.capability.call(${JSON.stringify(unapproved.capability_id)}, null);
  await sdk.capability.call(${JSON.stringify(holdAction.capability_id)}, null);
  return add(input, sdk);
};
`;
  });
  const client = f.host.actionClient(project.reference), caller = person(project.project_id);
  const preview = await client.invoke(caller, ref(pluginInstallActions.preview), { bundle }) as { preview_id: string; runtime_scope: string };
  assert.equal(preview.runtime_scope, scope);
  const installed = await client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Fixture publisher" });
  assert.ok(installed);
  const { records, storage } = await f.host.withProject(project.reference, runtime => ({
    records: new SqlitePluginRuntimeRepository(runtime.store.db), storage: new SqlitePluginPrivateStorage(runtime.store.db),
  }));
  const record = scope === "home" ? f.host.homePlugins?.installation(PACKAGE_PLUGIN_ID) : records.list().find(item => item.plugin_id === PACKAGE_PLUGIN_ID);
  assert.ok(record);
  assert.equal(record.state, "running");
  const open = async (at = prefix) => {
    const response = await f.request(at + "/plugins/" + PACKAGE_PLUGIN_ID + "?frame=workbench");
    const html = await response.text();
    assert.equal(response.status, 200, html.slice(0, 200));
    const pageId = /"page_id":"([^"]+)"/u.exec(html)?.[1];
    assert.ok(pageId, "the ordinary third-party id opened its own installed frame");
    return { "x-molis-plugin-page": pageId };
  };
  const post = (path: string, body: unknown, headers?: Record<string, string>) => f.request(path, { method: "POST", body, headers });
  const submission = (text: string) => ({ mode: "component_submit", component_id: "editor", payload: { form: { text } } });
  const read = async (headers: Record<string, string>, at = prefix) => {
    const answer = await post(at + componentReadPath, { componentId: "notes", binding: "read", payload: {} }, headers);
    assert.equal(answer.status, 200, await answer.clone().text());
    return (await answer.json()).value;
  };
  return { ...f, project, other, prefix, endpoint, componentReadPath, open, post, submission, read, records, record, client, caller,
    unapprovedCalls: () => unapprovedCalls,
    withdrawApproval() {
      // Change only the original package approval in this fixture, keeping the installation and both providers live.
      const owner = "agent-studio:" + project.project_id, key = APPROVED + PACKAGE_PLUGIN_ID;
      const before = storage.snapshotInstallationData(owner);
      assert.ok(before.some(row => row.item_key === key));
      storage.restoreInstallationData(owner, before.filter(row => row.item_key !== key));
      return () => storage.restoreInstallationData(owner, before);
    },
    replaceWait(target: "project" | "home", newProvider = provider) {
      withdraw();
      withdraw = registerWait(target, newProvider);
      return () => { withdraw(); withdraw = registerWait(scope, provider); };
    },
    async atWrite(pending: () => Promise<Response>, refuse: () => void | Promise<void>) {
      const gate = { entered: deferred(), release: deferred() }; hold = gate;
      const response = pending();
      try {
        await Promise.race([gate.entered.promise, response.then(async early => assert.fail("submit finished before the real sandbox wait: " + await early.clone().text()))]);
        await refuse();
      } finally { hold = undefined; gate.release.resolve(); }
      return response;
    },
  };
}

async function refusal(response: Response, status: number, code: string) {
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  assert.equal(body.code, code);
}

test("S-47 SCS-11 project signed form submits through the original page and refuses old routes and forged identities", mac, async t => {
  const f = await signedPage(t), page = await f.open();
  const post = (path: string, body: unknown, headers = page) => f.post(f.prefix + path, body, headers);
  assert.deepEqual(await f.read(page), [], "opening the installed page does not write");
  await refusal(await post(f.componentReadPath, { componentId: "editor", binding: "submit", payload: { form: { text: "old" } } }), 403, "actions.forbidden");
  await refusal(await post(f.componentReadPath, { operation: "notes.add", input: { text: "raw" } }), 403, "actions.forbidden");
  await refusal(await f.post(f.prefix + f.endpoint, f.submission("without page")), 403, "actions.forbidden");
  const forgedProof = await post(f.endpoint, f.submission("forged browser proof"), { ...page, "x-molis-work-page-session": "forged" });
  assert.equal(forgedProof.status, 403, await forgedProof.text());
  await refusal(await post(f.endpoint, { ...f.submission("forged"), provider_id: "plugin:other", project_id: f.other.project_id, install_id: f.record.install_id }), 400, "actions.input_invalid");
  await refusal(await f.post("/projects/" + f.other.project_id + f.endpoint, f.submission("other project"), page), 403, "actions.forbidden");
  assert.deepEqual(await f.read(page), [], "old, raw, forged and cross-project requests write nothing");
  const closed = await f.request(f.prefix + "/api/host/plugin-pages/" + page["x-molis-plugin-page"], { method: "DELETE" });
  assert.equal(closed.status, 200);
  await refusal(await post(f.endpoint, f.submission("closed")), 403, "actions.forbidden");

  const fresh = await f.open();
  assert.deepEqual(await f.read(fresh), [], "closing without submitting writes nothing");
  const denied = await post(f.endpoint, f.submission("unapproved"), fresh);
  assert.equal(denied.ok, false, await denied.text());
  assert.equal(f.unapprovedCalls(), 0, "a different real action in the same catalog is not approved");
  assert.deepEqual(await f.read(fresh), [], "the rejected delegation writes no notes");
  const saved = await post(f.endpoint, f.submission("once"), fresh);
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal(await saved.json(), true);
  const rows = [{ id: "1", text: "once" }];
  assert.deepEqual(await f.read(fresh), rows, "one submit writes one row");
  const caller = { ...f.caller, permissions: ["storage:private", dependencyGrant] }, views = await operationsOf(f.client, caller);
  assert.equal(await operate(f.client, caller, views, "notes.add", { text: "directory" }), true,
    "the actual exposed action accepts the same operation the raw HTTP path refused");
  assert.deepEqual(await f.read(fresh), [...rows, { id: "2", text: "directory" }]);
});

test("S-47 SCS-11 original signed page refuses same-version digest replacement and late sandbox writes", mac, async t => {
  const f = await signedPage(t), page = await f.open();
  const replaced = { ...f.record, manifest_digest: "0".repeat(64) };
  assert.notEqual(replaced.manifest_digest, f.record.manifest_digest);
  const call = (text: string) => f.post(f.prefix + f.endpoint, f.submission(text), page);
  // Inject the changed digest through the owning repository. Keep the original live activation and version
  // so an install-id or version-only check cannot explain the page refusal.
  f.records.save(replaced);
  try { await refusal(await call("stale before submit"), 403, "actions.forbidden"); }
  finally { f.records.save(f.record); }
  try {
    const late = await f.atWrite(() => call("stale before write"), () => f.records.save(replaced));
    assert.equal(late.ok, false, await late.text());
  } finally { f.records.save(f.record); }
  const fresh = await f.open();
  assert.deepEqual(await f.read(fresh), [], "neither the stale submit nor the already-running sandbox writes");
  for (const [target, provider, changed] of [
    ["project", "system.signed_form_replacement", "provider"],
    ["home", undefined, "scope"],
  ] as const) {
    let restoreProvider: (() => void) | undefined;
    try {
      const response = await f.atWrite(() => call("late after " + changed + " change"), () => { restoreProvider = f.replaceWait(target, provider); });
      assert.equal(response.ok, false, await response.text());
    } finally { restoreProvider?.(); }
    assert.deepEqual(await f.read(fresh), [], "a different " + changed + " cannot finish the original write");
  }
  let restoreApproval: (() => void) | undefined;
  try {
    const revoked = await f.atWrite(() => call("late after delegation withdrawal"), () => { restoreApproval = f.withdrawApproval(); });
    assert.equal(revoked.ok, false, await revoked.text());
    await refusal(await call("missing approval"), 403, "actions.forbidden");
  } finally { restoreApproval?.(); }
  try {
    const revoked = await f.atWrite(() => call("late after private storage withdrawal"), () => {
      f.records.save({ ...f.record, grants: f.record.grants.filter(grant => grant !== "storage:private") });
    });
    assert.equal(revoked.ok, false, await revoked.text());
  } finally { f.records.save(f.record); }
  assert.deepEqual(await f.read(fresh), [], "withdrawing either kind of authority leaves no note");
  const late = await f.atWrite(() => f.post(f.prefix + f.endpoint, f.submission("late after close"), fresh), async () => {
    const closed = await f.request(f.prefix + "/api/host/plugin-pages/" + fresh["x-molis-plugin-page"], { method: "DELETE" });
    assert.equal(closed.status, 200);
  });
  assert.equal(late.ok, false, await late.text());
  assert.deepEqual(await f.read(await f.open()), [], "a page closed during its command leaves no storage effect");
});

test("S-47 S-107 SCS-11 a Home signed form retains its original project's reach at the sandbox write", mac, async t => {
  const f = await signedPage(t, "home"), page = await f.open(), homePage = await f.open("");
  assert.deepEqual(await f.read(homePage, ""), []);
  const call = (text: string, headers = page, at = f.prefix) => f.post(at + f.endpoint, f.submission(text), headers);
  const saved = await call("from the project");
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal(await saved.json(), true);
  const rows = [{ id: "1", text: "from the project" }];
  assert.deepEqual(await f.read(homePage, ""), rows, "the project page writes to its one Home installation");
  await refusal(await call("cross project", page, "/projects/" + f.other.project_id), 403, "actions.forbidden");

  // This operation uses only Home capabilities and private storage. Losing the originating project must stop
  // that write even though the Home installation and its direct Home page remain live.
  const stopped = await f.atWrite(() => call("late after withdrawal"), async () => {
    const hidden = await f.request("/api/settings/projects/" + f.project.project_id + "/plugins", { method: "DELETE", body: { plugin_id: PACKAGE_PLUGIN_ID } });
    assert.equal(hidden.status, 200, await hidden.clone().text());
    assert.ok((await hidden.json()).hidden.includes(PACKAGE_PLUGIN_ID));
  });
  assert.equal(stopped.ok, false, await stopped.text());
  await refusal(await call("withdrawn before submit"), 403, "actions.forbidden");
  assert.equal(f.host.homePlugins?.installation(PACKAGE_PLUGIN_ID)?.state, "running");
  assert.deepEqual(await f.read(homePage, ""), rows, "withdrawn page writes nothing to the still-readable Home");
});
