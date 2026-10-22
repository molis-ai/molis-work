import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Who answers, when the runtime looks at a job a Host work follows (specs/prologue-adoption §6.0o), with what that
 * work may call now: its own action client, as its rounds get it. Registered by the service that owns the works (the
 * Assistant) when it is built, which the web server does before the runtime starts; until then a look is not known yet.
 */
type WorkAuthorityResolver = (at: { graph_id: string; node_id: string }) => Promise<{ actions: { client: AgentActionClient } } | undefined>;

const resolvers = new WeakMap<object, WorkAuthorityResolver>();

export function registerWorkAuthority(owner: object, resolver: WorkAuthorityResolver): () => void {
  resolvers.set(owner, resolver);
  return () => { if (resolvers.get(owner) === resolver) resolvers.delete(owner); };
}

/** The runtime's `checks.workAuthority` for `owner`: whoever registered answers; before anyone has, the look throws (not known yet). */
export function workAuthorityCheck(owner: object): WorkAuthorityResolver {
  return async at => {
    const resolve = resolvers.get(owner);
    if (!resolve) throw new Error("跟进后台任务的服务还没有装好");
    return resolve(at);
  };
}
