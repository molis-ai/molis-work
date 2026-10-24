import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { ActionAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPluginPlatform, LocalProjectDatabase, DEMO_PROJECT_ID, homeStores, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { createPluginMaterialsClient } from "@molis-ai/molis-work-plugin-runtime";
import { deferred, person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { grantMaterials, materialsProbe } from "./fixtures/materials-runtime.js";
import { callAs, callerPlugin, issuedCaller, registerProbe } from "./fixtures/plugin-callers.js";

/** Another plugin the Host runs, holding the material permissions: the call context it presents to the probe's actions carries the caller the Host issued it. */
async function callingPlugin(host: Parameters<typeof grantMaterials>[0], permissions: readonly string[], caller: ReturnType<typeof callerPlugin>) {
  const issued = await issuedCaller(registerProbe(host.actionRegistry(), "home"), caller);
  return callAs(issued, permissions);
}

test("S-39 RAC-26 runtime material authority strips download permission from every non-user audience for files and sources", async t => {
  const probe = materialsProbe("materialsaudiences", { readPermissions: ["materials:read", "materials:fetch"] }), caller = callerPlugin("materialscaller", "home", { "materials:read": true, "materials:fetch": true });
  const { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition, caller.definition] } });
  await grantMaterials(host, probe);
  const asPlugin = await callingPlugin(host, probe.permissions, caller);
  const seen: boolean[] = [];
  probe.behavior.read = async context => {
    const answer = { text: "read", extractor: "port", pages: [], coverage: { status: "sufficient" as const, processed_pages: 0, total_pages: 0, issues: [] } };
    const service = createPluginMaterialsClient(probe.definition.manifest, {
      extract: async (_source, options) => {
        await options.beforeEffect(); seen.push(options.allowModelDownload);
        for (const key of ["helperPath", "whisperHelperPath", "modelDirectory", "platform", "audience"]) assert.equal(Object.hasOwn(options, key), false, key);
        return answer;
      },
      readSource: async (_url, options) => { await options.beforeEffect(); seen.push(options.allowModelDownload); return { ...answer, source_url: "https://example.com", provider: "article" }; },
      readDocuments: () => Promise.reject(new Error("not read here")),
    }, { install_id: context.install_id, installation_generation: context.installation_generation, project_id: null, assertActive: () => { context.services!.storage!.get("authority"); }, requireGrant: permission => context.requireGrant(permission) });
    const request = { allowModelDownload: true, audience: "user", helperPath: "/untrusted", whisperHelperPath: "/untrusted", modelDirectory: "/untrusted", platform: "darwin" };
    await service.extract!({ file_name: "a.txt", bytes: Buffer.from("authorized") }, request);
    return service.readSource!("https://example.com", { allowModelDownload: true });
  };
  for (const audience of ["agent", "mcp", "workflow", "plugin", "user"] as const) {
    await host.homeActionClient().invoke(audience === "plugin" ? asPlugin : { ...person(probe.permissions), audience }, probe.read, {});
  }
  assert.deepEqual(seen, [false, false, false, false, false, false, false, false, true, true]);
});

