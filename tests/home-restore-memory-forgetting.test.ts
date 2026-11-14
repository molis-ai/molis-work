import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { inspectMolisWorkProjectCatalogSnapshot, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createHomeSnapshot, ensureSystemAgentService, MolisWorkLocalHost, prologueMemoryBackend, recoverHomeRestore, restoreHomeSnapshot } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryCaller, AgentMemorySourceRef, AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { acquireStorageOwner, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";
import { homeBusinessTree, homeStorageTree } from "./fixtures/home-storage-files.js";
import { openTestHome, serveTestHost, type TestHostServer } from "./fixtures/test-home.js";
import { restoreFixture } from "./fixtures/home-restore.js";
import { currentMemoryOptions } from "./fixtures/current-memory.js";

const person: ActionCallContext = {
  actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: [...MEMORY_PERMISSIONS],
};

for (const damaged of [false, true])
test(`A4-M core restore: exact formal removal preserves its unselected long-term candidate (${damaged ? "bad" : "readable"} current ledger)`, async t => {
  const f = await restoreFixture(t), appId = "io.molis.work";
  const caller = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "exact-project", consumer: "ui",
    person: true, current_scene: "coding", purpose: "management", operation_id });
  let modelCalls = 0;
  const open = async () => {
    const storageOwner = acquireStorageOwner(f.root);
    const adapter = await createPrologueNodeAdapter({ app: { appId, appVersion: "1.0.0" }, storageRoot: f.root, storageOwner,
      memory: currentMemoryOptions({ appId, scopesFor: () => [{ scope: "user", owner: LOCAL_PERSON_ACTOR_ID }],
        allowed: who => who.actor_id === LOCAL_PERSON_ACTOR_ID && who.person === true }),
      modelConfiguration: async () => { modelCalls++; throw new Error("Core retention never calls a model"); } });
    const ledger = openMemoryLedger({ homeDirectory: f.home, storageOwner }), backend = prologueMemoryBackend(async () => adapter.memory!);
    let closed = false;
    return { ledger, adapter, service: new MemoryService({ ledger, backend }), raw: backend.withCaller(caller("inspect")), rawFor: (who: MemoryCaller) => backend.withCaller(who),
      close: async () => { if (closed) return; closed = true; ledger.close(); await adapter.close(); storageOwner.release(); } };
  };
  let env = await open();
  try {
    const proposed = await env.service.propose(caller("propose"), { scope: "personal", text: "Unselected candidate's long-term wording",
      kind: "preference", basis: "inferred", why: "Preserve this candidate's own management history", from: "gate" });
    const accepted = await env.service.accept(caller("accept"), proposed.candidate_id);
    assert.ok(accepted.memory);
    const note = env.ledger.candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === proposed.candidate_id)!;
    const candidate = (await env.raw.candidates.list("personal", LOCAL_PERSON_ACTOR_ID)).find(one => one.candidate_id === proposed.candidate_id)!;
    assert.equal(candidate.meta.classification?.lifecycle, "long-term");
    const correction = await env.service.propose(caller("pending-correction"), { scope: "personal", text: "Unselected pending correction also stays long-term",
      kind: "preference", basis: "inferred", why: "A supersedes link is not an exact selection", from: "gate", supersedes: accepted.memory.memory_id });
    const correctionNote = env.ledger.candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === correction.candidate_id)!;
    const correctionCanonical = (await env.raw.candidates.list("personal", LOCAL_PERSON_ACTOR_ID)).find(one => one.candidate_id === correction.candidate_id)!;
    assert.equal(correctionCanonical.meta.classification?.lifecycle, "long-term");
    const session = await env.adapter.createSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "exact-project", plugin_id: "io.molis.work.coding",
      install_id: "coding", workspace: "none", role_id: "coding", title: "Fixed core restore selection" });
    const original = (await env.raw.list("personal", LOCAL_PERSON_ACTOR_ID)).find(one => one.memory_id === accepted.memory!.memory_id)!;
    const who = { ...caller("session-core"), session_id: session.session_id };
    const formal = await env.rawFor(who).setMeta({ scope: "personal", owner: LOCAL_PERSON_ACTOR_ID, memory_id: original.memory_id,
      expected_version: original.version, operation_id: "session-meta", meta: { ...original.meta,
        classification: { scenes: ["coding"], lifecycle: "session" }, session_ref: { kind: "session", id: session.session_id, revision: 1 } } });
    await env.close();
    assert.equal((await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot })).status, "created");
    const archive = homeStorageTree(f.snapshot);
    env = await open();
    const decision = env.ledger.forgetting.accept({ selection_mode: "exact-identities", scope: "personal", owner: LOCAL_PERSON_ACTOR_ID,
      actor_id: LOCAL_PERSON_ACTOR_ID, operation_id: "exact-core", memories: [{ memory_id: formal.memory_id, version: formal.version }],
      candidates: [], source_event_ids: [] });
    assert.ok((await env.rawFor(who).list("personal", LOCAL_PERSON_ACTOR_ID)).some(one => one.memory_id === formal.memory_id));
    await env.rawFor(who).remove({ scope: "personal", owner: LOCAL_PERSON_ACTOR_ID, memory_id: formal.memory_id,
      expected_version: formal.version, operation_id: "physical-exact" });
    env.ledger.forget(formal.memory_id, decision.selection_mode);
    assert.deepEqual(env.ledger.candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === candidate.candidate_id), note);
    assert.deepEqual(env.ledger.candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === correction.candidate_id), correctionNote);
    await env.close();
    if (damaged) fs.writeFileSync(join(f.home, "memory", "memory.db"), "opaque damaged current ledger; no Session can be guessed here");
    const options = { homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot };
    assert.equal((await restoreHomeSnapshot(options)).status, "restored");
    assert.deepEqual(homeStorageTree(f.snapshot), archive);
    env = await open();
    assert.equal((await env.rawFor(who).list("personal", LOCAL_PERSON_ACTOR_ID)).some(one => one.memory_id === formal.memory_id), false);
    assert.deepEqual((await env.raw.candidates.list("personal", LOCAL_PERSON_ACTOR_ID)).find(one => one.candidate_id === candidate.candidate_id), candidate);
    assert.deepEqual(env.ledger.candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === candidate.candidate_id), note);
    assert.deepEqual((await env.raw.candidates.list("personal", LOCAL_PERSON_ACTOR_ID)).find(one => one.candidate_id === correction.candidate_id), correctionCanonical);
    assert.deepEqual(env.ledger.candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === correction.candidate_id), correctionNote);
    assert.equal((await env.service.candidates(caller("pending-after-restore"))).find(one => one.candidate_id === correction.candidate_id)?.text, correctionNote.text);
    assert.deepEqual(env.ledger.revisions(formal.memory_id), []);
    assert.ok(env.ledger.changesOf(formal.memory_id).every(one => !one.text && one.reason === null));
    assert.equal(env.ledger.forgetting.read().decisions.find(one => one.operation_id === "exact-core")!.selection_mode, "exact-identities");
    await env.close();
    assert.equal((await restoreHomeSnapshot(options)).status, "restored", "repeat restore retains the fixed selection without ledger inference");
    env = await open();
    assert.deepEqual(env.ledger.candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === candidate.candidate_id), note);
    assert.deepEqual(env.ledger.candidates(LOCAL_PERSON_ACTOR_ID).find(one => one.candidate_id === correction.candidate_id), correctionNote);
    assert.equal((await env.rawFor(who).list("personal", LOCAL_PERSON_ACTOR_ID)).some(one => one.memory_id === formal.memory_id), false);
    assert.equal(modelCalls, 0);
  } finally { await env.close(); }
});

