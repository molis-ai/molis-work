import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorKind as actionErrorKindOf, actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import type { PlanningMethodPack } from "@molis-ai/molis-work-plugin-goals/contract";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions, personalPlanningActions } from "@molis-ai/molis-work-plugin-goals";
import { BUILTIN_PLANNING_METHOD_PACKS } from "./fixtures/goals-modules.js";
import { savePersonalMethod } from "./fixtures/personal-planning.js";

// T-050: the Home's Goals library stores the person's method packs as JSON in `personal_planning_method_packs`.
// A row that cannot be read must stop the read with the owner's "record unreadable" code, not quietly become "no such method".
const UNREADABLE = "goals.storage.record_unreadable";
const MARKER = "RAC-1495-personal-method-marker";
const user: ActionCallContext = { actor_id: "owner", actor_kind: "user", audience: "user", project_id: null,
  permissions: ["goals:read", "goals:write"], user_action: { source: "management", conversation_ref: "test://planning", message_ref: "test://personal-stored-json" } };
const { scope: _scope, created_at: _created, updated_at: _updated, ...method } = BUILTIN_PLANNING_METHOD_PACKS.find(pack => pack.method_id === "domain-software-development")!;

/** Saves the person's two methods through the Home's Goals half, exactly as the product does, then closes the Host. */
async function twoMethods(home: string): Promise<{ a: PlanningMethodPack; b: PlanningMethodPack }> {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const a = await savePersonalMethod(host, { ...method, method_id: "personal-a", name: "Method A" });
    const b = await savePersonalMethod(host, { ...method, method_id: "personal-b", name: "Method B" });
    return { a, b };
  } finally { await host.close(); }
}

/** The stored text of B's row is made unreadable while no Host is open, the way maintenance would find it broken. */
function breakStoredPack(home: string, methodId: string): void {
  const db = new DatabaseSync(join(home, "goals", "goals.db"));
  try { db.prepare("UPDATE personal_planning_method_packs SET pack_json = ? WHERE method_id = ?").run(`{"${MARKER}":`, methodId); }
  finally { db.close(); }
}

/** Every raw column of every stored row, ordered as the read orders them; `pack_json` stays the stored text, not parsed. */
function storedRows(home: string): unknown[] {
  const db = new DatabaseSync(join(home, "goals", "goals.db"), { readOnly: true });
  try { return db.prepare("SELECT * FROM personal_planning_method_packs ORDER BY method_id").all(); }
  finally { db.close(); }
}

/** The row's own SQLite rowid, as the location in the error names it (BL-821: short-lived, this database as it is now). */
function rowRef(home: string, methodId: string): string {
  const db = new DatabaseSync(join(home, "goals", "goals.db"), { readOnly: true });
  try { return String((db.prepare("SELECT rowid AS r FROM personal_planning_method_packs WHERE method_id = ?").get(methodId) as { r: number }).r); }
  finally { db.close(); }
}

/**
 * The record error as every exit carries it: the owner's code and kind, and where the broken cell is (table, column, rowid; BGE-05),
 * never the stored text or the method's id. Before 2026-11-09 the location was held back too; the user chose to show it.
 */
function unreadableAt(ref: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof ActionError, "读不出来的个人方法包应当抛 ActionError，而不是当成没有这个方法");
    assert.equal(error.code, UNREADABLE);
    assert.equal(error.kind, "internal");
    assert.equal(actionHttpStatus(error), 500, "记录读坏是 internal，通用 HTTP 出口给 500，不是 Home 暂时不可用的 503");
    assert.deepEqual(error.details, { storage: { table: "personal_planning_method_packs", column: "pack_json", row_ref: ref } });
    for (const leaked of [MARKER, "personal-b", "pack_json", "personal_planning_method_packs"]) assert.doesNotMatch(error.message, new RegExp(leaked));
    for (const leaked of [MARKER, "personal-b", "personal-a", "Method"]) assert.doesNotMatch(JSON.stringify(error.details), new RegExp(leaked));
    return true;
  };
}

