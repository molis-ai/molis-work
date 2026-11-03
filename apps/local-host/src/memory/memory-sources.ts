import { isDeepStrictEqual } from "node:util";
import type { PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import type { AgentMemoryCaller, AgentMemorySourceRef, AgentMemorySourceRequest, AgentMemorySourceSnapshot, AgentRuntimeAdapter, AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { characterOwner, consumerAccess } from "@molis-ai/molis-work-service-memory";
import { assistantMemorySourceWork } from "../assistant/assistant-memory-sources.js";
import type { MemoryRuntimePolicyOwner } from "./memory-runtime-policy.js";
import { personalInputText, readMemoryInputSource } from "./memory-source-identity.js";

type SourcePort = NonNullable<NonNullable<PrologueNodeAdapterOptions["memory"]>["sources"]>;
const CODING = "io.molis.work.coding";

/** All owners are resolved at use time; creating the Runtime does not capture an unregistered Memory service. */
export interface MemorySourceOwner {
  adapter: AgentRuntimeAdapter;
  policy: MemoryRuntimePolicyOwner;
  sourceAllowed(actorId: string, scope: MemoryScope, owner: string, refs: readonly AgentMemorySourceRef[]): boolean;
  /** Current installation/owner grant, from the existing Host rather than the source locator. */
  sessionAllowed(owner: AgentSessionView["owner"]): Promise<boolean>;
}

function sourceScope(caller: AgentMemoryCaller, target: AgentMemorySourceRequest["target"], projectId: string | null): MemoryScope | undefined {
  if (target.namespace && !caller.person && target.namespace !== caller.plugin_id) return undefined;
  if (target.scope === "user" && target.owner === caller.actor_id) return "personal";
  if (!projectId || projectId !== caller.project_id) return undefined;
  if (target.scope === "project" && target.owner === projectId) return "project";
  if (target.scope === "character" && caller.character_id && target.owner === characterOwner(projectId, caller.character_id)) return "character";
  return undefined;
}

function formationAllowed(owner: MemorySourceOwner, caller: AgentMemoryCaller, scope: MemoryScope, projectId: string | null, assistant: boolean, ref: AgentMemorySourceRef, targetOwner: string): boolean {
  const prefs = owner.policy.prefsFor(scope === "personal" ? "personal" : "project", scope === "personal" ? null : projectId);
  const consumer = assistant ? "assistant" : "agent", plugin = assistant ? undefined : CODING;
  const permitted = (value: typeof prefs) => value.enabled && value.form && (caller.source_use === "explicit" || value.learn_from_work)
    && consumerAccess(value, consumer, plugin, "explicit").allowed
    && (!plugin || consumerAccess(value, "plugin", plugin, "explicit").allowed);
  return owner.policy.alive() && permitted(prefs)
    && (scope !== "personal" || !projectId || permitted(owner.policy.prefsFor("project", projectId)))
    && owner.sourceAllowed(caller.actor_id, scope, targetOwner, [ref]);
}

/** Reads only the canonical input and its existing owners; body text is never copied into a source ledger. */
async function readSource(home: string, owner: MemorySourceOwner, caller: AgentMemoryCaller, request: AgentMemorySourceRequest, ref: AgentMemorySourceRef): Promise<AgentMemorySourceSnapshot | undefined> {
  const identity = readMemoryInputSource(ref);
  if (!identity || request.app_id !== "io.molis.work" || request.signal?.aborted || !owner.policy.alive()
    || identity.actor_id !== caller.actor_id || caller.actor_id !== LOCAL_PERSON_ACTOR_ID) return undefined;
  const sessionRef = { session_id: identity.session_id, runtime_id: owner.adapter.descriptor.runtime_id };
  const session = await owner.adapter.readSessionStatus?.(sessionRef);
  if (!session || session.status.recovery || session.owner.actor_id !== identity.actor_id) return undefined;
  const assistant = session.owner.plugin_id === ASSISTANT_PLUGIN_ID;
  if (assistant ? session.owner.install_id !== ASSISTANT_INSTALL_ID || caller.consumer !== "assistant" && !caller.person
    : session.owner.plugin_id !== CODING || caller.plugin_id !== CODING && !caller.person) return undefined;
  const projectId = assistant && session.owner.project_id === ASSISTANT_PERSONAL_OWNER ? null : session.owner.project_id;
  if (!assistant && !caller.person) {
    if (!caller.session_id || caller.project_id !== projectId) return undefined;
    const current = caller.session_id === sessionRef.session_id ? session : await owner.adapter.readSessionStatus?.({
      session_id: caller.session_id, runtime_id: owner.adapter.descriptor.runtime_id });
    if (!current || current.status.recovery || current.owner.actor_id !== caller.actor_id
      || current.owner.project_id !== caller.project_id || current.owner.plugin_id !== caller.plugin_id
      || current.owner.install_id !== session.owner.install_id) return undefined;
  }
  const scope = sourceScope(caller, request.target, projectId);
  if (!scope || projectId && await owner.policy.projectExists(projectId) !== true || !await owner.sessionAllowed(session.owner)) return undefined;
  const work = () => !assistant || assistantMemorySourceWork(home, identity.actor_id, identity.session_id,
    caller.source_use === "explicit" && caller.session_id === identity.session_id)?.project_id === projectId;
  if (!work() || !formationAllowed(owner, caller, scope, projectId, assistant, ref, request.target.owner)) return undefined;

  let text: string, at: number, runRef;
  if (identity.kind === "original") {
    const found = await owner.adapter.readOriginalInput?.({ session_id: identity.session_id, input_id: identity.input_id, version: 1 });
    if (!found || found.original.written_by !== "person") return undefined;
    text = found.original.text; at = Date.parse(found.original.occurred_at); runRef = found.accepted_run;
  } else {
    const found = await owner.adapter.inputs?.read?.({ session_id: identity.session_id, input_id: identity.input_id });
    if (!found || found.state !== "run" || personalInputText(found.text, found.receipt) === undefined || !["applied", "read"].includes(found.receipt.state)
      || found.receipt.accepted_at_ms === undefined) return undefined;
    text = personalInputText(found.text, found.receipt)!; at = found.receipt.accepted_at_ms; runRef = found.run;
  }
  if (!Number.isFinite(at) || !text.trim() || runRef.session_id !== identity.session_id) return undefined;
  const run = await owner.adapter.read(runRef);
  const usablePhase = (phase: string) => phase === "completed" || caller.source_use === "explicit"
    && ["running", "awaiting-input", "awaiting-review", "compacting"].includes(phase);
  if (!usablePhase(run.phase)) return undefined;
  if (request.signal?.aborted || !work() || !await owner.sessionAllowed(session.owner)
    || projectId && await owner.policy.projectExists(projectId) !== true
    || !formationAllowed(owner, caller, scope, projectId, assistant, ref, request.target.owner)) return undefined;
  if (!usablePhase((await owner.adapter.read(runRef)).phase)) return undefined;
  // This is the last asynchronous source read. A withdrawn/queued input wins over an earlier readable receipt.
  if (identity.kind === "supplement") {
    const current = await owner.adapter.inputs?.read?.({ session_id: identity.session_id, input_id: identity.input_id });
    if (!current || current.state !== "run" || current.run.run_id !== runRef.run_id || personalInputText(current.text, current.receipt) !== text
      || !["applied", "read"].includes(current.receipt.state)
      || current.receipt.accepted_at_ms !== at) return undefined;
  }
  if (request.signal?.aborted || !work() || !formationAllowed(owner, caller, scope, projectId, assistant, ref, request.target.owner)) return undefined;
  return { ...ref, speaker: { kind: "person", id: identity.actor_id }, derivation: "original", occurred_at_ms: at, text };
}

/** App SourcePort, sharing the SDK's existing bound caller and current scope authorization. */
export function memorySources(home: string, ownerFor: () => MemorySourceOwner | undefined): SourcePort {
  const resolve: SourcePort["resolve"] = async (caller, request) => {
    const owner = ownerFor();
    if (!owner || request.signal?.aborted || !request.refs.length || new Set(request.refs.map(ref => ref.event_id)).size !== request.refs.length) return [];
    const fixedCaller = structuredClone(caller), refs = request.refs.map(ref => ({ ...ref })), fixed = { ...request, target: { ...request.target } };
    const sources: AgentMemorySourceSnapshot[] = [];
    for (const ref of refs) {
      const source = await readSource(home, owner, fixedCaller, fixed, ref).catch(() => undefined);
      const current = ownerFor();
      if (!source || request.signal?.aborted || current?.adapter !== owner.adapter || current.policy !== owner.policy) return [];
      sources.push(source);
    }
    return sources;
  };
  return { resolve, async check(caller, request) {
    const identities = structuredClone(request.identities);
    if (!identities.length) return false;
    const found = await resolve(caller, { ...request, refs: identities.map(({ event_id, version }) => ({ event_id, version })) });
    return found.length === identities.length && found.every(({ text: _text, ...identity }, index) => isDeepStrictEqual(identity, identities[index]));
  } };
}
