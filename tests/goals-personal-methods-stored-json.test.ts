import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { personalPlanningActions } from "@molis-ai/molis-work-plugin-goals";
import { BUILTIN_PLANNING_METHOD_PACKS } from "./fixtures/goals-modules.js";
import { savePersonalMethod } from "./fixtures/personal-planning.js";

// T-050 / BL-820: the Home's Goals library stores the person's method packs as JSON in `personal_planning_method_packs`.
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

/** The stored text of B's row is made unreadable while no Host is open, the way a maintenance people would find it broken. */
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

function unreadable(error: unknown): void {
  assert.ok(error instanceof ActionError, "读不出来的个人方法包应当抛 ActionError，而不是当成没有这个方法");
  assert.equal(error.code, UNREADABLE);
  assert.equal(error.kind, "internal");
  for (const leaked of [MARKER, "personal-b", "pack_json", "personal_planning_method_packs"]) {
    assert.doesNotMatch(error.message, new RegExp(leaked));
    assert.doesNotMatch(JSON.stringify(error.details ?? null), new RegExp(leaked));
  }
  return true;
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
      await assert.rejects(actions.invoke(personalPlanningActions.list, {}), unreadable);
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
      await assert.rejects(actions.invoke(personalPlanningActions.list, {}), unreadable);
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
