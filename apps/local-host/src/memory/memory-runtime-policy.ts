import type { PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import type { AgentMemoryCaller, AgentMemoryExtractor } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { MEMORY_CONSUMERS, type MemoryPrefs, type MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { CANDIDATE_TTL_MS, memoryErrors, characterOwner, consumerAccess, memoryClassReadAllowed, memoryClassReadPossible, memoryClassFormationAllowed } from "@molis-ai/molis-work-service-memory";

type Options = NonNullable<PrologueNodeAdapterOptions["memory"]>;
type Request = Parameters<Options["authorize"]>[1][number];
type Target = Pick<Request["target"], "scope" | "owner" | "namespace" | "kind" | "classification">;

/** Current facts of the already-open Memory owner. No second ledger or cached grant. */
export interface MemoryRuntimePolicyOwner {
  alive(): boolean;
  prefsFor(scope: MemoryScope, projectId: string | null): MemoryPrefs;
  owners(projectId: string): readonly { scope: MemoryScope; owner: string; subject: string | null }[];
  candidateOwners(projectId: string): readonly { scope: MemoryScope; owner: string }[];
  projectExists(projectId: string): Promise<boolean | null>;
  /** Present only during the trusted project-deletion hook, never from an Action's input. */
  deletingProject(): string | undefined;
  deletingScope?(scope: string, owner: string): boolean;
  deletingCoverage?(operationId: string, scopes: readonly { scope: string; owner: string }[]): boolean;
  deletingPersonal?(target: Request["target"]): boolean;
  deletingSessionPurge?(sessionId: string, requests: readonly Request[], call: Parameters<NonNullable<Options["allowsSessionPurge"]>>[3]): boolean;
  deletionPending?(projectId: string | null, sessionId?: string): boolean;
}

const CODING = "io.molis.work.coding";
const SCENES = ["coding", "assistant", "common"] as const;
const ACTIONS = ["save", "propose", "accept", "promote", "read", "manage-read", "delete"] as const;

/** The App's declared classification, intersected below with the person's live scope switches. */
const POLICY: Options["policy"] = {
  version: 2, preset: "manual",
  taxonomy: { version: 1,
    scenes: { values: SCENES.map(id => ({ id, label: id })) },
    kinds: { values: ["preference", "convention", "fact", "experience", "habit", "project-decision"].map(id => ({ id, label: id })) },
    lifecycles: { values: [{ id: "long-term", label: "长期", retention: "persistent" },
      { id: "short-term", label: "短期", retention: "expiry" }, { id: "session", label: "会话", retention: "session" }] },
  },
  matrix: { default: { actions: ["manage-read", "delete"], formation: [] },
    rows: SCENES.map(scene => ({ id: scene, selector: { scenes: [scene], consumers: [...MEMORY_CONSUMERS] },
      actions: ACTIONS, formation: [], read: { modes: ["explicit", "task", "resident"], unclassifiedModes: ["explicit", "task"], visible: { scenes: scene === "common" ? ["common"] : [scene, "common"] } },
      write: { approval: "person-or-policy", classes: { scenes: [...SCENES] } },
    })),
  },
};

/** App restrictions never replace the original scope, plugin or source grants. */
function classAllowed(caller: AgentMemoryCaller, prefs: MemoryPrefs, target: Target, mode: "explicit" | "task" | "resident" | "form"): boolean {
  if (caller.purpose === "task" && caller.session_id && !caller.class_restrictions) return false;
  const context = { consumer: caller.consumer, current_scene: caller.current_scene! };
  const frozen = caller.class_restrictions?.[target.scope === "user" ? "personal" : "project"];
  const permits = (rows: MemoryPrefs["class_restrictions"] | NonNullable<typeof frozen>) => mode === "form"
    ? memoryClassFormationAllowed(rows, context, target) : memoryClassReadAllowed(rows, context, target, mode);
  return permits(prefs.class_restrictions) && (!frozen || permits(frozen));
}

/** SDK authority sees only trusted caller bindings and current owner facts, never model-supplied permissions. */
export function memoryRuntimePolicy(ownerFor: () => MemoryRuntimePolicyOwner | undefined, extractor?: AgentMemoryExtractor): Options {
  const callerAllowed = (caller: AgentMemoryCaller) => caller.actor_id === LOCAL_PERSON_ACTOR_ID
    && MEMORY_CONSUMERS.some(value => value === caller.consumer) && SCENES.some(scene => scene === caller.current_scene)
    && (caller.consumer !== "plugin" || !!caller.plugin_id)
    && (caller.current_scene !== "coding" || caller.plugin_id === CODING || caller.person === true)
    && (caller.current_scene !== "assistant" || caller.consumer === "assistant" || caller.person === true);

  const currentFacts = (caller: AgentMemoryCaller) => {
    const owner = ownerFor();
    if (!owner?.alive() || !callerAllowed(caller)) return undefined;
    const deletion = caller.person === true && caller.purpose === "management" && caller.consumer === "ui"
      && caller.project_id !== null && owner.deletingProject() === caller.project_id;
    return { owner, deletion };
  };
  const current = async (caller: AgentMemoryCaller) => {
    const state = currentFacts(caller);
    if (!state || caller.project_id && !state.deletion && await state.owner.projectExists(caller.project_id) !== true) return undefined;
    return state.owner.alive() ? state : undefined;
  };
  const scoped = (caller: AgentMemoryCaller, target: Pick<Target, "scope" | "owner">, state: { owner: MemoryRuntimePolicyOwner; deletion: boolean }, mutation = false) => {
    if (target.scope === "user") return target.owner === caller.actor_id;
    if (!caller.project_id) return false;
    if (target.scope === "project") return target.owner === caller.project_id;
    if (target.scope !== "character") return false;
    const recorded = state.owner.owners(caller.project_id).find(row => row.scope === "character" && row.owner === target.owner);
    if (state.deletion) return state.owner.deletingScope?.("character", target.owner) || !!recorded || state.owner.candidateOwners(caller.project_id).some(row => row.scope === "character" && row.owner === target.owner);
    if (mutation && (!recorded?.subject || target.owner !== characterOwner(caller.project_id, recorded.subject))) return false;
    if (caller.person === true) return !!recorded;
    return !!caller.character_id && (!recorded || recorded.subject === caller.character_id)
      && target.owner === characterOwner(caller.project_id, caller.character_id);
  };
  const namespaceAllowed = (caller: AgentMemoryCaller, namespace?: string | null) => !namespace || caller.person === true || namespace === caller.plugin_id;
  const preferences = (caller: AgentMemoryCaller, target: Target, owner: MemoryRuntimePolicyOwner, readMode: "explicit" | "task") => {
    const prefs = owner.prefsFor(target.scope === "user" ? "personal" : "project", target.scope === "user" ? null : caller.project_id);
    const consumer = MEMORY_CONSUMERS.find(value => value === caller.consumer)!;
    const access = consumerAccess(prefs, consumer, caller.plugin_id, readMode);
    const plugin = caller.plugin_id ? consumerAccess(prefs, "plugin", caller.plugin_id, readMode) : null;
    return { prefs, allowed: access.allowed && (!plugin || plugin.allowed)
      && (!target.kind || (!access.kinds || access.kinds.some(kind => kind === target.kind)) && (!plugin?.kinds || plugin.kinds.some(kind => kind === target.kind))) };
  };
  const permitted = (caller: AgentMemoryCaller, request: Request, state: { owner: MemoryRuntimePolicyOwner; deletion: boolean }, operation?: "disable") => {
    if (request.appId !== "io.molis.work" || !scoped(caller, request.target, state, request.action !== "read" && request.action !== "manage-read") || !namespaceAllowed(caller, request.target.namespace)) return false;
    if (state.deletion) return (request.action === "manage-read" || request.action === "delete")
      && (request.target.scope !== "user" || state.owner.deletingPersonal?.(request.target) === true);
    // This synchronous predicate is repeated at the SDK's real commit, including already-waiting formation/accept.
    if (state.owner.deletionPending?.(caller.project_id, caller.session_id)
      || state.owner.deletionPending?.(caller.project_id, request.target.sessionRef?.id)
      || request.before && state.owner.deletionPending?.(caller.project_id, request.before.sessionRef?.id)) return false;
    if (request.action === "manage-read" || request.action === "delete") {
      if (caller.person === true && caller.purpose === "management") return true;
      if (request.action === "delete") return false;
    }
    const { prefs, allowed } = preferences(caller, request.target, state.owner,
      request.readMode === "explicit" && (caller.person === true || caller.run_explicit === true) ? "explicit" : "task");
    const readMode = request.readMode === "explicit" && (caller.person === true || caller.run_explicit === true) ? "explicit" : request.readMode === "resident" ? "resident" : "task";
    const mayForm = (target: Target) => classAllowed(caller, preferences(caller, target, state.owner, "explicit").prefs, target, "form");
    const formation = () => mayForm(request.target) && (!request.before || mayForm(request.before));
    if (request.action === "manage-read" && request.target.ref.kind === "memory-candidate"
      && (caller.source_use === "learning" || caller.source_use === "explicit") && caller.purpose === "management") {
      return prefs.enabled && prefs.form && (caller.source_use !== "learning" || prefs.learn_from_work)
        && (!caller.session_id || !!caller.class_restrictions)
        && preferences(caller, request.target, state.owner, "explicit").allowed && formation();
    }
    if (request.action === "read" || request.action === "manage-read") return allowed && classAllowed(caller, prefs, request.target, readMode);
    if (!prefs.enabled) return false;
    if (request.action === "promote") return prefs.form && prefs.learn_from_work && prefs.auto
      && preferences(caller, request.target, state.owner, "explicit").allowed && formation();
    if (caller.person === true && caller.purpose === "management") return true;
    if (operation === "disable" && request.action === "save" && request.target.disabled === true) {
      const readable = (target: Target) => {
        const access = preferences(caller, target, state.owner, "task");
        return access.allowed && classAllowed(caller, access.prefs, target, "task");
      };
      return (caller.consumer !== "plugin" || request.target.namespace === caller.plugin_id)
        && readable(request.target) && (!request.before || readable(request.before));
    }
    if (!prefs.form || request.action === "accept" || !preferences(caller, request.target, state.owner, "explicit").allowed) return false;
    // Plugins write only their own namespace; shared explicit statements are admitted by MemoryService's source gate.
    const pluginSave = request.action === "save" && caller.consumer === "plugin" && request.target.namespace === caller.plugin_id
      && request.target.source === "plugin" && request.target.approvedBy?.by === "policy" && request.target.approvedBy.policy === `plugin:${caller.plugin_id}`;
    return (caller.consumer !== "plugin" || request.target.namespace === caller.plugin_id) && (pluginSave || formation());
  };
  // SDK's joint accept batch is the new formal commit. Committed accept reconciliation carries only the candidate.
  // These createdAtMs facts come from canonical SDK targets, never a caller field or App candidate projection.
  const candidateAcceptanceCurrent = (requests: readonly Request[]) => !requests.some(request => request.action === "accept" && request.target.ref.kind === "memory")
    || requests.filter(request => request.action === "accept" && request.target.ref.kind === "memory-candidate")
      .every(request => request.target.createdAtMs + CANDIDATE_TTL_MS > Date.now());
  const requestsAllowed = (caller: AgentMemoryCaller, requests: readonly Request[], state: ReturnType<typeof currentFacts>, operation?: "disable") =>
    !!state && candidateAcceptanceCurrent(requests) && requests.every(request => permitted(caller, request, state, operation)
      && (!request.before || scoped(caller, request.before, state, request.action !== "read" && request.action !== "manage-read") && namespaceAllowed(caller, request.before.namespace)));
  return {
    policy: extractor ? { ...POLICY, formation: { maxSlots: 144 },
      // 120 fixed replacement metas can each occupy the SDK's 4 KiB metadata budget, plus 24 creation slots and identities.
      limits: { maxContentChars: 655360, maxContentNodes: 16384 }, matrix: { ...POLICY.matrix,
      rows: POLICY.matrix!.rows!.map(row => ({ ...row, formation: ["run-end"] })) } } : POLICY,
    ...(extractor ? { extractor } : {}),
    async authorize(caller, requests, operation) {
      return requestsAllowed(caller, requests, await current(caller), operation);
    },
    assertCurrent: (caller, requests, operation) => requestsAllowed(caller, requests, currentFacts(caller), operation),
    async authorizePurgeInspection(caller, request) {
      const state = currentFacts(caller);
      return !!state?.deletion && request.appId === "io.molis.work" && request.purpose === "owner-coverage"
        && state.owner.deletingCoverage?.(request.operationId, request.knownScopes) === true;
    },
    assertPurgeInspectionCurrent(caller, request) {
      const state = currentFacts(caller);
      if (!state?.deletion || request.appId !== "io.molis.work" || request.purpose !== "owner-coverage"
        || state.owner.deletingCoverage?.(request.operationId, request.knownScopes) !== true)
        throw memoryErrors.forbidden("原删除覆盖检查已失效");
    },
    allowsSessionPurge(caller, requests, sessionId, call) {
      const state = currentFacts(caller);
      return !!state?.deletion && requestsAllowed(caller, requests, state)
        && state.owner.deletingSessionPurge?.(sessionId, requests, call) === true;
    },
    async authorizeRecall(caller, request) {
      const state = await current(caller);
      // No readable scope means no storage scan; mixed off/on still admits its readable part and rechecks every entry.
      return { allowed: !!state && !state.deletion && request.appId === "io.molis.work"
        && namespaceAllowed(caller, request.filter.namespace) && request.scopes.every(target => scoped(caller, target, state))
        && request.scopes.some(target => {
          const mode = request.readMode === "explicit" && (caller.person === true || caller.run_explicit === true) ? "explicit" : "task";
          const access = preferences(caller, target, state.owner, mode);
          const frozen = caller.class_restrictions?.[target.scope === "user" ? "personal" : "project"];
          return access.allowed && !(caller.purpose === "task" && caller.session_id && !frozen)
            && memoryClassReadPossible([...access.prefs.class_restrictions, ...(frozen ?? [])],
              { consumer: caller.consumer, current_scene: caller.current_scene! }, mode, request.filter);
        }), storageCost: "redacted" };
    },
    async authorizeManagement(caller, request) {
      const state = await current(caller);
      return { allowed: !!state && caller.purpose === "management" && request.appId === "io.molis.work"
        && namespaceAllowed(caller, request.filter.namespace) && scoped(caller, request, state), storageCost: "redacted" };
    },
    async callerForSession(owner, sessionId) {
      if (owner.actor_id !== LOCAL_PERSON_ACTOR_ID || !owner.project_id || !owner.plugin_id || !sessionId) return undefined;
      if (owner.plugin_id === ASSISTANT_PLUGIN_ID) {
        if (owner.install_id !== ASSISTANT_INSTALL_ID) return undefined;
        const caller: AgentMemoryCaller = { actor_id: owner.actor_id,
          project_id: owner.project_id === ASSISTANT_PERSONAL_OWNER ? null : owner.project_id,
          consumer: "assistant", current_scene: "assistant", purpose: "task", session_id: sessionId };
        return await current(caller) ? caller : undefined;
      }
      const caller: AgentMemoryCaller = { actor_id: owner.actor_id, project_id: owner.project_id, plugin_id: owner.plugin_id,
        consumer: "agent", current_scene: owner.plugin_id === CODING ? "coding" : "common", purpose: "task", session_id: sessionId };
      return await current(caller) ? caller : undefined;
    },
  };
}