test("RAC-1495: an unreadable personal method pack rejects the whole personal list with goals.storage.record_unreadable", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-personal-stored-json-"));
  try {
    const { b } = await twoMethods(home);
    breakStoredPack(home, b.method_id);
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try {
      const actions = bindActionClient(host.homeActionClient(), () => user);
      // 先红：改前这里正常返回（少一个方法），assert.rejects 报 Missing expected rejection。
      await assert.rejects(actions.invoke(personalPlanningActions.list, {}), unreadableAt(rowRef(home, b.method_id)));
    } finally { await host.close(); }
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("RAC-1496: saving over an unreadable personal library is refused and leaves every stored row's columns unchanged", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-personal-stored-json-save-"));
  try {
    const { b } = await twoMethods(home);
    breakStoredPack(home, b.method_id);
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try {
      const actions = bindActionClient(host.homeActionClient(), () => user);
      const before = storedRows(home);
      // 先采集再断言：两次保存的结果先存下，不在调用处断言；先比表，再比两次拒绝。
      const results: Array<{ rejected: boolean; error?: unknown }> = [];
      for (const target of [b.method_id, "personal-c"]) {
        try {
          await actions.invoke(personalPlanningActions.save, { method: { ...method, method_id: target, name: `Saved over ${target}` } });
          results.push({ rejected: false });
        } catch (error) { results.push({ rejected: true, error }); }
      }
      assert.deepEqual(storedRows(home), before, "读不出来时保存被拒，事务回滚，每一行逐列（含 pack_json 的原始文本）不变");
      assert.deepEqual(results.map(result => result.rejected), [true, true], "坏行同 id 与新 id 的保存都被拒");
      for (const result of results) {
        assert.ok(result.error instanceof ActionError);
        assert.equal(result.error.code, UNREADABLE);
        assert.equal(result.error.kind, "internal");
      }
    } finally { await host.close(); }
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("RAC-1497: after the unreadable pack is repaired, the personal list reads every method back and changed nothing on its own", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-personal-stored-json-repair-"));
  try {
    const { a, b } = await twoMethods(home);
    const before = storedRows(home);
    breakStoredPack(home, b.method_id);
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try {
      const actions = bindActionClient(host.homeActionClient(), () => user);
      // 先红：改前 list 正常返回（少一个方法），这一条也会红。
      await assert.rejects(actions.invoke(personalPlanningActions.list, {}), unreadableAt(rowRef(home, b.method_id)));
      const repaired = new DatabaseSync(join(home, "goals", "goals.db"));
      try {
        assert.equal(repaired.prepare("UPDATE personal_planning_method_packs SET pack_json = ? WHERE method_id = ?")
          .run(JSON.stringify(b), b.method_id).changes, 1, "维护人员把那一格改回原来的文本");
      } finally { repaired.close(); }
      const list = (await actions.invoke(personalPlanningActions.list, {})).methods as PlanningMethodPack[];
      assert.deepEqual(list.find(pack => pack.method_id === a.method_id), { ...a, overridden_scopes: [] }, "A 与保存时返回的相同");
      assert.deepEqual(list.find(pack => pack.method_id === b.method_id), { ...b, overridden_scopes: [] }, "B 与保存时返回的相同");
      const after = storedRows(home);
      const rowOf = (rows: unknown[], methodId: string) => (rows as Array<Record<string, unknown>>).find(row => row.method_id === methodId);
      assert.deepEqual(rowOf(after, a.method_id), rowOf(before, a.method_id), "A 的那一行从头到尾没变");
    } finally { await host.close(); }
  } finally { await rm(home, { recursive: true, force: true }); }
});

/** A project of `home`, and a Host whose availability check sees each dispatch first (`seen`), so a test can act at the Home read. */
async function projectHost(home: string, seen: (capabilityId: string) => void = () => {}) {
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Personal methods read", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const actionAvailability = (_caller: unknown, action: { capability_id: string }) => { seen(action.capability_id); return { available: true as const }; };
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability });
  const caller: ActionCallContext = { actor_id: "owner", actor_kind: "user", audience: "user", project_id: project.project_id,
    permissions: ["goals:read", "goals:write"], user_action: { source: "management", conversation_ref: "test://planning", message_ref: "test://project-read" } };
  return { host, project, actions: bindActionClient(host.actionClient(ref), () => caller) };
}

/** Every row of the project's planning and event-configuration tables, columns as stored. */
function projectRows(databasePath: string): Record<string, unknown[]> {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'planning_%' OR name LIKE 'goal_event_config%' OR name = 'goals') ORDER BY name").all() as Array<{ name: string }>).map(row => row.name);
    return Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()]));
  } finally { db.close(); }
}

