import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { acquireStorageOwner, inspectMemoryForgetting } from "@molis-ai/molis-work-storage";
import { readPrologueSessionTerminations, type SessionRestoreRef } from "@molis-ai/molis-work-service-agent-host";
import { restoreFixture } from "./home-restore.js";

const requireSdk = createRequire(new URL("../../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const app = { appId: "io.molis.work", appVersion: "1.0.0" };
const identity = { scope: "user", owner: "session-restore-person" } as const;
const context = { consumer: "test-person", currentScene: "coding", purpose: "management" } as const;
const actions = ["save", "propose", "accept", "read", "manage-read", "delete"];
export const sessionRestorePolicy = { version: 1 as const, preset: "manual" as const, taxonomy: { version: 1 as const,
  scenes: { values: [{ id: "coding", label: "Coding" }, { id: "common", label: "Common" }], default: ["coding"] },
  kinds: { values: [{ id: "convention", label: "Convention" }], default: "convention" },
  lifecycles: { values: [{ id: "session", label: "Session", retention: "session" as const },
    { id: "long-term", label: "Long term", retention: "persistent" as const }], default: "long-term" },
}, matrix: { default: { actions, formation: [], read: { modes: ["explicit", "task"] } } } };

/** All state comes from public SDK Session/Memory/Wait commands on this explicitly isolated Home. No Provider is installed. */
export async function sessionRestoreFixture(t: TestContext) {
  const f = await restoreFixture(t);
  let runtime: Awaited<ReturnType<typeof createRuntime>> | undefined, host: ReturnType<typeof createNodeHost> | undefined;
  let owner: ReturnType<typeof acquireStorageOwner> | undefined;
  const close = async () => { await runtime?.shutdown(); runtime = undefined; host = undefined; owner?.release(); owner = undefined; };
  t.after(close);
  const open = async () => {
    assert.equal(runtime, undefined);
    owner = acquireStorageOwner(f.root);
    try {
      host = createNodeHost({ storageRoot: f.root, memoryStorageFormat: "indexed-v1", exclusiveOwner: true });
      runtime = await createRuntime({ app, host, config: { memory: sessionRestorePolicy, waits: { autoContinue: false } }, memoryAuthority: {
        defaultContext: context,
        authorize: async (requests: readonly { appId: string; target: { scope: string; owner: string }; action: string }[]) => requests.every(request => request.appId === app.appId
          && request.target.scope === identity.scope && request.target.owner === identity.owner && actions.includes(request.action)),
        authorizeManagement: async (request: { appId: string; scope: string; owner: string }) => ({ allowed: request.appId === app.appId && request.scope === identity.scope && request.owner === identity.owner }),
      } });
      await runtime.memory.hydrate([identity]); await runtime.memoryCandidates.hydrate([identity]);
      return { runtime, host };
    } catch (error) { await close(); throw error; }
  };
  const create = async (label: string) => {
    assert.ok(runtime);
    const session = await runtime.sessions.create();
    const bound = runtime.bindMemory({ ...context, sessionRef: session.ref });
    const meta = { classification: { scenes: ["coding"], lifecycle: "session" } };
    const formal = await bound.memory.write({ ...identity, text: label + "_FORMAL_BODY", origin: "person", meta });
    const candidate = await bound.candidates.propose({ ...identity, text: label + "_CANDIDATE_BODY", origin: "person", meta }, { expectedVersion: 0, operationId: label + "-candidate" });
    return { ref: session.ref as SessionRestoreRef, session, formal, candidate, label };
  };
  const populate = async (one: Awaited<ReturnType<typeof create>>, other: Awaited<ReturnType<typeof create>>) => {
    assert.ok(runtime);
    const run = { kind: "run", id: "original-" + one.label, revision: 1 } as const;
    await one.session.adoptRun(run, [{ type: "prompt", role: "user", text: one.label + "_RUN_BODY", atMs: 1 }, { type: "completed" }]);
    await one.session.appendEntry({ key: "note", data: one.label + "_ENTRY_BODY" });
    await one.session.queueInput({ key: "person", text: one.label + "_INPUT_BODY" });
    const board = await runtime.boards.admit({ nodes: [
      { id: "waiter", title: "Waiter", dependsOn: [], onFailure: "block-for-human", assignee: one.ref },
      { id: "blocker", title: "Blocker", dependsOn: [], onFailure: "block-for-human", assignee: other.ref },
    ] });
    await runtime.boards.transition({ ref: board.ref, nodeId: "waiter", to: "running" });
    const armed = await runtime.waits.arm({ session: one.ref, by: "app", reason: one.label + "_WAIT_BODY", arrangement: {
      scope: { board: board.ref.id, node: "waiter", generation: 1 }, on: [{ kind: "node", board: board.ref.id, node: "blocker" }],
      mode: "all", until: "success", onFailure: "block", onEarlyContinue: "keep", deadlineMs: Date.now() + 1_200_000, autoContinue: false,
    } }, Date.now());
    await runtime.waits.cancel(armed.wait.ref.id, Date.now(), one.label + "_WAIT_NOTE");
    const runs = (await runtime.store.list({ kind: "runs" })).records.filter((row: { metadata: { sessionId?: string } }) => row.metadata.sessionId === one.ref.id);
    const wait = (await runtime.store.list({ kind: "waits" })).records.find((row: { metadata: { rowId?: string } }) => row.metadata.rowId === armed.wait.ref.id);
    assert.equal(runs.length, 1); assert.ok(wait?.hasSecureBody);
    const records = { session: await runtime.store.get({ kind: "sessions", id: one.ref.id }), entries: await runtime.store.get({ kind: "entries", id: one.ref.id }),
      inputs: await runtime.store.get({ kind: "inputs", id: one.ref.id }), run: runs[0], wait };
    assert.ok(records.entries?.hasSecureBody && records.inputs?.hasSecureBody && records.run?.hasSecureBody);
    const paths = Object.fromEntries(Object.entries(records).map(([name, row]) => [name, `records/io.molis.work~${row.kind}/${row.id}.json`]));
    return { run, wait: armed.wait.ref, records, paths };
  };
  const terminations = () => readPrologueSessionTerminations({ storageRoot: f.root, appVersion: app.appVersion, policy: sessionRestorePolicy,
    assertCurrent: () => {} });
  const bytes = (paths: Record<string, string>) => Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, readFileSync(join(f.root, path)).toString("base64")]));
  const ended = async (one: Awaited<ReturnType<typeof create>>) => {
    assert.ok(runtime);
    assert.equal(await runtime.sessions.open(one.ref), undefined);
    await assert.rejects(runtime.memory.get(one.formal.ref), { code: "MEMORY_SCOPE_DENIED" });
    await assert.rejects(runtime.memoryCandidates.get(one.candidate.ref), { code: "MEMORY_SCOPE_DENIED" });
  };
  const retained = async (one: Awaited<ReturnType<typeof create>>) => {
    assert.ok(runtime);
    assert.equal((await runtime.sessions.open(one.ref))?.state, "active");
    assert.equal((await runtime.memory.get(one.formal.ref))?.text, one.formal.text);
    assert.equal((await runtime.memoryCandidates.get(one.candidate.ref))?.text, one.candidate.text);
  };
  const noForgetting = () => assert.deepEqual(inspectMemoryForgetting(f.home), { format_version: 1, decisions: [] });
  return { ...f, open, close, create, populate, terminations, bytes, ended, retained, noForgetting };
}