test("RAC-25 material methods are independently declared; real Host extraction works and startup, serial and undeclared actions are refused", async t => {
  const probes = [materialsProbe("onlyread", { permissions: ["materials:read"] }), materialsProbe("onlyfetch", { permissions: ["materials:fetch"] }), materialsProbe("nomaterials", { permissions: [] })];
  const { host } = await serveHomeRuntime(t, { pluginFixtures: { home: probes.map(probe => probe.definition) } });
  for (const probe of probes) await grantMaterials(host, probe);
  assert.deepEqual(Object.keys(probes[0]!.contexts.at(-1)!.services!.materials!), ["extract", "readDocuments", "imageTextAvailable"]);
  assert.deepEqual(Object.keys(probes[1]!.contexts.at(-1)!.services!.materials!), ["readSource"]);
  assert.equal(probes[2]!.contexts.at(-1)!.services!.materials, undefined);
  const probe = probes[0]!, client = host.homeActionClient(), caller = person(probe.permissions);
  const result = await client.invoke(caller, probe.read, {}) as { text: string; coverage: { status: string } };
  assert.equal(result.text, "材料原文"); assert.equal(result.coverage.status, "sufficient");
  await assert.rejects(client.invoke(caller, probe.serial, {}), { code: "plugin.materials_action_not_concurrent" });
  await assert.rejects(client.invoke(caller, probe.plain, {}), { code: "plugin.materials_permission_undeclared" });
  await assert.rejects(probe.contexts.at(-1)!.services!.materials!.extract!({ file_name: "note.txt", bytes: Buffer.from("outside") }), { code: "plugin.materials_action_required" });
  await assert.rejects(host.homeActionClient().invoke(person(probes[1]!.permissions), probes[1]!.source, {}), { code: "material.source.private_address" });
});

test("PG-050 / W5-01-PAGES-01 a document batch is read by the Host under materials:read, inside the plugin's own concurrent action, and a bad upload is refused before parsing", async t => {
  const probe = materialsProbe("documentbatch", { permissions: ["materials:read"] }), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  await grantMaterials(host, probe);
  const upload = (name: string, text: string) => ({ file_name: name, data_base64: Buffer.from(text).toString("base64") });
  probe.behavior.read = (context): Promise<unknown> => context.services!.materials!.readDocuments!([upload("one.md", "# 标题\n正文"), upload("two.txt", "第二份")]);
  const client = host.homeActionClient(), caller = person(probe.permissions);
  const batch = await client.invoke(caller, probe.read, {}) as { documents: Array<{ name: string; format: string; content: string }> };
  assert.deepEqual(batch.documents.map(item => [item.name, item.format]), [["one.md", "markdown"], ["two.txt", "text"]]);
  assert.match(batch.documents[0]!.content, /正文/);
  probe.behavior.read = (context): Promise<unknown> => context.services!.materials!.readDocuments!([{ file_name: "bad.txt", data_base64: "YR==" }]);
  await assert.rejects(client.invoke(caller, probe.read, {}), { code: "material.invalid_document" });
  await assert.rejects(client.invoke(caller, probe.serial, {}), { code: "plugin.materials_action_not_concurrent" });
  await assert.rejects(probe.contexts.at(-1)!.services!.materials!.readDocuments!([upload("outside.md", "x")]), { code: "plugin.materials_action_required" });
});

test("RAC-25 S-60 RAC-235 a sandboxed definition receives the Host's readers of bytes, a page on this machine and the saved original files, and a package that asks for a network read is refused at start", async t => {
  const { home } = await serveHomeRuntime(t);
  const file = join(mkdtempSync(join(home, "project-")), "project.db"); seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), shared = pluginActions(store, DEMO_PROJECT_ID);
  const platform = createPluginPlatform({ actions: shared, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) }),
    ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    home: { directory: home, completeText: () => null, stores: homeStores() } });
  try {
    const reads = materialsProbe("boxedreads", { execution: "sandbox", permissions: ["materials:read"] });
    await platform.start([{ definition: reads.definition, grants: reads.permissions }]);
    assert.equal(reads.contexts.length, 1);
    const materials = reads.contexts[0]!.services!.materials!;
    assert.deepEqual(Object.keys(materials).sort(), ["extract", "imageTextAvailable", "readDocuments"]);
    // A page on this machine and the saved original files are given (S-66): the Host's client has the methods that are declared, the broker forwards them.
    const local = materialsProbe("boxedlocal", { execution: "sandbox", permissions: ["materials:read", "materials:fetch_local", "materials:original"] });
    await platform.start([{ definition: local.definition, grants: local.permissions }]);
    assert.deepEqual(Object.keys(local.contexts[0]!.services!.materials!).sort(), ["claimOriginal", "extract", "imageTextAvailable", "readDocuments", "readLocalPage", "readOriginal", "readOriginalRange", "releaseOriginal"]);
    // What the sandbox is not given is refused with a code before its code starts, whether the package needs it or the person approved it.
    for (const refused of [["materials:fetch"], ["materials:read", "materials:fetch"]]) {
      const name = `boxed${refused.join("").replace(/[^a-z]/g, "")}`, probe = materialsProbe(name, { execution: "sandbox", permissions: refused });
      await platform.start([{ definition: probe.definition, grants: probe.permissions }]);
      assert.equal(probe.contexts.length, 0, `${refused.join(", ")}: the sandboxed package's start never ran`);
      const installed = platform.runtime.list().find(item => item.plugin_id === probe.id)!;
      assert.deepEqual({ state: installed.state, code: installed.last_error_code }, { state: "crashed", code: "sandbox.service_not_given" }, refused.join(", "));
    }
  } finally {
    for (const installed of platform.runtime.list()) if (installed.state === "running") await platform.runtime.stop(installed.install_id);
    store.close();
  }
});