// Match the original restore contract: files retain bytes, mode, mtime and inode;
// directories retain mode and inode while their mtime records actual rename operations.
function retainedOriginalState(home: string) {
  return Object.fromEntries(Object.entries(homeBusinessTree(home)).map(([path, value]) => {
    const stat = fs.lstatSync(join(home, path));
    return [path, { ...(stat.isDirectory() ? { mode: value.mode } : value), ino: stat.ino }];
  }));
}

// The original comes from protected HTTP and the actual Assistant remember tool. The source
// projection case also proposes through that public service and live caller; every source owner
// and permission remains the production path, with no replacement source-authority fixture.
for (const scenario of ["present", "bad-ledger", "decision-crash", "before-formation", "source-orphan", "commit-unknown", "purge-failure", "purge-crash", "committed", "changed-sdk-kind", "new-sdk-file"] as const)
test(`MEM-RESTORE-FORGET: ${scenario} preserves later forgetting and source suppression`, { timeout: 90_000 }, async t => {
  const home = await openTestHome(t), snapshot = join(tmpdir(), "molis-memory-forget-snapshot-" + randomUUID());
  t.after(() => rm(snapshot, { recursive: true, force: true }));
  let host: MolisWorkLocalHost | undefined = home.host, web: TestHostServer | undefined = home;
  const close = async () => {
    await web?.close(); web = undefined;
    await host?.close(); host = undefined;
  };
  const reopen = async () => {
    await close();
    host = new MolisWorkLocalHost({ homeDirectory: home.home, completeText: null });
    web = await serveTestHost(null, { home: home.home, host });
    const system = ensureSystemAgentService(host, home.home); await system.ready;
    return { actions: bindActionClient(host.homeActionClient(), () => person), adapter: system.agentHost.adapter("prologue") };
  };
  try {
    const forgottenText = "以后回答请用要点列表", survivorText = "项目说明优先解释背景";
    let sources: AgentMemorySourceRef[] = [], sourceCandidate: string | undefined, sourceCandidateError: unknown;
    const write = MemoryService.prototype.write;
    t.mock.method(MemoryService.prototype, "write", async function (this: MemoryService, ...args: Parameters<MemoryService["write"]>) {
      if (args[1].text === forgottenText && args[2]?.sources) sources = structuredClone([...args[2].sources]);
      const saved = await write.apply(this, args);
      if (scenario === "source-orphan" && args[1].text === forgottenText) {
        // Invoke the public service while the real Assistant caller and source owner are live.
        // This candidate shares only the validated original, not a canonical/supersedes link.
        try { sourceCandidate = (await this.propose({ ...args[0], source_use: "explicit", operation_id: randomUUID() }, {
          scope: "personal", text: "要点后附上简短结论", kind: "preference", basis: "inferred",
          why: "同一本人原件的待审建议", from: "gate",
        }, { sources: args[2]!.sources })).candidate_id; }
        catch (error) { sourceCandidateError = error; throw error; }
      }
      return saved;
    });
    let first = bindActionClient(home.host.homeActionClient(), () => person);
    // This test exercises an explicit original, not background extraction or a learning retry.
    await first.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { learn_from_work: false } });
    const survivor = await first.invoke(memoryActions.write, { scope: "personal", text: survivorText, kind: "preference" });
    assert.ok(survivor.memory);
    let formNow = scenario !== "before-formation", toolSent = false;
    const model = await connectorAssistantModel(t, home.home, () => {
      if (formNow && !toolSent) { toolSent = true; return { name: "remember", input: { text: forgottenText, said: forgottenText, scope: "personal", kind: "preference" } }; }
      return "已收到。";
    }, undefined, home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog));
    const sent = await home.web.post<AssistantSendResult>("/api/assistant/send", { text: forgottenText, request_id: randomUUID() });
    assert.ok(sent.run_id && sent.work.session_id);
    await untilSetup(async () => {
      const current = await home.web.get<AssistantWorkView>(`/api/assistant/works/${sent.work.work_id}`);
      return current.work.state === "completed" ? current : undefined;
    }, "the real Assistant remember Run completes");
    if (scenario === "before-formation") {
      assert.deepEqual((await first.invoke(memoryActions.list, { scope: "personal" })).items.map(item => item.text), [survivorText]);
      await close();
      assert.equal((await createHomeSnapshot({ homeDirectory: home.home, destination: snapshot })).status, "created");
      first = (await reopen()).actions;
      host!.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog); formNow = true;
      const continued = await web!.web.post<AssistantSendResult>("/api/assistant/send", {
        work_id: sent.work.work_id, text: "请记住我前面说的回答偏好。", request_id: randomUUID(),
      });
      assert.ok(continued.run_id);
      await untilSetup(async () => (await web!.web.get<AssistantWorkView>(`/api/assistant/works/${sent.work.work_id}`)).work.state === "completed" ? true : undefined,
        "the later Run remembers the already-snapshotted original");
    }
    const remembered = (await first.invoke(memoryActions.list, { scope: "personal" })).items.find(item => item.text === forgottenText);
    assert.ok(remembered, "the real Assistant tool must save the person's complete original");
    assert.equal(sources.length, 1, "the real write supplies one canonical original, not a fabricated source");
    assert.equal((await first.invoke(memoryActions.history, { memory_id: remembered.memory_id })).revisions[0]?.text, forgottenText);

    const originalSystem = ensureSystemAgentService(host!, home.home); await originalSystem.ready;
    const originalAdapter = originalSystem.agentHost.adapter("prologue");
    const originalRun = await originalAdapter.read({ session_id: sent.work.session_id, run_id: sent.run_id });
    assert.ok(originalRun.class_restrictions, "the accepted Assistant Run owns the frozen policy for this source");
    assert.equal(originalRun.memory_scene, "assistant");
    const sourceCaller: AgentMemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "assistant",
      session_id: sent.work.session_id, current_scene: "assistant", purpose: "management", source_use: "explicit",
      class_restrictions: originalRun.class_restrictions };
    const replaySource = async (adapter: AgentRuntimeAdapter, caller = sourceCaller) => {
      try {
        const candidate = await adapter.memory!.withCaller(caller).candidates.propose({ scope: "user", owner: LOCAL_PERSON_ACTOR_ID,
          text: forgottenText, origin: "同一本人原件重试", meta: { kind: "preference", basis: "explicit", classification: { scenes: ["assistant"], lifecycle: "long-term" } },
          sources: structuredClone(sources), expected_version: 0, operation_id: randomUUID() });
        return { outcome: "created" as const, candidate_id: candidate.candidate_id };
      } catch (error) {
        return { outcome: "rejected" as const, code: error && typeof error === "object" && "code" in error ? String(error.code) : String(error) };
      }
    };
    const { class_restrictions: _frozenPolicy, ...missingPolicy } = sourceCaller;
    assert.deepEqual(await replaySource(originalAdapter, missingPolicy), { outcome: "rejected", code: "MEMORY_SCOPE_DENIED" },
      "a direct Session-bound source caller cannot bypass the original Run policy");
    const acceptedSource = await replaySource(originalAdapter);
    assert.equal(acceptedSource.outcome, "created", `the same real source must be usable before forgetting: ${JSON.stringify(acceptedSource)}`);
    const modelCalls = model.allRequests.length;
    assert.ok(modelCalls > 0, "the setup used the real loopback model transport");
    await close();
    if (scenario !== "before-formation" && scenario !== "source-orphan") assert.equal((await createHomeSnapshot({ homeDirectory: home.home, destination: snapshot })).status, "created");

    let later = await reopen();
    const forgetOperation = randomUUID();
    const forget = () => bindActionClient(host!.homeActionClient(), () => ({ ...person, memory_operation_id: forgetOperation }))
      .invoke(memoryActions.change, { memory_id: remembered.memory_id, expected_version: remembered.version, action: "remove" });
    if (scenario === "decision-crash") {
      await close();
      const child = spawn(process.execPath, [new URL("./fixtures/memory-forgetting-crash.mjs", import.meta.url).pathname,
        home.home, remembered.memory_id, String(remembered.version), forgetOperation], { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
      const closed = new Promise<{ signal: NodeJS.Signals | null }>((resolve, reject) => {
        child.once("error", reject); child.once("close", (_code, signal) => resolve({ signal }));
      });
      t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await closed; });
      assert.equal((await closed).signal, "SIGKILL", output);
      assert.match(output, /forgetting-decision-durable/u);
      later = await reopen();
      const management = later.adapter.memory!.withCaller({ ...sourceCaller, consumer: "ui", person: true });
      assert.equal((await management.list("user", LOCAL_PERSON_ACTOR_ID)).some(one => one.memory_id === remembered.memory_id), true,
        "the process stopped before the real SDK physical purge");
      assert.equal((await later.actions.invoke(memoryActions.list, { scope: "personal" })).items.some(one => one.memory_id === remembered.memory_id), false);
      assert.deepEqual(await replaySource(later.adapter), { outcome: "rejected", code: "MEMORY_NOT_ACCEPTED" });
    }
    if (scenario === "source-orphan") {
      assert.ok(sourceCandidate, String(sourceCandidateError));
      const prepare = DatabaseSync.prototype.prepare;
      let interrupted = false;
      const fault = t.mock.method(DatabaseSync.prototype, "prepare", function (this: DatabaseSync, sql: string) {
        const statement = prepare.call(this, sql);
        if (sql === "DELETE FROM memory_candidates WHERE candidate_id=?") {
          const run = statement.run;
          t.mock.method(statement, "run", function (this: typeof statement, ...values: Parameters<typeof run>) {
            if (values[0] === sourceCandidate) { interrupted = true; throw new Error("source projection cleanup interrupted"); }
            return run.apply(this, values);
          });
        }
        return statement;
      });
      try { await assert.rejects(forget()); }
      finally { fault.mock.restore(); }
      assert.equal(interrupted, true, "the actual ledger delete fails after its Node SDK purge");
      assert.equal((await later.adapter.memory!.withCaller(sourceCaller).candidates.list("user", LOCAL_PERSON_ACTOR_ID)).some(item => item.candidate_id === sourceCandidate), false);
      await close();
      const ledger = openMemoryLedger({ homeDirectory: home.home });
      try {
        const note = ledger.candidates(LOCAL_PERSON_ACTOR_ID).find(item => item.candidate_id === sourceCandidate)!;
        assert.equal(note.memory_id, null); assert.equal(note.supersedes, null);
        assert.deepEqual(note.source_refs, sources); assert.equal(note.text, "要点后附上简短结论");
      } finally { ledger.close(); }
      assert.equal((await createHomeSnapshot({ homeDirectory: home.home, destination: snapshot })).status, "created");
      later = await reopen();
    }
    const originalArchive = homeStorageTree(snapshot);
    const deleted = await forget();
    assert.equal(deleted.memory, null);
    assert.deepEqual((await later.actions.invoke(memoryActions.list, { scope: "personal" })).items.map(item => item.text), [survivorText]);
    assert.deepEqual((await later.actions.invoke(memoryActions.export, { scope: "personal" })).package.entries.map(item => item.text), [survivorText]);
    assert.deepEqual(await replaySource(later.adapter), { outcome: "rejected", code: "MEMORY_NOT_ACCEPTED" }, "forgetting blocks a new operation on the same original");
    await close();

    if (scenario === "bad-ledger") fs.writeFileSync(join(home.home, "memory", "memory.db"), "a damaged opaque target ledger");
    if (scenario === "changed-sdk-kind") {
      const directory = join(home.home, "agent-runtime", "records", "io.molis.work~runs");
      const original = fs.readdirSync(directory).sort().find(name => name.endsWith(".json"));
      assert.ok(original);
      // Make this valid JSON an ordinary replacement, so its prior inode is protected in originals.
      // The later fault changes the published copy, not an unrelated preserved original.
      fs.appendFileSync(join(directory, original), "\n");
    }
    const options = { homeDirectory: home.home, source: snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot };
    let status: string;
    if (scenario === "purge-failure" || scenario === "purge-crash" || scenario === "commit-unknown" || scenario === "changed-sdk-kind" || scenario === "new-sdk-file") {
      const before = retainedOriginalState(home.home);
      const fault = { "purge-crash": "memory-purge-kill", "purge-failure": "memory-purge-failure", "commit-unknown": "memory-commit-unknown",
        "changed-sdk-kind": "memory-unrelated-kind", "new-sdk-file": "memory-new-sdk-file" }[scenario];
      const child = spawn(process.execPath, [new URL("./fixtures/home-restore-fault.mjs", import.meta.url).pathname,
        home.home, snapshot, fault], { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", chunk => { output += String(chunk); }); child.stderr.on("data", chunk => { output += String(chunk); });
      const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal }));
      });
      t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await closed; });
      const result = await closed;
      assert.match(output, /memory-purge-reached/u, output);
      if (scenario === "purge-crash") {
        assert.equal(result.signal, "SIGKILL");
        assert.equal(JSON.parse(fs.readFileSync(join(home.home, "agent-runtime", ".molis-home-restore.json"), "utf8")).phase, "publishing");
        status = (await recoverHomeRestore(options)).status; assert.equal(status, "rolled_back");
      } else {
        assert.match(output, scenario === "purge-failure" ? /memory-ledger-before-commit/u
          : scenario === "commit-unknown" ? /memory-native-commit-returned:1\n/u : /memory-unexpected-sdk-write/u,
          "the actual post-purge fault boundary must be reached");
        assert.equal(result.code, 1, output); assert.match(output, /host\.home_restore\.rolled_back/u); status = "rolled_back";
      }
      assert.deepEqual(retainedOriginalState(home.home), before, "rollback returns the later forgotten Home, not the old archive");
    } else if (scenario === "committed") {
      const marker = join(home.home, "agent-runtime", ".molis-home-restore.json"), unlink = fs.unlinkSync;
      const fault = t.mock.method(fs, "unlinkSync", path => {
        if (String(path) === marker) throw Object.assign(new Error("committed barrier clear failure"), { code: "EIO" });
        return unlink(path);
      });
      syncBuiltinESMExports();
      try { await assert.rejects(restoreHomeSnapshot(options), { code: "host.home_restore.published_unconfirmed" }); }
      finally { fault.mock.restore(); syncBuiltinESMExports(); }
      assert.equal(JSON.parse(fs.readFileSync(marker, "utf8")).phase, "committed");
      const published = homeBusinessTree(home.home);
      status = (await recoverHomeRestore(options)).status; assert.equal(status, "finished");
      const finished = homeBusinessTree(home.home);
      delete published["agent-runtime/.molis-home-restore.json"];
      assert.deepEqual(finished, published, "committed recovery only finishes the already-sanitized publication");
    } else { status = (await restoreHomeSnapshot(options)).status; assert.equal(status, "restored"); }
    assert.deepEqual(homeStorageTree(snapshot), originalArchive, "restoration must not rewrite the original archive or its manifest");
    if (scenario === "source-orphan") {
      const ledger = openMemoryLedger({ homeDirectory: home.home });
      try { assert.equal(ledger.candidates(LOCAL_PERSON_ACTOR_ID).some(item => item.candidate_id === sourceCandidate), false,
        "the already-cleared source-only candidate's persisted text and why must be physically removed"); }
      finally { ledger.close(); }
    }
    const reopened = await reopen();
    const listed = await reopened.actions.invoke(memoryActions.list, { scope: "personal" });
    const recalled = await reopened.actions.invoke(memoryActions.recall, { query: "回答要点列表", limit: 16 });
    const exported = await reopened.actions.invoke(memoryActions.export, { scope: "personal" });
    const history = await reopened.actions.invoke(memoryActions.history, { memory_id: remembered.memory_id })
      .then(value => ({ outcome: "read" as const, texts: value.revisions.map(item => item.text) }),
        error => ({ outcome: "rejected" as const, code: error && typeof error === "object" && "code" in error ? String(error.code) : String(error) }));
    const replay = await replaySource(reopened.adapter);
    const candidates = await reopened.adapter.memory!.withCaller({ ...sourceCaller, person: true }).candidates.list("user", LOCAL_PERSON_ACTOR_ID);
    const observed = {
      listed: listed.items.some(item => item.memory_id === remembered.memory_id || item.text === forgottenText),
      recalled: recalled.items.some(item => item.memory_id === remembered.memory_id || item.text === forgottenText),
      exported: exported.package.entries.some(item => item.text === forgottenText),
      history: history.outcome === "read" ? history.texts.includes(forgottenText) : history.code,
      source_retry: replay.outcome === "created" ? replay.outcome : replay.code,
      candidates: candidates.filter(item => item.text === forgottenText).length,
    };
    t.diagnostic(JSON.stringify({ scenario, restored: status, ...observed }));
    assert.ok(listed.items.some(item => item.memory_id === survivor.memory!.memory_id), "unrelated retained memory still works after restore");
    assert.equal(model.allRequests.length, modelCalls, "snapshot, forgetting, restore and source retry dispatch no additional model request");
    // Collect all public observations before failing, so one red assertion does not hide other revival paths.
    assert.deepEqual(observed, { listed: false, recalled: false, exported: false, history: "memory.not_found", source_retry: "MEMORY_NOT_ACCEPTED", candidates: 0 });
    if (scenario === "before-formation") {
      await close(); await restoreHomeSnapshot(options);
      const repeated = await reopen();
      assert.deepEqual(await replaySource(repeated.adapter), { outcome: "rejected", code: "MEMORY_NOT_ACCEPTED" }, "another restore retains the original owner and source barrier even without the forgotten canonical");
    }
  } finally { await close(); }
});

