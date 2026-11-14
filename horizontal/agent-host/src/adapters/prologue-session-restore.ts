import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { MemoryAuthority, PurgePreview } from "@prologue/sdk";
import { openNodeRecoveryInspection, openNodeRecoveryMaintenance } from "@prologue/sdk/node";
import type { PrologueMemoryOptions } from "./prologue-memory-authority.js";
import { agentErrors } from "../errors.js";

export interface SessionRestoreRef { readonly kind: "session"; readonly id: string; readonly revision: 1 }
export interface SessionRestorePreview {
  readonly sessionRef: SessionRestoreRef;
  readonly runs: number; readonly resources: number; readonly destroysKey: boolean; readonly atVersion: number;
}
export interface SessionRestoreTermination {
  readonly preview: SessionRestorePreview;
  readonly phase: "cleaning" | "complete"; readonly version: number;
  readonly record_path: string;
}
interface SessionRestoreOptions {
  readonly storageRoot: string; readonly appVersion: string; readonly policy: PrologueMemoryOptions["policy"];
  readonly assertCurrent: () => void; readonly signal?: AbortSignal;
}
const invalid = () => agentErrors.capability_unavailable("会话终止恢复没有完整、当前的原主人事实");
const directory = "records/io.molis.work~sessions";
const recordPath = (ref: SessionRestoreRef) => `${directory}/${ref.id}.json`;
const previewOf = (value: PurgePreview): SessionRestorePreview => {
  if (value.sessionRef.revision !== 1) throw invalid();
  return Object.freeze({ ...structuredClone(value), sessionRef: Object.freeze({ kind: "session", id: value.sessionRef.id, revision: 1 }) });
};

/** Session authority comes from fixed original decisions; empty Memory scopes never grant item access. */
function recoveryOptions(input: SessionRestoreOptions) {
  const current = () => {
    input.signal?.throwIfAborted();
    const checked: unknown = input.assertCurrent();
    if (checked !== undefined) { void Promise.resolve(checked).catch(() => undefined); throw invalid(); }
  };
  const app = { appId: "io.molis.work", appVersion: input.appVersion };
  const context = { consumer: "ui", currentScene: "common", purpose: "management" as const };
  const authority: MemoryAuthority = {
    async authorize() { current(); return false; },
    assertCurrent() { current(); throw invalid(); },
    async authorizeManagement() { current(); return { allowed: false }; },
    async authorizeAdoption(request) { current(); return request.appId === app.appId
      && isDeepStrictEqual(request.context, context) && request.scopes.length === 0; },
  };
  current();
  return { storageRoot: input.storageRoot, memoryStorageFormat: "indexed-v1" as const, app, assertCurrent: current,
    memory: { policy: { ...input.policy, matrix: { default: { actions: [], formation: [] } } }, context, scopes: [], authority },
    ...(input.signal ? { signal: input.signal } : {}) };
}

/** No canonical Session inventory means no termination. Any actual SDK error remains an error. */
export async function readPrologueSessionTerminations(input: SessionRestoreOptions): Promise<readonly SessionRestoreTermination[]> {
  const options = recoveryOptions(input), path = join(input.storageRoot, directory), info = lstatSync(path, { throwIfNoEntry: false });
  if (!info) return [];
  if (!info.isDirectory() || info.isSymbolicLink()) throw invalid();
  const files = readdirSync(path);
  if (!files.length) return [];
  if (files.some(file => !file.endsWith(".json"))) throw invalid();
  const reader = await openNodeRecoveryInspection(options), results = new Map<string, SessionRestoreTermination>();
  try {
    const cursors = new Set<string>(); let cursor: string | undefined;
    do {
      options.assertCurrent();
      const page = await reader.sessionTerminations({ limit: 40, ...(cursor ? { cursor } : {}), ...(input.signal ? { signal: input.signal } : {}) });
      options.assertCurrent();
      for (const item of page.items) {
        const preview = previewOf(item.preview), ref = preview.sessionRef;
        if (results.has(ref.id)) throw invalid();
        results.set(ref.id, Object.freeze({ ...structuredClone(item), preview, record_path: recordPath(ref) }));
      }
      if (page.exhausted) break;
      if (!page.cursor || cursors.has(page.cursor)) throw invalid();
      cursors.add(page.cursor); cursor = page.cursor;
    } while (true);
    return Object.freeze([...results.values()]);
  } finally { await reader.close(); }
}

/** Only the original SDK Session owner cleans restored children, under target previews and the publisher barrier. */
export async function retainPrologueSessionTerminations(input: SessionRestoreOptions & {
  readonly terminations: readonly SessionRestoreTermination[]; readonly retainedRoots: readonly SessionRestoreRef[];
}): Promise<void> {
  const options = recoveryOptions(input), fixed = structuredClone(input.terminations), retained = structuredClone(input.retainedRoots);
  const ids = new Set(fixed.map(item => item.preview.sessionRef.id));
  if (ids.size !== fixed.length || retained.some(ref => !ids.has(ref.id))) throw invalid();
  if (!fixed.length) return;
  const target: SessionRestorePreview[] = [], reader = await openNodeRecoveryInspection(options);
  try {
    for (const source of fixed) {
      options.assertCurrent();
      const ref = source.preview.sessionRef, actual = await reader.inspectSession({ ref, ...(input.signal ? { signal: input.signal } : {}) });
      options.assertCurrent();
      if (actual.state === "absent") throw invalid();
      if (retained.some(one => one.id === ref.id) && (actual.state !== "purged"
        || !isDeepStrictEqual(actual.termination, { preview: source.preview, phase: source.phase, version: source.version }))) throw invalid();
      target.push(previewOf(actual.state === "present" ? actual.preview : actual.termination.preview));
    }
  } finally { await reader.close(); }
  const writer = await openNodeRecoveryMaintenance({ ...options, sessionPurges: target });
  try {
    for (const preview of target) {
      options.assertCurrent();
      const receipt = await writer.purgeSession({ ref: preview.sessionRef, ...(input.signal ? { signal: input.signal } : {}) });
      options.assertCurrent();
      if (receipt.state !== "purged" || !isDeepStrictEqual(receipt.preview, preview)) throw invalid();
    }
  } finally { await writer.close(); }
  // An inspection remembers observed root versions. Open a new owner after mutation, never reuse the old reader.
  const final = await openNodeRecoveryInspection(options);
  try {
    for (const preview of target) {
      options.assertCurrent();
      const actual = await final.inspectSession({ ref: preview.sessionRef, ...(input.signal ? { signal: input.signal } : {}) });
      if (actual.state !== "purged" || actual.termination.phase !== "complete" || !isDeepStrictEqual(actual.termination.preview, preview)) throw invalid();
      const cursors = new Set<string>(); let cursor: string | undefined;
      do {
        const page = await final.inspectSessionWaits({ ref: preview.sessionRef, preview, limit: 40,
          ...(cursor ? { cursor } : {}), ...(input.signal ? { signal: input.signal } : {}) });
        options.assertCurrent();
        if (page.waits.length) throw invalid();
        if (page.exhausted) break;
        if (!page.cursor || cursors.has(page.cursor)) throw invalid();
        cursors.add(page.cursor); cursor = page.cursor;
      } while (true);
    }
  } finally { await final.close(); }
}
