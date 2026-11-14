import { createHash, randomUUID } from "node:crypto";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ApprovalRuleOwner, ProjectApprovalRule, ProjectApprovalRules, ProjectApprovalRuleScope } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";

type RuleRow = Omit<ProjectApprovalRule, "scope" | "requires_person"> & { scope_json: string; requires_person: 0 | 1 | null };
type Change = {
  readonly expected_revision: string;
  readonly reason: string;
} & ({ readonly kind: "set"; readonly scope: ProjectApprovalRuleScope; readonly requires_person: boolean }
  | { readonly kind: "withdraw"; readonly id: string });

interface RuleControl {
  beforeEffect(): Promise<void>;
  assertCurrent(): void;
}

const active = (rule: ProjectApprovalRule) => rule.state === "active";
const scopeKey = (scope: ProjectApprovalRuleScope) => canonicalJsonText(scope, "null");
const ownerKey = (owner: ApprovalRuleOwner) => canonicalJsonText(owner, "null");
const revisionOf = (rules: readonly ProjectApprovalRule[]) => createHash("sha256")
  .update(JSON.stringify(rules.map(rule => [rule.id, rule.revision]))).digest("hex");

/** Apply the project's default, then allow the current object's owner to strengthen it. */
export function approvalRequiresPerson(snapshot: ProjectApprovalRules, object?: Extract<ProjectApprovalRuleScope, { owner: ApprovalRuleOwner }>,
  ancestors: readonly Readonly<{ kind: string; id: string }>[] = []): boolean {
  const applicable = snapshot.rules.filter(active);
  const project = applicable.filter(rule => rule.scope.kind === "project_default" && rule.requires_person !== null).at(-1);
  return project?.requires_person === true || !!object && applicable.some(rule => {
    const scope = rule.scope;
    if (scope.kind === "project_default" || !rule.requires_person || ownerKey(scope.owner) !== ownerKey(object.owner)) return false;
    const matches = (subject: Readonly<{ kind: string; id: string }>) => subject.kind === scope.subject.kind && subject.id === scope.subject.id;
    return matches(object.subject) || scope.kind === "ancestor_minimum" && ancestors.some(matches);
  });
}

/** The project library is supplied by the Host. The transaction may join an owner's existing write on that same connection. */
export function projectApprovalRules(db: SqliteDatabase, projectId: string) {
  const read = (includeHistory = true): ProjectApprovalRules => {
    const rows = db.prepare<[string], RuleRow>(`
      SELECT id, project_id, scope_json, rule_order AS "order", requires_person, revision, state, created_by, created_at, reason, changed_by, changed_at, change_reason
        FROM project_approval_rules WHERE project_id = ? ${includeHistory ? "" : "AND state = 'active'"} ORDER BY rule_order, id
    `).all(projectId);
    const rules = rows.map(({ scope_json, requires_person, ...row }) => ({
      ...row, scope: JSON.parse(scope_json) as ProjectApprovalRuleScope, requires_person: requires_person === null ? null : requires_person === 1,
    }));
    return { revision: revisionOf(rules.filter(active)), rules };
  };
  const commit = (change: Change, actorId: string, at: string, assertCurrent: () => void): ProjectApprovalRules => {
    if (!db.inTransaction) throw new ActionError("actions.forbidden", "审批规则需要在当前项目事务中保存");
    const current = read(false);
    if (change.expected_revision !== current.revision) throw new ActionError("actions.conflict", "项目审批规则已变化，请刷新后再改");
    if (!actorId.trim() || !change.reason.trim()) throw new ActionError("actions.input_invalid", "保存审批规则需要操作者和原因");
    requireSynchronous(assertCurrent());
    if (change.kind === "withdraw") {
      const row = current.rules.find(rule => rule.id === change.id && active(rule));
      if (!row) throw new ActionError("actions.missing", "找不到有效的审批规则");
      db.prepare(`UPDATE project_approval_rules SET state = 'withdrawn', revision = revision + 1,
        changed_by = ?, changed_at = ?, change_reason = ? WHERE project_id = ? AND id = ?`).run(actorId, at, change.reason, projectId, change.id);
    } else {
      const scope = scopeKey(change.scope);
      db.prepare(`UPDATE project_approval_rules SET state = 'replaced', revision = revision + 1,
        changed_by = ?, changed_at = ?, change_reason = ? WHERE project_id = ? AND scope_json = ? AND state = 'active'`)
        .run(actorId, at, change.reason, projectId, scope);
      db.prepare(`INSERT INTO project_approval_rules
        (id, project_id, scope_json, rule_order, requires_person, revision, state, created_by, created_at, reason)
        VALUES (?, ?, ?, (SELECT coalesce(max(rule_order), 0) + 1 FROM project_approval_rules WHERE project_id = ?), ?, 1, 'active', ?, ?, ?)`)
        .run(randomUUID(), projectId, scope, projectId, change.requires_person ? 1 : 0, actorId, at, change.reason);
    }
    requireSynchronous(assertCurrent());
    return read(false);
  };
  return {
    read,
    commit,
    async change(input: Change, actorId: string, at: string, control: RuleControl) {
      const frozen = structuredClone(input);
      await control.beforeEffect();
      requireSynchronous(control.assertCurrent());
      return db.transaction(() => commit(frozen, actorId, at, control.assertCurrent)).immediate();
    },
  };
}
