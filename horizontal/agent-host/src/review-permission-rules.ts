import { randomUUID } from "node:crypto";
import type { AgentReviewRequest, AgentRunRef, AuthorizationEntry, ReviewDecisionSource } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import { agentErrors } from "./errors.js";

type PolicySource = Extract<ReviewDecisionSource, { kind: "policy" }>;
type Kind = "session-command" | "run-app";
type RunUse = { stop(): Promise<void>; claims: Set<string> };
type Rule = {
  kind: Kind; key: string; project: string; plugin: string; run: AgentRunRef; scope: readonly string[];
  source: PolicySource; assertOwnerCurrent?: () => void; stopped?: boolean; stops: Map<string, RunUse>; closing?: Promise<void>;
};

/** The review queue's two deliberately in-memory rules, indexed by the exact original session/command or run/app. */
export class ReviewPermissionRules {
  readonly #rules = new Map<string, Rule>();
  readonly #byId = new Map<string, Rule>();

  #remember(rule: Omit<Rule, "source" | "stops">, owner: string, actor: string, at: string): void {
    const previous = this.#rules.get(rule.key);
    if (previous && (!previous.stopped || previous.stops.size)) return;
    if (previous) this.#byId.delete(previous.source.id);
    const next = { ...rule, source: { kind: "policy" as const, owner, id: randomUUID(), revision: 1, set_by: actor, set_at: at }, stops: new Map() };
    this.#rules.set(next.key, next); this.#byId.set(next.source.id, next);
  }

  rememberCommand(key: string, request: AgentReviewRequest, actor: string, at: string): void {
    if (!request.run || request.document.kind !== "command") return;
    this.#remember({ kind: "session-command", key, project: request.project_id, plugin: request.plugin_id, run: request.run,
      scope: [request.document.command, request.document.cwd || "."] }, "agent.session-rule", actor, at);
  }

  rememberApp(request: AgentReviewRequest, app: { id: string; label: string }, actor: string, at: string, assertOwnerCurrent: () => void): void {
    if (!request.run) throw agentErrors.review_not_permitted("本轮应用权限需要原执行轮次");
    assertOwnerCurrent();
    this.#remember({ kind: "run-app", key: JSON.stringify([request.project_id, request.run.session_id, request.run.run_id, app.id]), project: request.project_id,
      plugin: request.plugin_id, run: request.run, scope: [app.label], assertOwnerCurrent }, "agent.run-app", actor, at);
  }

  command(key: string) { return this.#permission(key); }
  app(project: string, run: AgentRunRef, app: string) { return this.#permission(JSON.stringify([project, run.session_id, run.run_id, app])); }

  #permission(key: string) {
    const rule = this.#rules.get(key);
    if (!rule || rule.stopped) return undefined;
    return { source: rule.source, assertCurrent: () => this.#assert(rule) };
  }

  #assert(rule: Rule): void {
    if (rule.stopped || this.#rules.get(rule.key) !== rule) throw agentErrors.review_not_permitted("沿用的原许可已撤销");
    rule.assertOwnerCurrent?.();
  }

  holdForRun(source: PolicySource, request: AgentReviewRequest, stop: () => Promise<void>) {
    const rule = this.#byId.get(source.id), run = request.run;
    if (!rule || !run || rule.source.revision !== source.revision || rule.source.owner !== source.owner || rule.project !== request.project_id
      || rule.plugin !== request.plugin_id || rule.run.session_id !== run.session_id || rule.kind === "run-app" && rule.run.run_id !== run.run_id) {
      throw agentErrors.review_not_permitted("沿用许可与原轮次不一致");
    }
    this.#assert(rule);
    const use = rule.stops.get(run.run_id) ?? { stop, claims: new Set<string>() };
    use.claims.add(request.review_id); rule.stops.set(run.run_id, use);
    return { assertCurrent: () => this.#assert(rule), release: () => {
      use.claims.delete(request.review_id);
      if (!rule.stopped && !use.claims.size && rule.stops.get(run.run_id) === use) rule.stops.delete(run.run_id);
    } };
  }

  list(uses?: ReadonlyMap<string, string>): AuthorizationEntry[] {
    return [...this.#byId.values()].map(rule => this.#entry(rule, uses));
  }

  read(kind: Kind, id: string, uses?: ReadonlyMap<string, string>): AuthorizationEntry | undefined {
    const rule = this.#byId.get(id);
    return rule?.kind === kind ? this.#entry(rule, uses) : undefined;
  }

  #entry(rule: Rule, uses?: ReadonlyMap<string, string>): AuthorizationEntry {
    const visibleProject = rule.project === ASSISTANT_PERSONAL_OWNER ? null : rule.project;
    return { owner: rule.kind, id: rule.source.id, expected: String(rule.source.revision), project_id: visibleProject, actor: rule.plugin,
      title: rule.scope[0]!, scope: rule.scope, mode: "automatic", lifetime: rule.kind === "run-app" ? "run" : "session", expires_at: null,
      status: rule.stopped && rule.stops.size ? "settling" : rule.stopped ? "revoked" : "active", source: { ...rule.source }, recent_use_at: uses?.get(rule.source.id) ?? null,
      changes: rule.stopped && !rule.stops.size ? [] : ["revoke"] };
  }

  async revoke(kind: Kind, id: string, expected: string, assertCurrent: () => void): Promise<AuthorizationEntry> {
    const rule = this.#byId.get(id);
    if (!rule || rule.kind !== kind) throw agentErrors.review_unknown("这份原许可已结束");
    if (String(rule.source.revision) !== expected) throw agentErrors.review_version_changed("原许可已变化，请刷新");
    assertCurrent();
    if (!rule.stopped) {
      rule.stopped = true; rule.source = { ...rule.source, revision: rule.source.revision + 1 };
    }
    if (rule.stops.size && !rule.closing) rule.closing = Promise.allSettled([...rule.stops].map(async ([run, use]) => {
      await use.stop(); rule.stops.delete(run);
    })).then(outcomes => {
      if (outcomes.some(outcome => outcome.status === "rejected")) throw agentErrors.pending_not_open("权限已撤销，原执行的停止回执仍待核对");
    }).finally(() => { rule.closing = undefined; });
    await rule.closing;
    return this.#entry(rule);
  }

  releaseRun(id: string): void {
    for (const rule of this.#byId.values()) {
      rule.stops.delete(id);
      if (rule.kind === "run-app" && rule.run.run_id === id) {
        this.#rules.delete(rule.key); this.#byId.delete(rule.source.id);
      }
    }
  }

  releaseSession(id: string, project: string, plugin: string): void {
    for (const rule of this.#byId.values()) if (rule.run.session_id === id && rule.project === project && rule.plugin === plugin) {
      this.#rules.delete(rule.key); this.#byId.delete(rule.source.id);
    }
  }

  close(): void { this.#rules.clear(); this.#byId.clear(); }
}