test("RAC-25 RAC-27 materials from another installation or an expired action cannot reach extraction", async t => {
  const one = materialsProbe("materialsone"), two = materialsProbe("materialstwo"), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [one.definition, two.definition] } });
  await grantMaterials(host, one); await grantMaterials(host, two);
  one.behavior.read = async () => two.contexts.at(-1)!.services!.materials!.extract!({ file_name: "a.txt", bytes: Buffer.from("not owned") });
  await assert.rejects(host.homeActionClient().invoke(person(one.permissions), one.read, {}), { code: "plugin.materials_action_required" });
  const release = deferred(); let late: Promise<unknown> | undefined;
  one.behavior.read = async context => { late = release.promise.then(() => context.services!.materials!.extract!({ file_name: "a.txt", bytes: Buffer.from("too late") })); return "finished"; };
  assert.equal(await host.homeActionClient().invoke(person(one.permissions), one.read, {}), "finished");
  release.resolve(); await assert.rejects(late!, { code: "actions.expired" });
});

test("S-39 RAC-26 only a user's explicit choice reaches the speech helper as download permission", { timeout: 60_000, skip: process.platform !== "darwin" }, async t => {
  const probe = materialsProbe(), caller = callerPlugin("materialscaller", "home", { "materials:read": true, "materials:fetch": true });
  const { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition, caller.definition] } });
  await grantMaterials(host, probe);
  const asPlugin = await callingPlugin(host, probe.permissions, caller);
  const helper = join(home, "speech-helper"), choices = join(home, "choices.jsonl"), downloaded = join(home, "downloaded");
  const prior = process.env.MOLIS_JELLY_WHISPER_HELPER; process.env.MOLIS_JELLY_WHISPER_HELPER = helper;
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_JELLY_WHISPER_HELPER; else process.env.MOLIS_JELLY_WHISPER_HELPER = prior; });
  writeFileSync(helper, `#!${process.execPath}\nconst fs = require('node:fs'); const allowed = process.argv.includes('--allow-model-download'); fs.appendFileSync(${JSON.stringify(choices)}, JSON.stringify(allowed)+'\\n'); if (!allowed) { process.stdout.write(JSON.stringify({error:'model_required',message:'explicit download required'})); process.exit(1); } fs.writeFileSync(${JSON.stringify(downloaded)},'user approved'); process.stdout.write(JSON.stringify({text:'transcript',extractor:'fixture-speech',pages:[],coverage:{status:'sufficient',processed_pages:0,total_pages:0,issues:[]}}));\n`, { mode: 0o700 });
  let choice = true, audience: ActionAudience = "user";
  probe.behavior.read = async (context, caller) => {
    assert.equal(caller.audience, audience);
    return context.services!.materials!.extract!({ file_name: "speech.wav", bytes: Buffer.from("media fixture") }, { allowModelDownload: choice });
  };
  for (audience of ["agent", "mcp", "workflow", "plugin"]) {
    await assert.rejects(host.homeActionClient().invoke(audience === "plugin" ? asPlugin : { ...person(probe.permissions), audience }, probe.read, {}), { code: "material.model_required" });
    assert.equal(existsSync(downloaded), false);
  }
  audience = "user"; choice = false;
  await assert.rejects(host.homeActionClient().invoke(person(probe.permissions), probe.read, {}), { code: "material.model_required" });
  assert.equal(existsSync(downloaded), false);
  choice = true;
  const result = await host.homeActionClient().invoke(person(probe.permissions), probe.read, {}) as { text: string };
  assert.equal(result.text, "transcript"); assert.equal(readFileSync(downloaded, "utf8"), "user approved");
  assert.deepEqual(readFileSync(choices, "utf8").trim().split("\n").map(line => JSON.parse(line)), [false, false, false, false, false, true]);
  assert.deepEqual(readdirSync(join(home, "lingguang", "models")), [], "RAC-30 only the existing cache path is prepared");
});

