import { createHash, randomUUID } from "node:crypto";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ApprovalRuleOwner, ProjectApprovalRule, ProjectApprovalRuleChange, ProjectApprovalRulePage, ProjectApprovalRules, ProjectApprovalRuleScope } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";

type RuleRow = Omit<ProjectApprovalRule, "scope" | "requires_person"> & { scope_json: string; requires_person: 0 | 1 | null };
type RuleChange = Exclude<ProjectApprovalRuleChange, { kind: "set" }> |
  (Omit<Extract<ProjectApprovalRuleChange, { kind: "set" }>, "scope"> & { readonly scope: ProjectApprovalRuleScope });

interface RuleControl {
  beforeEffect(): Promise<void>;
  assertCurrent(): void;
}

const active = (rule: ProjectApprovalRule) => rule.state === "active";
const scopeKey = (scope: ProjectApprovalRuleScope) => canonicalJsonText(scope, "null");
const ownerKey = (owner: ApprovalRuleOwner) => canonicalJsonText(owner, "null");
const revisionOf = (projectId: string, owner: ApprovalRuleOwner | undefined, rules: readonly ProjectApprovalRule[]) => createHash("sha256")
  .update(canonicalJsonText([projectId, owner ?? null, rules.map(rule => [rule.id, rule.revision, rule.scope, rule.requires_person])], "null")).digest("hex");
const fields = `id, project_id, scope_json, rule_order AS "order", requires_person, revision, state, created_by, created_at,
  reason, changed_by, changed_at, change_reason`;
const pageSize = 50;

function decodeRule({ scope_json, requires_person, ...row }: RuleRow): ProjectApprovalRule {
  let scope: ProjectApprovalRuleScope;
  try { scope = JSON.parse(scope_json) as ProjectApprovalRuleScope; }
  catch { throw new ActionError("actions.execution_failed", "项目审批规则无法读取"); }
  return { ...row, scope, requires_person: requires_person === null ? null : requires_person === 1 };
}

/** Apply the project's default, then allow the current object's owner to strengthen it. */
export function approvalRequiresPerson(snapshot: ProjectApprovalRules, object?: Extract<ProjectApprovalRuleScope, { owner: ApprovalRuleOwner }>,
  ancestors: readonly Readonly<{ kind: string; id: string }>[] = []): boolean {
  const applicable = snapshot.rules.filter(active);
  const defaults = applicable.flatMap(rule => rule.scope.kind === "project_default" && rule.requires_person !== null
    ? [{ owner: rule.scope.owner, requires_person: rule.requires_person }] : []);
  const project = defaults.filter(rule => !rule.owner).at(-1);
  const owns = (owner: ApprovalRuleOwner) => object && ownerKey(owner) === ownerKey(object.owner);
  const originalDefault = defaults.filter(rule => rule.owner && owns(rule.owner)).at(-1);
  return project?.requires_person === true || originalDefault?.requires_person === true || !!object && applicable.some(rule => {
    const scope = rule.scope;
    if (scope.kind === "project_default" || !rule.requires_person || !owns(scope.owner)) return false;
    const matches = (subject: Readonly<{ kind: string; id: string }>) => subject.kind === scope.subject.kind && subject.id === scope.subject.id;
    return matches(object.subject) || scope.kind === "ancestor_minimum" && ancestors.some(matches);
  });
}

/** The project library is supplied by the Host. The transaction may join an owner's existing write on that same connection. */
export function projectApprovalRules(db: SqliteDatabase, projectId: string) {
  const read = (includeHistory = true, owner?: ApprovalRuleOwner): ProjectApprovalRules => {
    const rows = db.prepare<[string], RuleRow>(`
      SELECT ${fields}
        FROM project_approval_rules WHERE project_id = ? ${includeHistory ? "" : "AND state = 'active'"} ORDER BY rule_order, id
    `).all(projectId);
    const rules = rows.map(decodeRule);
    const visible = owner ? rules.filter(rule => rule.scope.owner === undefined || ownerKey(rule.scope.owner) === ownerKey(owner)) : rules;
    return { revision: revisionOf(projectId, owner, visible.filter(active)), rules: visible };
  };
  const commit = (change: RuleChange, actorId: string, at: string, assertCurrent: () => void, owner?: ApprovalRuleOwner): ProjectApprovalRules => {
    if (!db.inTransaction) throw new ActionError("actions.forbidden", "审批规则需要在当前项目事务中保存");
    const current = read(false, owner);
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
    return read(false, owner);
  };
  return {
    read,
    page(cursor?: NonNullable<ProjectApprovalRulePage["next_cursor"]>): ProjectApprovalRulePage {
      const current = read(false);
      const query = `SELECT ${fields} FROM project_approval_rules WHERE project_id = ?`;
      const order = "ORDER BY rule_order DESC, id DESC LIMIT ?";
      const rows = cursor ? db.prepare<[string, number, string, number], RuleRow>(`${query} AND (rule_order, id) < (?, ?) ${order}`)
        .all(projectId, cursor.order, cursor.id, pageSize + 1)
        : db.prepare<[string, number], RuleRow>(`${query} ${order}`).all(projectId, pageSize + 1);
      const last = rows[pageSize - 1];
      return { revision: current.revision, rules: rows.slice(0, pageSize).map(decodeRule),
        project_default_requires_person: current.rules.filter(rule => rule.scope.kind === "project_default"
          && rule.scope.owner === undefined && rule.requires_person !== null).at(-1)?.requires_person === true,
        next_cursor: rows.length > pageSize && last ? { order: last.order, id: last.id } : null };
    },
    commit,
    async change(input: RuleChange, actorId: string, at: string, control: RuleControl) {
      const frozen = structuredClone(input);
      await control.beforeEffect();
      requireSynchronous(control.assertCurrent());
      return db.transaction(() => commit(frozen, actorId, at, control.assertCurrent)).immediate();
    },
  };
}