test("BGE-01 BGE-04 BGE-07: a project reading the person's methods gets the Home's record error as it is; nothing is written; after repair it reads both", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-personal-stored-json-project-"));
  try {
    const { a, b } = await twoMethods(home);
    breakStoredPack(home, b.method_id);
    const { host, project, actions } = await projectHost(home);
    try {
      const ref = rowRef(home, b.method_id);
      const before = projectRows(project.database_path);
      // 先采集再断言：读、采用、快照的结果先存下。
      const read = await actions.invoke(goalsActions.planningRead, {}).then(() => null, (error: unknown) => error);
      const apply = await actions.invoke(goalsActions.planningApply, { method_id: a.method_id, user_confirmed: true }).then(() => null, (error: unknown) => error);
      const snapshot = await actions.invoke(goalsActions.snapshot, {});
      assert.deepEqual(projectRows(project.database_path), before, "采用被拒，项目库的规划与事件配置逐列不变");
      // 先红：改前项目侧把它改成 goals.planning.personal_unavailable / unavailable（503）。
      assert.ok(unreadableAt(ref)(read));
      assert.ok(unreadableAt(ref)(apply));
      assert.ok(Array.isArray(snapshot.goals), "不读个人方法的项目快照照常可读");

      const repaired = new DatabaseSync(join(home, "goals", "goals.db"));
      try { repaired.prepare("UPDATE personal_planning_method_packs SET pack_json = ? WHERE method_id = ?").run(JSON.stringify(b), b.method_id); }
      finally { repaired.close(); }
      const methods = (await actions.invoke(goalsActions.planningRead, {})).methods.map(method => method.method_id);
      assert.ok(methods.includes(a.method_id) && methods.includes(b.method_id), "修好那一格后，同一个 Host 的下一次读取两个方法都在");
    } finally { await host.close(); }
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("BGE-03: a call cancelled or revoked while it reads the Home is told so, never shown the broken record's location", async () => {
  const home = await mkdtemp(join(tmpdir(), "goals-personal-stored-json-fence-"));
  try {
    const { b } = await twoMethods(home);
    breakStoredPack(home, b.method_id);
    let atHome: (() => void) | null = null;
    const { host, actions } = await projectHost(home, capabilityId => { if (capabilityId === personalPlanningActions.list.capability_id) atHome?.(); });
    try {
      const outcomes: unknown[] = [];
      const cancelled = new AbortController();
      // 入口断开时平台以 actions.cancelled 中止信号（如 home-plugin-http、plugin-actions-client），这里照做。
      atHome = () => cancelled.abort(new ActionError("actions.cancelled", "调用已取消"));
      outcomes.push(await actions.invoke(goalsActions.planningRead, {}, { beforeEffect: () => {}, signal: cancelled.signal }).then(() => null, (error: unknown) => error));
      let revoked = false;
      atHome = () => { revoked = true; };
      const assert_authority_current = () => { if (revoked) throw new ActionError("actions.forbidden", "这次调用的授权已撤回"); };
      outcomes.push(await actions.invoke(goalsActions.planningRead, {}, { beforeEffect: () => {}, assert_authority_current }).then(() => null, (error: unknown) => error));
      atHome = null;
      const [cancel, revoke] = outcomes as ActionError[];
      assert.equal(cancel?.code, "actions.cancelled", "取消照旧是取消，保留信号的中止原因");
      assert.equal(actionErrorKindOf(cancel), "cancelled");
      assert.equal(revoke?.code, "actions.forbidden", "撤权按原拒绝落码");
      for (const error of [cancel, revoke]) assert.doesNotMatch(JSON.stringify((error as { details?: unknown })?.details ?? null), /storage|personal_planning/, "坏行的位置没有交给已取消或已撤权的调用");
      assert.ok(unreadableAt(rowRef(home, b.method_id))(await actions.invoke(goalsActions.planningRead, {}).then(() => null, (error: unknown) => error)), "同一个 Host 上仍有效的调用照常拿到记录错误");
    } finally { await host.close(); }
  } finally { await rm(home, { recursive: true, force: true }); }
});
