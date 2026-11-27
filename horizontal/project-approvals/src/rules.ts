import { createHash, randomUUID } from "node:crypto";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ApprovalRuleOwner, ProjectApprovalRule, ProjectApprovalRuleChange, ProjectApprovalRulePage, ProjectApprovalRules, ProjectApprovalRuleScope } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { canonicalJsonText, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";

type RuleRow = Omit<ProjectApprovalRule, "scope" | "requires_person"> & { scope_json: string; requires_person: 0 | 1 | null; row_ref: string };
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
const fields = `id, project_id, scope_json, CAST(rowid AS TEXT) AS row_ref, rule_order AS "order", requires_person, revision, state, created_by, created_at,
  reason, changed_by, changed_at, change_reason`;
const pageSize = 50;

const named = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const fieldsMatch = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));

export function isApprovalRuleScope(scope: unknown): scope is ProjectApprovalRuleScope {
  if (!isRecord(scope)) return false;
  const owner = scope.owner, subject = scope.subject;
  if (owner !== undefined && (!isRecord(owner) || (owner.kind === "system"
    ? !fieldsMatch(owner, ["kind", "provider_id"]) || !named(owner.provider_id)
    : owner.kind !== "plugin" || !fieldsMatch(owner, ["kind", "plugin_id", "publisher_signature"]) || !named(owner.plugin_id) || !named(owner.publisher_signature)))) return false;
  if (scope.kind === "project_default") return fieldsMatch(scope, owner === undefined ? ["kind"] : ["kind", "owner"]);
  return (scope.kind === "object" || scope.kind === "ancestor_minimum") && owner !== undefined
    && fieldsMatch(scope, ["kind", "owner", "subject"]) && isRecord(subject) && fieldsMatch(subject, ["kind", "id"])
    && named(subject.kind) && named(subject.id);
}

function decodeRule({ scope_json, requires_person, row_ref, ...row }: RuleRow): ProjectApprovalRule {
  let scope: unknown;
  try { scope = JSON.parse(scope_json); } catch { scope = undefined; }
  if (!isApprovalRuleScope(scope)) throw new ActionError("actions.execution_failed", "项目审批规则无法读取", {
    kind: "internal",
    details: { storage: { table: "project_approval_rules", column: "scope_json", row_ref } },
  });
  return { ...row, scope, requires_person: requires_person === null ? null : requires_person === 1 };
}

/** Apply the project's default, then allow the current object's owner to strengthen it. */
export function approvalRequiresPerson(snapshot: ProjectApprovalRules, object?: Extract<ProjectApprovalRuleScope, { owner: ApprovalRuleOwner }>,
  ancestors: readonly Readonly<{ kind: string; id: string }>[] = []): boolean {
  const applicable = snapshot.rules.filter(active);
  const defaults = applicable.flatMap(rule => rule.scope.kind === "project_default" && rule.requires_person !== null
    ? [{ owner: rule.scope.owner, requires_person: rule.requires_person }] : []);
  const projectRequiresPerson = defaults.some(rule => !rule.owner && rule.requires_person === true);
  const owns = (owner: ApprovalRuleOwner) => object && ownerKey(owner) === ownerKey(object.owner);
  const ownerDefaultRequiresPerson = defaults.some(rule => rule.owner && owns(rule.owner) && rule.requires_person === true);
  return projectRequiresPerson || ownerDefaultRequiresPerson || !!object && applicable.some(rule => {
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
      if (!isApprovalRuleScope(change.scope)) throw new ActionError("actions.input_invalid", "审批规则的范围不明");
      const scope = scopeKey(change.scope);
      const { last } = db.prepare<[string], { last: number }>(`SELECT coalesce(max(rule_order), 0) AS last
        FROM project_approval_rules WHERE project_id = ?`).get(projectId)!;
      if (!Number.isSafeInteger(last + 1)) throw new ActionError("actions.conflict", "项目审批规则已达到可保存数量上限");
      db.prepare(`UPDATE project_approval_rules SET state = 'replaced', revision = revision + 1,
        changed_by = ?, changed_at = ?, change_reason = ? WHERE project_id = ? AND scope_json = ? AND state = 'active'`)
        .run(actorId, at, change.reason, projectId, scope);
      db.prepare(`INSERT INTO project_approval_rules
        (id, project_id, scope_json, rule_order, requires_person, revision, state, created_by, created_at, reason)
        VALUES (?, ?, ?, ?, ?, 1, 'active', ?, ?, ?)`)
        .run(randomUUID(), projectId, scope, last + 1, change.requires_person ? 1 : 0, actorId, at, change.reason);
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
        project_default_requires_person: current.rules.some(rule => rule.scope.kind === "project_default"
          && rule.scope.owner === undefined && rule.requires_person === true),
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
