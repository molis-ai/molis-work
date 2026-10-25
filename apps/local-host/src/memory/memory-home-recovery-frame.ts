import { isDeepStrictEqual } from "node:util";
import type { MemoryHomeRecoveryDecision } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "@molis-ai/molis-work-service-memory";
import { createMemoryLedgerHomeRecovery, type MemoryLedgerAdoptionProfile,
  type MemoryLedgerAdoptionSnapshot, type MemoryLedgerHomeRecovery, type MemoryLedgerHomeRecoveryChange,
  type MemoryLedgerHomeRecoveryExpected } from "@molis-ai/molis-work-storage";
import { closeHomeStorageLifetime, ensureHomeStorageOwner, retainHomeStorageResources,
  type HomeInitializationFailure } from "../home-storage-lifetime.js";
import { openProjectDeletionCatalogObservation, type ProjectDeletionCatalogSnapshot } from "../project-deletion-recovery-target.js";

type Resource = { close(): void | Promise<void> };
type CatalogObservation = ReturnType<typeof openProjectDeletionCatalogObservation>;
type Phase = "open" | "publishing" | "failed" | "closing" | "closed";

/** One maintenance interval owns the real resources and compares only facts returned by their original owners. */
export async function openMemoryHomeRecoveryFrame(input: {
  readonly homeDirectory: string;
  readonly operation_id: string;
  readonly assertCurrent: () => void;
  readonly signal?: AbortSignal;
}) {
  const { homeDirectory, operation_id, assertCurrent, signal } = input;
  const host = {}, storageOwner = ensureHomeStorageOwner(host, homeDirectory);
  const closing = { completed: new Set<string>(), started: false };
  let phase: Phase = "open", publisher: MemoryLedgerHomeRecovery | undefined;
  let expected: MemoryLedgerHomeRecoveryExpected, catalog: ProjectDeletionCatalogSnapshot;
  let observation: CatalogObservation | undefined, observationClosed = false;
  const refused = () => memoryErrors.conflict("恢复期间的原决定、当前事实或资源所有权已改变");
  const basic = () => {
    if (phase !== "open" && phase !== "publishing") throw refused();
    signal?.throwIfAborted(); ensureHomeStorageOwner(host, homeDirectory);
    const result: unknown = assertCurrent();
    if (result !== undefined) { void Promise.resolve(result).catch(() => undefined); throw refused(); }
    signal?.throwIfAborted(); ensureHomeStorageOwner(host, homeDirectory);
    if (phase !== "open" && phase !== "publishing") throw refused();
  };
  const retain = (resource: Resource): (() => Promise<void>) => {
    const remove = retainHomeStorageResources(host, async () => { await resource.close(); });
    return async () => { await resource.close(); remove(); };
  };
  const retainFailedInitialization = (error: unknown) => {
    const cleanup = error instanceof Error ? Object.getOwnPropertyDescriptor(error, "close") : undefined;
    if (typeof cleanup?.value === "function") retain(error as HomeInitializationFailure);
  };
  const currentCatalog = () => {
    basic();
    if (observation && !observationClosed) {
      if (!isDeepStrictEqual(observation.read(), catalog)) throw refused();
      return;
    }
    // Final publication still reads current committed Catalog facts after the long-lived reader is closed.
    let reader: CatalogObservation;
    try { reader = openProjectDeletionCatalogObservation({ homeDirectory, assertCurrent: basic, signal }); }
    catch (error) { retainFailedInitialization(error); throw error; }
    const remove = retainHomeStorageResources(host, async () => { reader.close(); });
    let failed: { error: unknown } | undefined;
    try { if (!isDeepStrictEqual(reader.read(), catalog)) throw refused(); }
    catch (error) { failed = { error }; throw error; }
    finally {
      try { reader.close(); remove(); }
      catch (error) {
        if (failed) throw new AggregateError([failed.error, error], "当前 Catalog 核对与原连接关闭失败", { cause: failed.error });
        throw error;
      }
    }
  };
  const current = () => {
    if (phase !== "open" || closing.started) throw refused();
    basic();
    if (!publisher || !isDeepStrictEqual(publisher.read(), expected)) throw refused();
    basic();
    if (phase !== "open" || closing.started) throw refused();
  };
  const close = (): Promise<void> => {
    phase = "closing";
    return closeHomeStorageLifetime(host, closing, [], async () => { await publisher?.close(); })
      .then(() => { phase = "closed"; });
  };
  const failure = (reason: unknown): HomeInitializationFailure => {
    phase = "failed";
    const error: Error = new AggregateError([reason], "恢复尚未完成；可明确关闭原资源，再用同一操作号核对", { cause: reason });
    const code = reason instanceof Error ? Object.getOwnPropertyDescriptor(reason, "code") : undefined;
    if (typeof code?.value === "string") Object.defineProperty(error, "code", { value: code.value });
    Object.defineProperty(error, "close", { value: close });
    return error as HomeInitializationFailure;
  };
  const parentCommitted = (change: MemoryLedgerHomeRecoveryChange) => {
    if (!isDeepStrictEqual(change.before, expected)) throw refused();
    expected = structuredClone(change.after);
  };
  try {
    basic();
    observation = openProjectDeletionCatalogObservation({ homeDirectory, assertCurrent: basic, signal });
    const reader = observation;
    retainHomeStorageResources(host, async () => { reader.close(); observationClosed = true; });
    catalog = reader.read();
    publisher = createMemoryLedgerHomeRecovery({ homeDirectory, operation_id, assertCurrent: currentCatalog, signal });
    expected = publisher.read();
    current();
  } catch (error) { retainFailedInitialization(error); throw failure(error); }
  const parent = publisher;
  return {
    storageOwner, current, close, failure,
    expected: () => structuredClone(expected),
    catalog: () => structuredClone(catalog),
    projectDatabase(projectId: string) {
      current();
      if (!observation || observationClosed) throw refused();
      const path = observation.projectDatabase(projectId);
      return { path, assertCurrent() {
        current();
        if (!observation || observationClosed || observation.projectDatabase(projectId) !== path) throw refused();
      } };
    },
    retain(resource: Resource) { const dispose = retain(resource); current(); return dispose; },
    /** Call only for an actual initializer failure from a known owner, never an arbitrary caller callback. */
    retainInitializationFailure(resource: HomeInitializationFailure) { retain(resource); return failure(resource); },
    beginAdoption() {
      current();
      parentCommitted(parent.adopt(expected));
      current();
    },
    beginDecision(decision: Omit<MemoryHomeRecoveryDecision, "phase">) {
      current();
      parentCommitted(parent.begin({ expected, decision }));
      current();
    },
    ledgerCommitted(change: { before: MemoryLedgerAdoptionSnapshot; after: MemoryLedgerAdoptionSnapshot }) {
      if (!isDeepStrictEqual(change.before, expected.snapshot)) throw refused();
      expected = { ...expected, snapshot: structuredClone(change.after) };
      current();
    },
    catalogCommitted(change: { before: ProjectDeletionCatalogSnapshot; after: ProjectDeletionCatalogSnapshot }) {
      if (!isDeepStrictEqual(change.before, catalog)) throw refused();
      catalog = structuredClone(change.after);
      current();
    },
    async publish(profiles: readonly MemoryLedgerAdoptionProfile[]) {
      const fixed = structuredClone(profiles);
      current(); phase = "publishing";
      try {
        await closeHomeStorageLifetime(host, closing, [], async () => {
          basic();
          parentCommitted(parent.complete({ expected, profiles: fixed }));
          await parent.close();
        });
        phase = "closed";
      } catch (error) { throw failure(error); }
    },
  };
}