test("MEM-RESTORE-FORGET: a cleared SDK candidate cannot leave its supersedes projection body after restore", async t => {
  const f = await restoreFixture(t), appId = "io.molis.work";
  const caller = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui",
    person: true, current_scene: "coding", purpose: "management", operation_id });
  let modelCalls = 0;
  const open = async () => {
    const storageOwner = acquireStorageOwner(f.root);
    const adapter = await createPrologueNodeAdapter({ app: { appId, appVersion: "1.0.0" }, storageRoot: f.root, storageOwner,
      memory: currentMemoryOptions({ appId, scopesFor: () => [{ scope: "user", owner: LOCAL_PERSON_ACTOR_ID }],
        allowed: who => who.actor_id === LOCAL_PERSON_ACTOR_ID && who.person === true }),
      modelConfiguration: async () => { modelCalls++; throw new Error("This restore case cannot call a model"); } });
    const ledger = openMemoryLedger({ homeDirectory: f.home, storageOwner }), backend = prologueMemoryBackend(async () => adapter.memory!);
    const service = new MemoryService({ ledger, backend });
    let closed = false;
    return { ledger, service, raw: backend.withCaller(caller("inspect")), close: async () => { if (closed) return; closed = true; ledger.close(); await adapter.close(); storageOwner.release(); } };
  };
  let env = await open();
  try {
    const saved = await env.service.write(caller("save"), { scope: "personal", text: "Keep release summaries brief", kind: "preference" });
    const survivor = await env.service.write(caller("survivor"), { scope: "personal", text: "Explain the project background", kind: "preference" });
    const proposal = await env.service.propose(caller("suggest"), { scope: "personal", text: "Use a detailed release table", kind: "preference",
      basis: "inferred", why: "A correction awaiting approval", from: "gate", supersedes: saved.memory!.memory_id });
    const request = { action: "remove" as const, memory_id: saved.memory!.memory_id, expected_version: saved.memory!.version };
    const failure = t.mock.method(env.ledger, "dropCandidate", () => { throw new Error("ledger candidate cleanup interrupted"); });
    try { await assert.rejects(env.service.change(caller("forget"), request), error => {
      assert.equal((error as { details?: { forgetting?: string } }).details?.forgetting, "accepted"); return true;
    }); }
    finally { failure.mock.restore(); }
    assert.deepEqual(await env.raw.candidates.list("personal", LOCAL_PERSON_ACTOR_ID), [], "the real Node SDK purge completed");
    const orphan = env.ledger.candidates(LOCAL_PERSON_ACTOR_ID).find(note => note.candidate_id === proposal.candidate_id)!;
    assert.equal(orphan.supersedes, saved.memory!.memory_id); assert.equal(orphan.memory_id, null); assert.equal(orphan.text, proposal.text);
    await env.close();
    await createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot });
    const archive = homeStorageTree(f.snapshot);
    env = await open();
    await env.service.change(caller("forget"), request);
    assert.deepEqual(env.ledger.candidates(LOCAL_PERSON_ACTOR_ID), [], "the original operation repairs the projection before snapshot restoration");
    await env.close();
    assert.equal((await restoreHomeSnapshot({ homeDirectory: f.home, source: f.snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot })).status, "restored");
    env = await open();
    assert.deepEqual(env.ledger.candidates(LOCAL_PERSON_ACTOR_ID), [], "restoration must remove the persisted projection, including text and why, despite an already-cleared SDK candidate");
    assert.deepEqual(await env.service.candidates(caller("after")), []);
    assert.deepEqual((await env.service.list(caller("after"), { scope: "personal" })).items.map(item => item.memory_id), [survivor.memory!.memory_id]);
    assert.deepEqual(homeStorageTree(f.snapshot), archive);
    assert.equal(modelCalls, 0);
  } finally { await env.close(); }
});
