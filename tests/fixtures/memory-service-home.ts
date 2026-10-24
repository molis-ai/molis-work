import { mkdtemp, rm } from "node:fs/promises";
import type { TestContext } from "node:test";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { createPrologueNodeAdapter, openPrologueMemoryAdoption, type PrologueNodeAdapterOptions, type PrologueRunRef } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, type MemoryBackendPort, type MemoryCaller, type MemoryProposal } from "@molis-ai/molis-work-service-memory";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryCaller, AgentMemorySourceSnapshot, AgentMemorySourceRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryExtractor, memoryRuntimePolicy, prologueMemoryBackend, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";

type Generation = NonNullable<ReturnType<NonNullable<Parameters<typeof memoryExtractor>[1]>>>;
/** A bounded model response, passed through the production registered prompt, schema and extractor before the real SDK. */
export function scriptedMemoryExtraction() {
  let proposals: readonly (MemoryProposal & { replaces_text?: string })[] = [];
  const generate: Generation = async (prompt, options) => {
    await options?.beforeDispatch?.();
    const data = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2)) as {
      sources: Array<{ id: string; text: string }>; existing: Array<{ id: string; text: string }>;
      destinations: Array<{ scope: string; replacement?: string; task?: string; slots: Record<string, string[]> }>;
    };
    const used = new Set<string>();
    const drafts = proposals.map(proposal => {
      const scope = proposal.scope === "personal" ? "user" : proposal.scope;
      const targets = proposal.supersedes ? data.existing.filter(entry => proposal.replaces_text === undefined || entry.text === proposal.replaces_text) : [];
      if (proposal.supersedes && targets.length !== 1) throw new Error("Scripted correction needs one unambiguous existing text");
      const group = data.destinations.find(destination => destination.scope === scope && destination.replacement === targets[0]?.id
        && destination.slots[proposal.kind]?.some(id => !used.has(id)));
      const slot = group?.slots[proposal.kind]?.find(id => !used.has(id));
      if (!slot) throw new Error("Scripted draft has no authorized destination");
      used.add(slot);
      const quoted = data.sources.filter(source => source.text.includes(proposal.quote));
      return { slot_id: slot, text: proposal.text, suggested_basis: proposal.basis,
        ...(proposal.applies_when ? { applies_when: { task: proposal.applies_when } } : {}),
        evidence: (quoted.length ? quoted : data.sources.slice(0, 1)).map(source => ({ source_id: source.id, quote: proposal.quote })) };
    });
    return { value: "{}", structured: { drafts }, run_ref: { kind: "run", id: "memory-extractor-fixture", revision: 1 } as PrologueRunRef,
      state: "completed", configuredModel: "bounded-fixture", reportedModels: [], usage: [], validateResult() {} };
  };
  return { generate, set(next: typeof proposals) { proposals = next; } };
}

/** Explicit original-input fixture. A request can resolve only declared identities in the person's allowed scopes. */
export function originalMemorySources(projects: readonly string[], now: () => number = Date.now) {
  const entries = new Map<string, AgentMemorySourceSnapshot>();
  const allowed = (caller: AgentMemoryCaller, request: AgentMemorySourceRequest) => caller.actor_id === LOCAL_PERSON_ACTOR_ID
    && (request.target.scope === "user" && request.target.owner === LOCAL_PERSON_ACTOR_ID
      || request.target.scope === "project" && caller.project_id === request.target.owner && projects.includes(request.target.owner));
  const port: NonNullable<NonNullable<PrologueNodeAdapterOptions["memory"]>["sources"]> = {
    async resolve(caller, request) { return allowed(caller, request) ? request.refs.flatMap(ref => {
      const source = entries.get(ref.event_id); return source?.version === ref.version ? [source] : [];
    }) : []; },
    async check(caller, request) { return allowed(caller, request) && request.identities.every(identity => {
      const source = entries.get(identity.event_id); if (!source) return false;
      const { text: _text, ...current } = source; return isDeepStrictEqual(current, identity);
    }); },
  };
  return { port, entries, add(event_id: string, text: string) {
    const source: AgentMemorySourceSnapshot = { event_id, version: "1", text, speaker: { kind: "person", id: LOCAL_PERSON_ACTOR_ID },
      derivation: "original", occurred_at_ms: now() };
    entries.set(event_id, source); return source;
  } };
}

/** Production policy and persistent owners; only the declared scratch projects exist. No classifier defaults. */
export async function memoryServiceHome(t: Pick<TestContext, "after" | "mock">, options: {
  projects: readonly string[]; now?: () => Date; projectTitle?: (id: string) => Promise<string>;
  sources?: NonNullable<PrologueNodeAdapterOptions["memory"]>["sources"];
  extractor?: NonNullable<PrologueNodeAdapterOptions["memory"]>["extractor"];
  generate?: Generation;
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
      memory: { ...memoryRuntimePolicy(() => owner, options.extractor ?? (options.generate ? memoryExtractor(home, () => options.generate) : undefined)), ...(options.sources ? { sources: options.sources } : {}),
        promotion: { policy: "memory.write-gate", version: 3, decide: (caller, request) => service.promotion.decide(caller, request),
          undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request), record: (caller, request) => service.promotion.undo.record(caller, request) } } }, modelConfiguration: async () => { throw new Error("Memory fixture does not call a model"); } });
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
  return { home, open, close, seedUnclassified, ledger: () => ledger!, adapter: () => adapter!, memory: () => adapter!.memory!, raw: (caller = person) => backend().withCaller(caller) };
}

/** Fault injection wraps the same bound backend the Service actually uses. It cannot replace caller authority. */
export function observeMemoryBackend(backend: MemoryBackendPort, observe: (bound: MemoryBackendPort) => MemoryBackendPort): MemoryBackendPort {
  return { ...observe(backend), withCaller: caller => observeMemoryBackend(backend.withCaller(caller), observe) };
}