// S-39 on every platform: the materials client the Runtime gives a plugin (`createPluginMaterialsClient`, bound to this installation's
// running action and grants), around a port that waits where the Host's native helper would. `extract` and the document batch
// (`readDocuments`, PG-050) both run through it. The cases after this drive the Host's own speech helper, which only macOS has, and
// are listed under 「只在本机跑」.
for (const method of ["extract", "readDocuments"] as const) for (const invalidation of ["cancel", "stop", "revoke", "upgrade"] as const) {
  test(`S-39 RAC-27 ${invalidation} while ${method === "extract" ? "material extraction" : "a document batch read"} waits refuses the late result and every business write, on any platform`, { timeout: 60_000 }, async t => {
    const probe = materialsProbe(), { host } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
    const { platform, install } = await grantMaterials(host, probe);
    const entered = deferred(), release = deferred(), over = deferred(), abort = new AbortController();
    let waited = false, handed = false;
    const wait = async (options: { beforeEffect(): Promise<void> }) => { await options.beforeEffect(); entered.resolve(); await release.promise; waited = true; };
    probe.behavior.read = async (context, caller) => {
      const materials = createPluginMaterialsClient(probe.definition.manifest, {
        extract: async (_source, options) => {
          await wait(options);
          return { text: "late material", extractor: "waiting-port", pages: [], coverage: { status: "sufficient" as const, processed_pages: 0, total_pages: 0, issues: [] } };
        },
        readSource: () => Promise.reject(new Error("not read here")),
        readDocuments: async (_files, options) => {
          await wait(options);
          return { documents: [{ name: "late.md", format: "markdown" as const, content: "late material", coverage: { status: "sufficient" as const, issues: [] } }], warnings: [] };
        },
      }, { install_id: context.install_id, installation_generation: context.installation_generation, project_id: null, assertActive: () => { context.services!.storage!.get("authority"); }, requireGrant: permission => context.requireGrant(permission) });
      try {
        const text = method === "extract"
          ? (await materials.extract!({ file_name: "speech.wav", bytes: Buffer.from("media fixture") })).text
          : (await materials.readDocuments!([{ file_name: "late.md", data_base64: Buffer.from("late material").toString("base64") }])).documents[0]!.content;
        handed = true; await caller.beforeEffect(); context.services!.storage!.set("late", text); return text;
      } finally { over.resolve(); }
    };
    const pending = host.homeActionClient().invoke({ ...person(probe.permissions), signal: abort.signal }, probe.read, {});
    // A cancel ends the call with the caller's own abort; the others find the installation gone or changed when the port answers.
    const refused = assert.rejects(pending, invalidation === "cancel" ? { name: "AbortError" } : { code: "actions.forbidden" });
    let replacement = probe;
    try {
      await Promise.race([entered.promise, pending]);
      if (invalidation === "cancel") abort.abort();
      else if (invalidation === "upgrade") {
        replacement = materialsProbe("materialsprobe", { version: "1.1.0" });
        await platform.runtime.upgrade({ install_id: install.install_id, definition: replacement.definition, grants: probe.permissions });
        assert.equal(replacement.preflight[0]!.services?.materials, undefined, "RAC-25 upgrade preflight is read-only");
      } else {
        await platform.runtime.stop(install.install_id);
        if (invalidation === "revoke") platform.runtime.grant(install.install_id, ["storage:private"]);
      }
    } finally { release.resolve(); }
    await over.promise; await refused;
    assert.equal(waited, true, "the port finished: what is refused is its result");
    assert.equal(handed, false);
    if (invalidation === "stop" || invalidation === "revoke") await platform.supervisor.restart(probe.id);
    assert.equal(replacement.contexts.at(-1)!.services!.storage!.get("late"), null);
  });
}

