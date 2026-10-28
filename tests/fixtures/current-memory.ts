import type { AgentMemoryCaller } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";

type Options = NonNullable<PrologueNodeAdapterOptions["memory"]>;
type Scope = { scope: "user" | "project" | "character"; owner: string };

/** Explicit owner grants for the public Node adapter. No default Home, model, or globally permitted scope. */
export function currentMemoryOptions(input: {
  appId: string;
  scopesFor(caller: AgentMemoryCaller): readonly Scope[];
  allowed?(caller: AgentMemoryCaller): boolean;
  beforeAuthorize?: Options["authorize"];
  callerForSession?: Options["callerForSession"];
}): Options {
  const actions = ["save", "propose", "accept", "read", "manage-read", "delete"] as const;
  const contextAllowed = (caller: AgentMemoryCaller) => caller.consumer === "ui" && caller.current_scene === "coding"
    && caller.purpose === "management" && (input.allowed?.(caller) ?? true);
  const scopeAllowed = (caller: AgentMemoryCaller, target: { scope: string; owner: string }) => input.scopesFor(caller)
    .some(scope => scope.scope === target.scope && scope.owner === target.owner);
  return {
    policy: { version: 1, preset: "manual", taxonomy: { version: 1,
      scenes: { values: [{ id: "coding", label: "Coding" }], default: ["coding"] },
      kinds: { values: [{ id: "convention", label: "Convention" }, { id: "preference", label: "Preference" }], default: "convention" },
      lifecycles: { values: [{ id: "long-term", label: "Long term", retention: "persistent" },
        { id: "session", label: "Session", retention: "session" }], default: "long-term" },
      extra: [{ id: "topic", label: "Topic", cardinality: "many", values: [{ id: "format", label: "Format" }] }],
    }, matrix: { default: { actions, formation: [], read: { modes: ["explicit", "task"] } } } },
    authorize: async (caller, requests) => {
      if (input.beforeAuthorize && !await input.beforeAuthorize(caller, requests)) return false;
      return contextAllowed(caller) && requests.every(request => request.appId === input.appId
        && request.context.consumer === caller.consumer && request.context.currentScene === caller.current_scene
        && request.context.purpose === caller.purpose && request.target.namespace === undefined
        && actions.some(action => action === request.action) && scopeAllowed(caller, request.target));
    },
    authorizeRecall: async (caller, request) => ({ allowed: contextAllowed(caller) && request.appId === input.appId
      && request.filter.namespace === undefined && request.scopes.every(scope => scopeAllowed(caller, scope)) }),
    authorizeManagement: async (caller, request) => ({ allowed: contextAllowed(caller) && request.appId === input.appId
      && request.filter.namespace === undefined && scopeAllowed(caller, request) }),
    callerForSession: input.callerForSession ?? (async () => undefined),
  };
}

/** Management/non-Run tests must observe the data branch, never silently accept a Run queue receipt. */
export function memoryData<T extends import("@molis-ai/molis-work-contracts/services/memory").MemoryListResponse | import("@molis-ai/molis-work-contracts/services/memory").MemoryRecallResponse | import("@molis-ai/molis-work-contracts/services/memory").MemoryRunReadResult>(result: T): Exclude<T, import("@molis-ai/molis-work-contracts/services/memory").MemoryRunReadResult> {
  if ("mode" in result) throw new Error("Expected non-Run memory data, received an expansion receipt");
  return result as Exclude<T, import("@molis-ai/molis-work-contracts/services/memory").MemoryRunReadResult>;
}
