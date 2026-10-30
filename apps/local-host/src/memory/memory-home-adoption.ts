import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { isCompletePrefs, memoryErrors } from "@molis-ai/molis-work-service-memory";
import { openPrologueMemoryAdoption } from "@molis-ai/molis-work-service-agent-host";
import { LocalSqliteStorage, inspectMemoryLedgerAdoption, beginMemoryLedgerAdoption, completeMemoryLedgerAdoption,
  type MemoryLedgerAdoptionProfile, type MemoryLedgerAdoptionSnapshot } from "@molis-ai/molis-work-storage";
import { assertCurrentCatalog, assertOwnedCatalog } from "../catalog-schema.js";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";
import { PRODUCT_VERSION } from "../product-version.js";
import { memoryRuntimePolicy } from "./memory-runtime-policy.js";

export interface MemoryHomeAdoptionScope { readonly scope: "user" | "project" | "character"; readonly owner: string }
type ItemOutcome = "adopted" | "current" | "needs-reconcile" | "conflict" | "unknown";
type VerificationOutcome = "complete" | "incomplete" | "needs-reconcile" | "cancelled";

/** The Agent Host bridge holds the existing storage owner; normal Runtime assembly never supplies this capability. */
export interface MemoryHomeAdoptionBridge {
  adopt(input: MemoryHomeAdoptionScope & { kind: "memory" | "memory-candidate"; cursor?: string; signal?: AbortSignal }): Promise<{
    outcome: "completed" | "partial" | "cancelled"; items: readonly { outcome: ItemOutcome }[];
    issues: readonly { code: string }[]; exhausted: boolean; cursor?: string;
  }>;
  verify(input: { scopes: readonly MemoryHomeAdoptionScope[]; cursor?: string; signal?: AbortSignal }): Promise<{
    outcome: VerificationOutcome; exhausted: boolean; cursor?: string;
  }>;
  close(): Promise<void>;
}

export interface MemoryHomeAdoptionInput {
  /** Explicit stopped, backed-up Home. This function never defaults to the person's current Home. */
  homeDirectory: string;
  signal?: AbortSignal;
  /** Acquire the existing exclusive storage owner before returning; failure must release partially opened resources. */
  open?(input: { homeDirectory: string; scopes: readonly MemoryHomeAdoptionScope[];
    profiles: readonly MemoryLedgerAdoptionProfile[]; signal?: AbortSignal }): Promise<MemoryHomeAdoptionBridge>;
}

export interface MemoryHomeAdoptionResult {
  outcome: "completed" | "incomplete" | "cancelled";
  items: Record<ItemOutcome, number>;
  verification: VerificationOutcome | "not-run";
}

/** No defaults are inferred: ledger 3 already materialized its effective six switches; draft eight-field choices survive. */
function profilesForAdoption(snapshot: MemoryLedgerAdoptionSnapshot): MemoryLedgerAdoptionProfile[] {
  const profiles = snapshot.profiles.map(profile => {
    const value = profile.prefs;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw memoryErrors.invalid("旧记忆设置不完整，不能推断缺失的开关");
    const prefs = Object.keys(value).length === 6 ? { enabled: true, task_recall: true, ...value } : value;
    if (!isCompletePrefs(prefs)) throw memoryErrors.invalid("旧记忆设置不完整，不能推断缺失的开关");
    if (!profile.actor_id || !(profile.key === "personal" || profile.key === "project-default" || /^project:.+/.test(profile.key))) {
      throw memoryErrors.invalid("旧记忆设置身份无法确认");
    }
    return { ...profile, prefs };
  });
  if (!["personal", "project-default"].every(key => profiles.some(profile => profile.actor_id === LOCAL_PERSON_ACTOR_ID && profile.key === key))) {
    throw memoryErrors.invalid("旧 Home 缺少已采用的完整记忆设置");
  }
  return profiles;
}

/** Query the existing catalog owner without invoking Catalog startup, which must reject an adopting Home. */
function adoptionScopes(home: string, snapshot: MemoryLedgerAdoptionSnapshot): MemoryHomeAdoptionScope[] {
  const scopes: MemoryHomeAdoptionScope[] = [];
  const add = (scope: MemoryHomeAdoptionScope["scope"], owner: string) => {
    if (!owner) throw memoryErrors.invalid("记忆所属范围不完整");
    if (!scopes.some(item => item.scope === scope && item.owner === owner)) scopes.push({ scope, owner });
  };
  for (const profile of snapshot.profiles) add("user", profile.actor_id);
  const path = join(home, "projects", "catalog.db");
  if (existsSync(path)) {
    const storage = new LocalSqliteStorage(path, { readonly: true });
    try {
      assertOwnedCatalog(storage, path); assertCurrentCatalog(storage, path);
      const projects = new ProjectsModule({ db: storage.db, projects_directory: join(home, "projects"), plugins: { has: () => false, companions: () => [] } });
      for (const project of projects.query.listProjects()) add("project", project.project_id);
    } finally { storage.close(); }
  }
  for (const owner of snapshot.owners) if (owner.scope === "character") add("character", owner.owner);
  return scopes;
}