for (const invalidation of ["cancel", "stop", "revoke", "upgrade"] as const) {
  test(`RAC-27 RAC-30 ${invalidation} during material extraction refuses late results and persistent business writes`, { timeout: 60_000, skip: process.platform !== "darwin" }, async t => {
    const probe = materialsProbe(), { host, home } = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
    const { platform, install } = await grantMaterials(host, probe), helper = join(home, "waiting-helper"), release = join(home, "release");
    const prior = process.env.MOLIS_JELLY_WHISPER_HELPER; process.env.MOLIS_JELLY_WHISPER_HELPER = helper;
    t.after(() => { if (prior === undefined) delete process.env.MOLIS_JELLY_WHISPER_HELPER; else process.env.MOLIS_JELLY_WHISPER_HELPER = prior; });
    writeFileSync(helper, `#!${process.execPath}\nconst fs=require('node:fs');process.stderr.write(JSON.stringify({stage:'waiting',progress:0})+'\\n');const timer=setInterval(()=>{if(!fs.existsSync(${JSON.stringify(release)}))return;clearInterval(timer);process.stdout.write(JSON.stringify({text:'late material',extractor:'fixture-speech',pages:[],coverage:{status:'sufficient',processed_pages:0,total_pages:0,issues:[]}}));},10);\n`, { mode: 0o700 });
    const entered = deferred(), over = deferred(), abort = new AbortController(); let handed = false;
    probe.behavior.read = async (context, caller) => {
      try {
        const result = await context.services!.materials!.extract!({ file_name: "speech.wav", bytes: Buffer.from("media fixture") });
        handed = true; await caller.beforeEffect(); context.services!.storage!.set("late", result.text); return result;
      } finally { over.resolve(); }
    };
    const pending = host.homeActionClient().invoke({ ...person(probe.permissions), signal: abort.signal, on_progress: () => entered.resolve() }, probe.read, {});
    const refused = assert.rejects(pending);
    let replacement = probe;
    try {
      await Promise.race([entered.promise, pending]);
      if (invalidation === "cancel") abort.abort();
      else if (invalidation === "upgrade") {
        replacement = materialsProbe("materialsprobe", { version: "1.1.0" });
        await platform.runtime.upgrade({ install_id: install.install_id, definition: replacement.definition, grants: probe.permissions });
        assert.equal(replacement.preflight[0]!.services?.materials, undefined, "RAC-25 upgrade preflight is read-only");
      } else {
        await platform.runtime.stop(install.install_id);
        if (invalidation === "revoke") platform.runtime.grant(install.install_id, ["storage:private"]);
      }
    } finally { writeFileSync(release, "continue"); }
    await over.promise; await refused; assert.equal(handed, false);
    if (invalidation === "stop" || invalidation === "revoke") await platform.supervisor.restart(probe.id);
    assert.equal(replacement.contexts.at(-1)!.services!.storage!.get("late"), null);
  });
}
