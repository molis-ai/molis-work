import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { inspectMolisWorkProjectCatalogSnapshot, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createHomeSnapshot, ensureSystemAgentService, MolisWorkLocalHost, restoreHomeSnapshot } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryItem } from "@molis-ai/molis-work-contracts/services/memory";
import type { AgentMemoryCaller, AgentMemorySourceRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { charactersActions } from "@molis-ai/molis-work-module-characters";
import { openTestHome, serveTestHost, type TestHostServer } from "./fixtures/test-home.js";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

for (const scenario of ["complete", "physical-pending", "ledger-pending", "sources"] as const)
test(`MEM-A3: ${scenario} public project deletion stays forgotten after restoring its older Home snapshot`, { timeout: 90_000 }, async t => {
  const env = await openTestHome(t), snapshot = join(tmpdir(), `molis-project-forget-snapshot-${randomUUID()}`);
  t.after(() => rm(snapshot, { recursive: true, force: true }));
  let host: MolisWorkLocalHost | undefined = env.host, web: TestHostServer | undefined = env;
  const close = async () => { await web?.close(); web = undefined; await host?.close(); host = undefined; };
  const reopen = async () => {
    await close();
    host = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null });
    web = await serveTestHost(null, { home: env.home, host });
  };
  const person = (projectId: string | null): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
    project_id: projectId, audience: "user", permissions: [...MEMORY_PERMISSIONS, "artifact:read", "artifact:write"] });
  try {
    const project = await web!.createProject("A3 删除恢复项目");
    const actions = () => bindActionClient(host!.actionClient(project.reference), () => person(project.project_id));
    const personal = () => bindActionClient(host!.homeActionClient(), () => person(null));
    const forgottenText = "这个项目的周报先写风险，再写本周决定";
    let saved: MemoryItem, sourceCaller: AgentMemoryCaller | undefined, sources: AgentMemorySourceRef[] = [], candidateId: string | undefined;
    if (scenario === "sources") {
      const write = MemoryService.prototype.write;
      t.mock.method(MemoryService.prototype, "write", async function(this: MemoryService, ...args: Parameters<MemoryService["write"]>) {
        const result = await write.apply(this, args);
        if (args[1].text === forgottenText) {
          sources = structuredClone([...(args[2]?.sources ?? [])]);
          candidateId = (await this.propose({ ...args[0], source_use: "explicit", operation_id: randomUUID() }, {
            scope: "project", text: "风险之后列出待确认事项", kind: "convention", basis: "inferred", why: "同一原件的待审项目建议", from: "gate",
          }, { gate: true, sources })).candidate_id;
        }
        return result;
      });
      await actions().invoke(memoryActions.savePrefs, { scope: "project", prefs: { learn_from_work: false } });
      let sentTool = false;
      await connectorAssistantModel(t, env.home, () => {
        if (!sentTool) { sentTool = true; return { name: "remember", input: { scope: "project", text: forgottenText, said: forgottenText, kind: "convention" } }; }
        return "已经记下。";
      }, undefined, host!.configurePersonalPlanning(env.home, withMolisWorkProjectCatalog));
      const sent = await web!.web.post<AssistantSendResult>(`/projects/${project.project_id}/api/assistant/send`, { text: forgottenText, request_id: randomUUID() });
      assert.ok(sent.run_id && sent.work.session_id);
      await untilSetup(async () => (await web!.web.get<AssistantWorkView>(`/projects/${project.project_id}/api/assistant/works/${sent.work.work_id}`)).work.state === "completed" ? true : undefined,
        "the actual project Assistant remember Run completes");
      saved = (await actions().invoke(memoryActions.list, { scope: "project" })).items.find(one => one.text === forgottenText)!;
      assert.equal(sources.length, 1); assert.ok(candidateId);
      const system = ensureSystemAgentService(host!, env.home); await system.ready;
      const run = await system.agentHost.adapter("prologue").read({ session_id: sent.work.session_id, run_id: sent.run_id });
      assert.ok(run.class_restrictions);
      sourceCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, consumer: "assistant", current_scene: "assistant",
        purpose: "management", source_use: "explicit", session_id: sent.work.session_id, class_restrictions: run.class_restrictions };
    } else saved = (await actions().invoke(memoryActions.write, { scope: "project", text: forgottenText, kind: "convention" })).memory!;
    let characterMemory: MemoryItem | undefined, characterCandidate: string | undefined;
    let characterSources: AgentMemorySourceRef[] = [];
    if (scenario === "physical-pending") {
      const draft = (await actions().invoke(charactersActions.create, {})).draft;
      const edited = (await actions().invoke(charactersActions.update, { id: draft.character_id, expected_revision: draft.revision,
        title: "审稿角色", instructions: "审稿时先核对证据。", host_tools: null, action_tools: null })).draft;
      const published = await actions().invoke(charactersActions.publish, { id: edited.character_id, expected_revision: edited.revision });
      const characterText = "审稿时先核对引文，再列出风险";
      const write = MemoryService.prototype.write;
      t.mock.method(MemoryService.prototype, "write", async function(this: MemoryService, ...args: Parameters<MemoryService["write"]>) {
        const result = await write.apply(this, args);
        if (args[1].scope === "character" && args[1].text === characterText) {
          characterMemory = result.memory ?? undefined;
          characterSources = structuredClone([...(args[2]?.sources ?? [])]);
          characterCandidate = (await this.propose({ ...args[0], source_use: "explicit", operation_id: randomUUID() }, {
            scope: "character", text: "审稿建议附上引文页码", kind: "convention", basis: "inferred", why: "原件关联的角色建议", from: "gate",
          }, { gate: true, sources: characterSources })).candidate_id;
        }
        return result;
      });
      await actions().invoke(memoryActions.savePrefs, { scope: "project", prefs: { learn_from_work: false } });
      let sentTool = false;
      await connectorAssistantModel(t, env.home, () => {
        if (!sentTool) { sentTool = true; return { name: "remember", input: { scope: "character", text: characterText, said: characterText, kind: "convention" } }; }
        return "已经记下。";
      }, undefined, host!.configurePersonalPlanning(env.home, withMolisWorkProjectCatalog));
      const sent = await web!.web.post<AssistantSendResult>(`/projects/${project.project_id}/api/assistant/send`, {
        text: characterText, request_id: randomUUID(), character: published.reference });
      await untilSetup(async () => (await web!.web.get<AssistantWorkView>(`/projects/${project.project_id}/api/assistant/works/${sent.work.work_id}`)).work.state === "completed" ? true : undefined,
        "the published Character's actual Assistant remember Run completes");
      assert.ok(characterMemory?.memory_id); assert.ok(characterCandidate); assert.equal(characterSources.length, 1);
      assert.equal((await actions().invoke(memoryActions.list, { scope: "character" })).items.some(one => one.memory_id === characterMemory!.memory_id), true);
      assert.equal((await actions().invoke(memoryActions.candidates, { scope: "all" })).candidates.some(one => one.candidate_id === characterCandidate), true);
    }
    const survivor = (await personal().invoke(memoryActions.write, { scope: "personal", text: "个人回复用简短段落", kind: "preference" })).memory!;
    assert.ok(saved?.memory_id);
    await close();
    assert.equal((await createHomeSnapshot({ homeDirectory: env.home, destination: snapshot })).status, "created");
    await reopen();
    const request = { delete_confirmed: true, idempotency_key: randomUUID() };
    let faultReached = false, restoreFault = () => {};
    if (scenario === "physical-pending") {
      const file = realpathSync(join(env.home, "agent-runtime", "records.sqlite")), native = new DatabaseSync(file, { readOnly: true });
      const selected = new Set<string>();
      try {
        for (const row of native.prepare("SELECT id,envelope FROM records WHERE kind=?").all("io.molis.work~memories")) {
          assert.ok(row.envelope instanceof Uint8Array);
          if (JSON.parse(Buffer.from(row.envelope).toString("utf8")).metadata?.rowId === saved.memory_id) selected.add(String(row.id));
        }
      } finally { native.close(); }
      assert.equal(selected.size, 1, "locate the selected current record's actual indexed address before the purge-path mutation");
      const prepare = DatabaseSync.prototype.prepare;
      const fault = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
        const statement = prepare.call(this, sql);
        if (sql === "INSERT INTO records(kind,id,envelope) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET envelope=excluded.envelope"
          && prepare.call(this, "PRAGMA database_list").all().find(row => row.name === "main")?.file === file) {
          const run = statement.run;
          t.mock.method(statement, "run", function(this: typeof statement, ...values: Parameters<typeof run>) {
            if (values[0] === "io.molis.work~memories" && typeof values[1] === "string" && selected.has(values[1])) {
              faultReached = true; throw Object.assign(new Error("A3 SDK physical indexed cleanup interrupted"), { code: "EIO" });
            }
            return run.apply(this, values);
          });
        }
        return statement;
      });
      restoreFault = () => fault.mock.restore();
    } else if (scenario === "ledger-pending") {
      const prepare = DatabaseSync.prototype.prepare;
      const fault = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
        const statement = prepare.call(this, sql);
        if (sql === "DELETE FROM memory_revisions WHERE memory_id=?") {
          const run = statement.run;
          t.mock.method(statement, "run", function(this: typeof statement, ...values: Parameters<typeof run>) {
            if (values[0] === saved.memory_id) { faultReached = true; throw new Error("A3 ledger cleanup interrupted"); }
            return run.apply(this, values);
          });
        }
        return statement;
      });
      restoreFault = () => fault.mock.restore();
    }
    const deletion = await web!.web.post<ProjectDeletionResult>(`/api/settings/projects/${project.project_id}/delete`, request);
    const pending = scenario === "physical-pending" || scenario === "ledger-pending";
    assert.equal(deletion.deletion.cleanup_state, pending ? "pending" : "complete", JSON.stringify(deletion));
    assert.equal(deletion.deletion.actor_id, LOCAL_PERSON_ACTOR_ID);
    if (pending) assert.equal(faultReached, true, "the actual selected cleanup boundary must fail");
    restoreFault();
    if (scenario !== "physical-pending") {
      const replay = await web!.web.post<ProjectDeletionResult>(`/api/settings/projects/${project.project_id}/delete`, request);
      assert.equal(replay.deletion.deletion_id, deletion.deletion.deletion_id);
      assert.equal(replay.deletion.cleanup_state, "complete", JSON.stringify(replay));
      assert.equal(replay.replayed, true);
    }
    await close();
    const decisions = JSON.parse(await readFile(join(env.home, "memory-forgetting-v2.json"), "utf8"));
    t.diagnostic(`public deletion ${deletion.deletion.cleanup_state}; receipt=${deletion.deletion.deletion_id}; independent decisions=${decisions.decisions.length}`);
    assert.equal((await restoreHomeSnapshot({ homeDirectory: env.home, source: snapshot,
      inspectCatalog: inspectMolisWorkProjectCatalogSnapshot })).status, "restored");
    await reopen();
    const listed = await actions().invoke(memoryActions.list, { scope: "project" });
    const exported = await actions().invoke(memoryActions.export, { scope: "project" });
    const recalled = await actions().invoke(memoryActions.recall, { scopes: ["project"], query: "周报 风险 决定" });
    assert.equal((await personal().invoke(memoryActions.list, { scope: "personal" })).items.some(one => one.memory_id === survivor.memory_id), true,
      "deleting the project must preserve personal memory");
    const observed = { listed: listed.items.some(one => one.memory_id === saved.memory_id),
      exported: JSON.stringify(exported.package).includes(forgottenText), recalled: recalled.items.some(one => one.memory_id === saved.memory_id) };
    t.diagnostic(`restored original project memory exposure=${JSON.stringify(observed)}`);
    assert.deepEqual(observed, { listed: false, exported: false, recalled: false },
      "a complete project-deletion receipt must retain its exact Memory forgetting across an older Home restore");
    if (characterMemory) {
      const characterObserved = {
        listed: (await actions().invoke(memoryActions.list, { scope: "character" })).items.some(one => one.memory_id === characterMemory.memory_id),
        page: (await actions().invoke(memoryActions.page, { scope: "character", character_id: characterMemory.character_id! })).items.some(one => one.memory_id === characterMemory.memory_id),
        candidate: (await actions().invoke(memoryActions.candidates, { scope: "all" })).candidates.some(one => one.candidate_id === characterCandidate),
      };
      t.diagnostic(`first-project cleanup failed; restored later Character exposure=${JSON.stringify(characterObserved)}`);
      assert.deepEqual(characterObserved, { listed: false, page: false, candidate: false },
        "the first project cleanup failure must not leave a later fixed Character unaccepted and revivable");
      assert.ok(decisions.decisions.some((one: { source_event_ids: string[] }) => characterSources.every(source => one.source_event_ids.includes(source.event_id))));
    }
    if (sourceCaller) {
      assert.deepEqual(await actions().invoke(memoryActions.candidates, { scope: "project" }), { candidates: [] });
      const system = ensureSystemAgentService(host!, env.home); await system.ready;
      const memory = system.agentHost.adapter("prologue").memory!.withCaller(sourceCaller);
      await assert.rejects(memory.candidates.propose({ scope: "project", owner: project.project_id, text: forgottenText,
        origin: "旧快照原件再次提炼", meta: { kind: "convention", basis: "explicit", classification: { scenes: ["assistant"], lifecycle: "long-term" } },
        sources, expected_version: 0, operation_id: randomUUID() }), { code: "MEMORY_NOT_ACCEPTED" });
      assert.ok(decisions.decisions.some((one: { source_event_ids: string[] }) => one.source_event_ids.includes(sources[0]!.event_id)));
    }
  } finally { await close(); }
});
