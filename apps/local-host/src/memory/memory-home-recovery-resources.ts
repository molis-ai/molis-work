import { isDeepStrictEqual } from "node:util";
import type { AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { join } from "node:path";
import { memoryErrors } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedgerRecoveryInspection, inspectExistingSqlitePath, MEMORY_LEDGER_STORE, homeSqlitePath } from "@molis-ai/molis-work-storage";
import { openPrologueMemoryAdoption, openPrologueMemoryAdoptionInspection, type PrologueMemoryAdoptionInput,
  type PrologueMemoryAdoptionScope } from "@molis-ai/molis-work-service-agent-host";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";
import type { HomeInitializationFailure } from "../home-storage-lifetime.js";
import { PRODUCT_VERSION } from "../product-version.js";
import { openProjectDeletionCatalogObservation, type ProjectDeletionCatalogSnapshot } from "../project-deletion-recovery-target.js";
import { openAssistantMemoryRelations } from "../assistant/assistant-memory-relations.js";
import { collectMemoryOwnerCoverage } from "./memory-owner-coverage.js";
import { memoryRuntimePolicy } from "./memory-runtime-policy.js";
import { readRecoveryMemorySource, readRecoveryOwnerRelations } from "./memory-home-recovery-source.js";
import type { openMemoryHomeRecoveryFrame } from "./memory-home-recovery-frame.js";

export type MemoryHomeRecoveryFrame = Awaited<ReturnType<typeof openMemoryHomeRecoveryFrame>>;

/** Call only around original-owner operations. The public authority callback is normalized before it reaches them. */
export function retainRecoveryFailure(frame: MemoryHomeRecoveryFrame, error: unknown): never {
  const close = error instanceof Error ? Object.getOwnPropertyDescriptor(error, "close") : undefined;
  if (typeof close?.value === "function") throw frame.retainInitializationFailure(error as HomeInitializationFailure);
  throw error;
}

export function recoverySdkResources(frame: MemoryHomeRecoveryFrame, home: string, knownScopes: readonly PrologueMemoryAdoptionScope[],
  operationId: string, sessions: readonly AgentSessionRef[]) {
  if (sessions.some(session => session.runtime_id !== "prologue")) throw memoryErrors.conflict("原会话不属于当前运行时主人");
  const input: PrologueMemoryAdoptionInput = { storageRoot: agentRuntimeDirectory(home), appVersion: PRODUCT_VERSION,
    scopes: structuredClone(knownScopes), policy: memoryRuntimePolicy(() => undefined).policy, assertCurrent: frame.current,
    purgeInspection: { operationId, knownScopes: structuredClone(knownScopes), selections: sessions.map(session => ({ kind: "session",
      sessionRef: { kind: "session", id: session.session_id, revision: 1 }, operationId })) } };
  return {
    async inspect<T>(work: (reader: Awaited<ReturnType<typeof openPrologueMemoryAdoptionInspection>>) => Promise<T>): Promise<T> {
      let reader: Awaited<ReturnType<typeof openPrologueMemoryAdoptionInspection>>;
      try { reader = await openPrologueMemoryAdoptionInspection(input); }
      catch (error) { return retainRecoveryFailure(frame, error); }
      const close = frame.retain(reader);
      try { return await work(reader); } finally { await close(); }
    },
    async write<T>(selection: Pick<PrologueMemoryAdoptionInput, "memoryPurges" | "sessionPurges" | "projectSessionPurges">,
      work: (writer: Awaited<ReturnType<typeof openPrologueMemoryAdoption>>) => Promise<T>): Promise<T> {
      frame.current();
      let writer: Awaited<ReturnType<typeof openPrologueMemoryAdoption>>;
      try { writer = await openPrologueMemoryAdoption({ ...input, ...structuredClone(selection), storageOwner: frame.storageOwner }); }
      catch (error) { return retainRecoveryFailure(frame, error); }
      const close = frame.retain(writer);
      try { return await work(writer); } finally { await close(); }
    },
  };
}

/** Read owner-decoded facts only. Source and target share the same join, while only source contributes delete intent. */
export async function readRecoveryHomeFacts(frame: MemoryHomeRecoveryFrame, home: string, source: boolean,
  catalog: ProjectDeletionCatalogSnapshot) {
  const catalogPath = inspectExistingSqlitePath(join(home, "projects", "catalog.db"));
  const ledgerPath = inspectExistingSqlitePath(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  const current = () => { frame.current(); catalogPath.assertCurrent(); ledgerPath.assertCurrent(); };
  const ledger = (() => {
    try { return openMemoryLedgerRecoveryInspection({ homeDirectory: home, assertCurrent: current }); }
    catch (error) { return retainRecoveryFailure(frame, error); }
  })();
  const closeLedger = frame.retain(ledger);
  let observations: ReturnType<typeof readRecoveryMemorySource> = [], owners: ReturnType<typeof readRecoveryOwnerRelations>;
  try {
    if (source) { observations = readRecoveryMemorySource(ledger, catalog, current); ledger.rewind(); }
    owners = readRecoveryOwnerRelations(ledger, current);
  } finally { await closeLedger(); }
  const assistant = (() => {
    try { return openAssistantMemoryRelations({ homeDirectory: home, assertCurrent: current }); }
    catch (error) { return retainRecoveryFailure(frame, error); }
  })(), closeAssistant = frame.retain(assistant);
  try {
    const coverage = collectMemoryOwnerCoverage({ projects: catalog.projects, deletions: catalog.receipts,
      owners, assistant: assistant.read() });
    current(); return { coverage, observations };
  } finally { await closeAssistant(); }
}

export async function readRecoveryCatalog(frame: MemoryHomeRecoveryFrame, home: string) {
  let reader: ReturnType<typeof openProjectDeletionCatalogObservation>;
  try { reader = openProjectDeletionCatalogObservation({ homeDirectory: home, assertCurrent: frame.current }); }
  catch (error) { return retainRecoveryFailure(frame, error); }
  const close = frame.retain(reader);
  try { return reader.read(); } finally { await close(); }
}

export function recoveryScopes(source: readonly PrologueMemoryAdoptionScope[], target: readonly PrologueMemoryAdoptionScope[],
  previous?: readonly { scope: "personal" | "project" | "character"; owner: string }[]): PrologueMemoryAdoptionScope[] {
  const result = [...source, ...target].filter((scope, index, all) => !all.slice(0, index).some(other => isDeepStrictEqual(other, scope)))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (!previous) return result;
  const fixed = previous.map(scope => ({ ...scope, scope: scope.scope === "personal" ? "user" as const : scope.scope }));
  if (result.some(scope => !fixed.some(other => isDeepStrictEqual(other, scope)))) throw memoryErrors.conflict("原恢复范围之外出现新归属，不能扩大原决定");
  return fixed;
}
