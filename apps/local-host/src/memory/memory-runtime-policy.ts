import type { PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import type { AgentMemoryCaller, AgentMemoryExtractor } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { MEMORY_CONSUMERS, type MemoryPrefs, type MemoryScope, type MemorySessionPurgeTarget } from "@molis-ai/molis-work-contracts/services/memory";
import { characterOwner, consumerAccess, memoryClassReadAllowed, memoryClassReadPossible, memoryClassFormationAllowed } from "@molis-ai/molis-work-service-memory";

type Options = NonNullable<PrologueNodeAdapterOptions["memory"]>;
type Request = Parameters<Options["authorize"]>[1][number];
type Target = Pick<Request["target"], "scope" | "owner" | "namespace" | "kind" | "classification" | "source" | "approvedBy">;

/** Current facts of the already-open Memory owner. No second ledger or cached grant. */
export interface MemoryRuntimePolicyOwner {
  alive(): boolean;
  isForgotten(scope: MemoryScope, owner: string, kind: "memory" | "memory-candidate", id: string): boolean;
  prefsFor(scope: MemoryScope, projectId: string | null): MemoryPrefs;
  owners(projectId: string): readonly { scope: MemoryScope; owner: string; subject: string | null }[];
  candidateOwners(projectId: string): readonly { scope: MemoryScope; owner: string }[];
  authorizeSessionPurge?(caller: AgentMemoryCaller, target: MemorySessionPurgeTarget): boolean;
  projectExists(projectId: string): Promise<boolean | null>;
  /** Present only during the trusted project-deletion hook, never from an Action's input. */
  deletingProject(): string | undefined;
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

function scoped(caller: AgentMemoryCaller, target: Pick<Target, "scope" | "owner">, state: { owner: MemoryRuntimePolicyOwner; deletion: boolean }) {
    if (target.scope === "user") return !state.deletion && target.owner === caller.actor_id;
    if (!caller.project_id) return false;
    if (target.scope === "project") return target.owner === caller.project_id;
    if (target.scope !== "character") return false;
    const recorded = state.owner.owners(caller.project_id).find(row => row.scope === "character" && row.owner === target.owner);
    if (state.deletion) return !!recorded || state.owner.candidateOwners(caller.project_id).some(row => row.scope === "character" && row.owner === target.owner);
    if (caller.person === true) return !!recorded;
    return !!caller.character_id && (!recorded || recorded.subject === caller.character_id)
      && target.owner === characterOwner(caller.project_id, caller.character_id);
}

function inspection(caller: AgentMemoryCaller, request: Parameters<NonNullable<Options["authorizePurgeInspection"]>>[1], state: { owner: MemoryRuntimePolicyOwner; deletion: boolean }) {
    const binding = caller.memory_session;
    if (!binding || caller.person !== true || caller.consumer !== "ui" || caller.purpose !== "management" || state.deletion
      || request.purpose === "owner-coverage" || request.appId !== "io.molis.work" || request.selection.sessionRef.id !== binding.session.session_id
      || request.selection.sessionRef.revision !== 1 || binding.target.project_id !== caller.project_id || binding.current_scene !== caller.current_scene) return false;
    if (request.purpose === "session-preview") return true;
    const scope = request.identity.scope === "user" ? "personal" : request.identity.scope;
    if (!["personal", "project", "character"].includes(scope) || !scoped(caller, request.identity, state)) return false;
    return state.owner.authorizeSessionPurge?.(caller, { kind: request.ref.kind, id: request.ref.id, scope: scope as MemoryScope,
      owner: request.identity.owner, version: request.expectedVersion, operation_id: request.operationId,
      selection: { session_ref: { ...request.selection.sessionRef, revision: 1 }, operation_id: request.selection.operationId } }) === true;
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
  const classAllowed = (caller: AgentMemoryCaller, prefs: MemoryPrefs, target: Target, mode: "explicit" | "task" | "resident" | "form") => {
    if (caller.session_id && !caller.class_restrictions && !(caller.person === true && caller.purpose === "management"
      && caller.memory_session?.session.session_id === caller.session_id && caller.memory_session.current_scene === caller.current_scene)) return false;
    const frozen = caller.class_restrictions?.[target.scope === "user" ? "personal" : "project"];
    const context = { consumer: caller.consumer, current_scene: caller.current_scene! };
    const allowed = (rows: MemoryPrefs["class_restrictions"] | NonNullable<typeof frozen>) => mode === "form"
      ? memoryClassFormationAllowed(rows, context, target) : memoryClassReadAllowed(rows, context, target, mode);
    return allowed(prefs.class_restrictions) && (!frozen || allowed(frozen));
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
  const permitted = (caller: AgentMemoryCaller, request: Request, state: { owner: MemoryRuntimePolicyOwner; deletion: boolean }) => {
    if (request.appId !== "io.molis.work" || !scoped(caller, request.target, state) || !namespaceAllowed(caller, request.target.namespace)) return false;
    // Management reads are needed by the SDK's existing delete preflight; public App management reads filter these identities.
    // No accepted target can enter model use or a new mutation while physical cleanup is pending.
    if (request.action !== "delete" && !(request.action === "manage-read" && caller.person === true && caller.purpose === "management")
      && state.owner.isForgotten(request.target.scope === "user" ? "personal" : request.target.scope as MemoryScope,
        request.target.owner, request.target.ref.kind, request.target.ref.id)) return false;
    if (state.deletion) return request.action === "manage-read" || request.action === "delete";
    if (request.action === "manage-read" || request.action === "delete") {
      if (caller.person === true && caller.purpose === "management") return true;
      if (request.action === "delete") return false;
    }
    // SDK mutation preflight has no readMode; only this trusted formal-memory invocation supplies its explicit purpose.
    const managementRead = request.action === "manage-read" && request.target.ref.kind === "memory"
      && caller.purpose === "management" && caller.run_explicit === true && request.readMode === undefined;
    const explicit = managementRead || request.readMode === "explicit" && (caller.person === true || caller.run_explicit === true);
    const { prefs, allowed } = preferences(caller, request.target, state.owner, explicit ? "explicit" : "task");
    const readMode = explicit ? "explicit" : request.readMode === "resident" ? "resident" : "task";
    const formation = () => classAllowed(caller, prefs, request.target, "form")
      && (!request.before || classAllowed(caller, preferences(caller, request.before, state.owner, "explicit").prefs, request.before, "form"));
    const candidate = caller.candidate_access;
    if (request.action === "manage-read" && request.target.ref.kind === "memory-candidate" && candidate) {
      const matching = caller.purpose === "management" && (caller.source_use === "learning" || caller.source_use === "explicit")
        && candidate.scope === request.target.scope && candidate.owner === request.target.owner
        && (candidate.purpose === "formation-receipt" ? candidate.candidate_id === request.target.ref.id && candidate.version === request.target.version
          : candidate.purpose === "proposal-check" && !!candidate.operation_id);
      return matching && prefs.enabled && prefs.form && (caller.source_use !== "learning" || prefs.learn_from_work)
        && preferences(caller, request.target, state.owner, "explicit").allowed && formation();
    }
    if (request.action === "read" || request.action === "manage-read") return allowed && classAllowed(caller, prefs, request.target, readMode);
    if (!prefs.enabled) return false;
    if (request.action === "promote") return prefs.form && prefs.learn_from_work && prefs.auto
      && preferences(caller, request.target, state.owner, "explicit").allowed && formation();
    if (caller.person === true && caller.purpose === "management") return true;
    if (!prefs.form || request.action === "accept" || !preferences(caller, request.target, state.owner, "explicit").allowed) return false;
    // Plugins write only their own namespace; shared explicit statements are admitted by MemoryService's source gate.
    const pluginSave = request.action === "save" && caller.consumer === "plugin" && request.target.namespace === caller.plugin_id
      && request.target.source === "plugin" && request.target.approvedBy?.by === "policy" && request.target.approvedBy.policy === `plugin:${caller.plugin_id}`;
    return (caller.consumer !== "plugin" || request.target.namespace === caller.plugin_id) && (pluginSave || formation());
  };
  return {
    readInput: "frozen",
    policy: extractor ? { ...POLICY, formation: { maxSlots: 144 },
      // 120 fixed replacement metas can each occupy the SDK's 4 KiB metadata budget, plus 24 creation slots and identities.
      limits: { maxContentChars: 655360, maxContentNodes: 16384 }, matrix: { ...POLICY.matrix,
      rows: POLICY.matrix!.rows!.map(row => ({ ...row, formation: ["run-end"] })) } } : POLICY,
    ...(extractor ? { extractor } : {}),
    assertCurrent(caller, requests) {
      const state = currentFacts(caller);
      return !!state && requests.every(request => permitted(caller, request, state)
        && (!request.before || scoped(caller, request.before, state) && namespaceAllowed(caller, request.before.namespace)));
    },
    async authorize(caller, requests) {
      const state = await current(caller);
      return !!state && requests.every(request => permitted(caller, request, state)
        && (!request.before || scoped(caller, request.before, state) && namespaceAllowed(caller, request.before.namespace)));
    },
    async authorizeRecall(caller, request) {
      const state = await current(caller);
      // No readable scope means no storage scan; mixed off/on still admits its readable part and rechecks every entry.
      return { allowed: !!state && !state.deletion && request.appId === "io.molis.work"
        && namespaceAllowed(caller, request.filter.namespace) && request.scopes.every(target => scoped(caller, target, state))
        && request.scopes.some(target => {
          const mode = request.readMode === "explicit" && (caller.person === true || caller.run_explicit === true) ? "explicit" : "task";
          const access = preferences(caller, target, state.owner, mode), frozen = caller.class_restrictions?.[target.scope === "user" ? "personal" : "project"] ?? [];
          return access.allowed && (!caller.session_id || !!caller.class_restrictions)
            && memoryClassReadPossible([...access.prefs.class_restrictions, ...frozen], { consumer: caller.consumer, current_scene: caller.current_scene! }, mode, request.filter);
        }), storageCost: "redacted" };
    },
    async authorizeManagement(caller, request) {
      const state = await current(caller);
      return { allowed: !!state && caller.purpose === "management" && request.appId === "io.molis.work"
        && namespaceAllowed(caller, request.filter.namespace) && scoped(caller, request, state), storageCost: "redacted" };
    },
    async authorizePurgeInspection(caller, request, owner) {
      const state = await current(caller), binding = caller.memory_session;
      if (!state || !binding || owner.actor_id !== caller.actor_id || owner.project_id !== (caller.project_id ?? ASSISTANT_PERSONAL_OWNER)
        || owner.plugin_id !== (binding.target.kind === "coding" ? CODING : ASSISTANT_PLUGIN_ID)
        || !owner.install_id || binding.target.kind === "assistant" && owner.install_id !== ASSISTANT_INSTALL_ID) return false;
      return inspection(caller, request, state);
    },
    assertPurgeInspectionCurrent(caller, request) {
      const state = currentFacts(caller);
      return !!state && inspection(caller, request, state);
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