function nextCursor(page: { exhausted: boolean; cursor?: string }, previous: string | undefined): string | undefined {
  if (page.exhausted) return undefined;
  if (!page.cursor || page.cursor === previous) throw memoryErrors.unavailable("记忆采用分页未能继续，Home 仍保持阻断");
  return page.cursor;
}

async function convert(bridge: MemoryHomeAdoptionBridge, scopes: readonly MemoryHomeAdoptionScope[], result: MemoryHomeAdoptionResult, signal?: AbortSignal) {
  for (const scope of scopes) for (const kind of ["memory", "memory-candidate"] as const) {
    let cursor: string | undefined;
    do {
      signal?.throwIfAborted();
      const page = await bridge.adopt({ ...scope, kind, ...(cursor === undefined ? {} : { cursor }), ...(signal ? { signal } : {}) });
      for (const item of page.items) result.items[item.outcome]++;
      if (page.outcome === "cancelled") { result.outcome = "cancelled"; return; }
      if (page.outcome === "partial" || page.issues.length > 0
        || page.items.some(item => item.outcome !== "adopted" && item.outcome !== "current")) result.outcome = "incomplete";
      // An unknown commit or competing writer cannot be continued as if this command still exclusively owns the pass.
      if (result.items.unknown || result.items.conflict) return;
      cursor = nextCursor(page, cursor);
    } while (cursor !== undefined);
  }
  let cursor: string | undefined;
  result.verification = "complete";
  do {
    signal?.throwIfAborted();
    const page = await bridge.verify({ scopes, ...(cursor === undefined ? {} : { cursor }), ...(signal ? { signal } : {}) });
    if (page.outcome !== "complete") {
      result.outcome = page.outcome === "cancelled" ? "cancelled" : "incomplete";
      if (result.verification !== "needs-reconcile" || page.outcome === "cancelled") result.verification = page.outcome;
    }
    if (page.outcome === "cancelled") return;
    cursor = nextCursor(page, cursor);
  } while (cursor !== undefined);
}

/** Explicit offline adoption only. Backup/copy rehearsal belongs to the operator, never to ordinary Home startup. */
export async function adoptMemoryHome(input: MemoryHomeAdoptionInput): Promise<MemoryHomeAdoptionResult> {
  if (!input.homeDirectory || !isAbsolute(input.homeDirectory)) throw memoryErrors.invalid("记忆采用需要明确的 Home 绝对路径");
  input.signal?.throwIfAborted();
  const snapshot = inspectMemoryLedgerAdoption(input);
  const profiles = profilesForAdoption(snapshot), scopes = adoptionScopes(input.homeDirectory, snapshot);
  const bridge = await (input.open ? input.open({ homeDirectory: input.homeDirectory, scopes, profiles, ...(input.signal ? { signal: input.signal } : {}) })
    : openPrologueMemoryAdoption({ storageRoot: agentRuntimeDirectory(input.homeDirectory), appVersion: PRODUCT_VERSION,
      scopes, policy: memoryRuntimePolicy(() => undefined).policy, ...(input.signal ? { signal: input.signal } : {}) }));
  let adopting: MemoryLedgerAdoptionSnapshot;
  const result: MemoryHomeAdoptionResult = { outcome: "completed", items: { adopted: 0, current: 0, "needs-reconcile": 0, conflict: 0, unknown: 0 }, verification: "not-run" };
  try {
    input.signal?.throwIfAborted();
    adopting = beginMemoryLedgerAdoption({ homeDirectory: input.homeDirectory, snapshot });
    await convert(bridge, scopes, result, input.signal);
  } finally { await bridge.close(); }
  input.signal?.throwIfAborted();
  if (result.outcome === "completed" && result.verification === "complete") {
    completeMemoryLedgerAdoption({ homeDirectory: input.homeDirectory, snapshot: adopting!, profiles });
  }
  return result;
}
