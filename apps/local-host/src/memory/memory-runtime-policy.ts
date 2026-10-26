import type { PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import type { AgentMemoryCaller, AgentMemoryExtractor } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { MEMORY_CONSUMERS, type MemoryPrefs, type MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { characterOwner, consumerAccess } from "@molis-ai/molis-work-service-memory";

type Options = NonNullable<PrologueNodeAdapterOptions["memory"]>;
type Request = Parameters<Options["authorize"]>[1][number];
type Target = Pick<Request["target"], "scope" | "owner" | "namespace" | "kind">;

/** Current facts of the already-open Memory owner. No second ledger or cached grant. */
export interface MemoryRuntimePolicyOwner {
  alive(): boolean;
  prefsFor(scope: MemoryScope, projectId: string | null): MemoryPrefs;
  owners(projectId: string): readonly { scope: MemoryScope; owner: string; subject: string | null }[];
  candidateOwners(projectId: string): readonly { scope: MemoryScope; owner: string }[];
  projectExists(projectId: string): Promise<boolean | null>;
  /** Present only during the trusted project-deletion hook, never from an Action's input. */
  deletingProject(): string | undefined;
}

const CODING = "io.molis.work.coding";
const SCENES = ["coding", "assistant", "common"] as const;
const ACTIONS = ["save", "propose", "accept", "promote", "read", "manage-read", "delete"] as const;

/** The App's declared classification, intersected below with the person's live scope switches. */
const POLICY: Options["policy"] = {
  version: 1, preset: "manual",
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

/** SDK authority sees only trusted caller bindings and current owner facts, never model-supplied permissions. */
export function memoryRuntimePolicy(ownerFor: () => MemoryRuntimePolicyOwner | undefined, extractor?: AgentMemoryExtractor): Options {
  const callerAllowed = (caller: AgentMemoryCaller) => caller.actor_id === LOCAL_PERSON_ACTOR_ID
    && MEMORY_CONSUMERS.some(value => value === caller.consumer) && SCENES.some(scene => scene === caller.current_scene)
    && (caller.consumer !== "plugin" || !!caller.plugin_id)
    && (caller.current_scene !== "coding" || caller.plugin_id === CODING || caller.person === true)
    && (caller.current_scene !== "assistant" || caller.consumer === "assistant" || caller.person === true);

  const current = async (caller: AgentMemoryCaller) => {
    const owner = ownerFor();
    if (!owner?.alive() || !callerAllowed(caller)) return undefined;
    const deletion = caller.person === true && caller.purpose === "management" && caller.consumer === "ui"
      && caller.project_id !== null && owner.deletingProject() === caller.project_id;
    if (caller.project_id && !deletion && await owner.projectExists(caller.project_id) !== true) return undefined;
    return owner.alive() ? { owner, deletion } : undefined;
  };
  const scoped = (caller: AgentMemoryCaller, target: Pick<Target, "scope" | "owner">, state: { owner: MemoryRuntimePolicyOwner; deletion: boolean }) => {
    if (target.scope === "user") return !state.deletion && target.owner === caller.actor_id;
    if (!caller.project_id) return false;
    if (target.scope === "project") return target.owner === caller.project_id;
    if (target.scope !== "character") return false;
    const recorded = state.owner.owners(caller.project_id).find(row => row.scope === "character" && row.owner === target.owner);
    if (state.deletion) return !!recorded || state.owner.candidateOwners(caller.project_id).some(row => row.scope === "character" && row.owner === target.owner);
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
  const permitted = (caller: AgentMemoryCaller, request: Request, state: { owner: MemoryRuntimePolicyOwner; deletion: boolean }) => {
    if (request.appId !== "io.molis.work" || !scoped(caller, request.target, state) || !namespaceAllowed(caller, request.target.namespace)) return false;
    if (state.deletion) return request.action === "manage-read" || request.action === "delete";
    if (request.action === "manage-read" || request.action === "delete") {
      if (caller.person === true && caller.purpose === "management") return true;
      if (request.action === "delete") return false;
    }
    const { prefs, allowed } = preferences(caller, request.target, state.owner,
      request.readMode === "explicit" && caller.person === true ? "explicit" : "task");
    if (request.action === "manage-read" && request.target.ref.kind === "memory-candidate"
      && caller.source_use === "learning" && caller.purpose === "management") {
      return prefs.enabled && prefs.form && prefs.learn_from_work
        && preferences(caller, request.target, state.owner, "explicit").allowed;
    }
    if (request.action === "read" || request.action === "manage-read") return allowed;
    if (!prefs.enabled) return false;
    if (request.action === "promote") return prefs.form && prefs.learn_from_work && prefs.auto
      && preferences(caller, request.target, state.owner, "explicit").allowed;
    if (caller.person === true && caller.purpose === "management") return true;
    if (!prefs.form || request.action === "accept" || !preferences(caller, request.target, state.owner, "explicit").allowed) return false;
    // Plugins write only their own namespace; shared explicit statements are admitted by MemoryService's source gate.
    return caller.consumer !== "plugin" || request.target.namespace === caller.plugin_id;
  };
  return {
    policy: extractor ? { ...POLICY, formation: { maxSlots: 144 },
      // 120 fixed replacement metas can each occupy the SDK's 4 KiB metadata budget, plus 24 creation slots and identities.
      limits: { maxContentChars: 655360, maxContentNodes: 16384 }, matrix: { ...POLICY.matrix,
      rows: POLICY.matrix!.rows!.map(row => ({ ...row, formation: ["run-end"] })) } } : POLICY,
    ...(extractor ? { extractor } : {}),
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
        && request.scopes.some(target => preferences(caller, target, state.owner,
          request.readMode === "explicit" && caller.person === true ? "explicit" : "task").allowed), storageCost: "redacted" };
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
