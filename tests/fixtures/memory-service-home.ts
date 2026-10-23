import { mkdtemp, rm } from "node:fs/promises";
import type { TestContext } from "node:test";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrologueNodeAdapter, openPrologueMemoryAdoption } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, type MemoryBackendPort, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryRuntimePolicy, prologueMemoryBackend, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";

/** Production policy and persistent owners; only the declared scratch projects exist. No classifier defaults. */
export async function memoryServiceHome(t: Pick<TestContext, "after" | "mock">, options: {
  projects: readonly string[]; now?: () => Date; projectTitle?: (id: string) => Promise<string>;
}) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-service-"));
  const projects = new Set(options.projects);
  // NodeHost.readClock uses Date.now; the Service and its real storage owner must share this test's clock.
  if (options.now) t.mock.method(Date, "now", () => options.now!().getTime());
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  let ledger: MemoryLedgerPort | undefined, service: MemoryService, alive = false;
  const person: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: options.projects[0] ?? null, consumer: "ui", person: true };
  const owner: MemoryRuntimePolicyOwner = {
    alive: () => alive, prefsFor: (scope, id) => service.prefsFor(LOCAL_PERSON_ACTOR_ID, scope, id),
    owners: id => ledger!.owners(id), candidateOwners: id => ledger!.candidateOwners(id),
    projectExists: async id => projects.has(id), deletingProject: () => undefined,
  };
  const backend = () => prologueMemoryBackend(async () => adapter!.memory!);
  const open = async () => {
    ledger = openMemoryLedger({ homeDirectory: home });
    adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
      memory: memoryRuntimePolicy(() => owner), modelConfiguration: async () => { throw new Error("Memory fixture does not call a model"); } });
    service = new MemoryService({ backend: backend(), ledger, timeZone: "Asia/Shanghai",
      ...(options.now ? { now: options.now } : {}), ...(options.projectTitle ? { projectTitle: options.projectTitle } : {}) });
    alive = true;
    return service;
  };
  const close = async () => { alive = false; await adapter?.close(); adapter = undefined; ledger?.close(); ledger = undefined; };
  t.after(async () => { await close(); await rm(home, { recursive: true, force: true }); });
  // Historical rows use the SDK's public storage owner, then explicit offline adoption; no online unclassified-write exception.
  const seedUnclassified = async (scope: "user" | "project", ownerId: string, id: string, text: string) => {
    await close();
    const requireSdk = createRequire(new URL("../../horizontal/agent-host/package.json", import.meta.url));
    const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
    const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
    const runtime = await createRuntime({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, host: createNodeHost({ storageRoot: join(home, "sdk") }) });
    const storageOwner = `${scope}-${encodeURIComponent(ownerId).replaceAll("%", "_")}`;
    try {
      await runtime.store.commit({ kind: "memories", id: `owner.${storageOwner}.${id}.v1`, expectedVersion: 0,
        metadata: { scope: `owner.${storageOwner}`, rowId: id, version: 1, state: "active", shape: 2 },
        secureBody: new TextEncoder().encode(JSON.stringify({ id, scope, owner: ownerId, version: 1, text, origin: "别处写入", tags: [],
          tombstoned: false, meta: {}, createdAtMs: 100, updatedAtMs: 100 })) });
    } finally { await runtime.shutdown(); }
    const maintenance = await openPrologueMemoryAdoption({ appVersion: "1.0.0", storageRoot: join(home, "sdk"),
      scopes: [{ scope, owner: ownerId }], policy: memoryRuntimePolicy(() => owner).policy });
    try {
      const page = await maintenance.adopt({ kind: "memory", scope, owner: ownerId });
      if (page.items.some(item => item.outcome === "needs-reconcile") || page.issues.length) throw new Error("Historical memory could not be adopted");
    } finally { await maintenance.close(); }
    return open();
  };
  return { home, open, close, seedUnclassified, ledger: () => ledger!, memory: () => adapter!.memory!, raw: (caller = person) => backend().withCaller(caller) };
}

/** Fault injection wraps the same bound backend the Service actually uses. It cannot replace caller authority. */
export function observeMemoryBackend(backend: MemoryBackendPort, observe: (bound: MemoryBackendPort) => MemoryBackendPort): MemoryBackendPort {
  return { ...observe(backend), withCaller: caller => observeMemoryBackend(backend.withCaller(caller), observe) };
}
