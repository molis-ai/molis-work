import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { Blueprint, BlueprintPart } from "@molis-ai/molis-work-contracts/platform/blueprints";
import type { EffectiveSetting, SettingEntryDeclaration, SettingsWriteInput } from "@molis-ai/molis-work-contracts/platform/settings";
import { blueprintsErrors, type BlueprintAdoptionPreviewResult, type BlueprintApplyStep, type BlueprintDraftResult,
  type BlueprintDraftSaveInput, type BlueprintLibraryInput, type BlueprintLibraryResult, type BlueprintOwnerReceipt, type UndoStep } from "@molis-ai/molis-work-contracts/services/blueprints";
import { canonicalJsonText, inspectBlueprint } from "@molis-ai/molis-work-plugin-sdk";
import { homeSqlitePath, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { BLUEPRINTS_BASELINE, BLUEPRINTS_STORE } from "./schema.js";

export interface SettingBinding {
  readonly provider_id: string;
  readonly project_scoped: boolean;
  readonly install_id?: string;
  readonly generation?: string;
  readonly read: BlueprintOwnerReceipt["action"];
  readonly write: BlueprintOwnerReceipt["action"];
}
export interface SettingPlan {
  binding: SettingBinding;
  key: string;
  layer: BlueprintPart["layer"];
  expected_revision: string;
  original_layer_revision?: string;
  applied_layer_revision?: string;
  apply_expected_revision?: string;
  undo_expected_revision?: string;
  previous: SettingsWriteInput["change"];
  change: SettingsWriteInput["change"];
}
export interface DiscoveredSetting {
  text_owner: string;
  model_selection?: true;
  entry: SettingEntryDeclaration;
  binding: SettingBinding;
  unavailable?: string;
  unavailable_reason?: "owner_disabled" | "sandbox_unsupported";
}
export interface ObservedSetting extends DiscoveredSetting {
  current: EffectiveSetting | undefined;
}
export interface StepRecord {
  part_id: string;
  plan: SettingPlan | null;
  apply: BlueprintApplyStep;
  undo: UndoStep | null;
  revision: number;
}
type Scope = Pick<ActionCallContext, "actor_id" | "project_id">;
type SavedPreview = BlueprintAdoptionPreviewResult;
type StoredAdoption = {
  preview_id: string; project_id: string | null; origin_project: string | null; preview_json: string;
  adoption_id: string | null; apply_request: string | null; selection_json: string | null;
  undo_request: string | null; undo_operation: "revert" | "remove" | null;
};
type StoredStep = { part_id: string; plan_json: string; apply_json: string; undo_json: string | null; revision: number };
// A personal adoption follows its actor. A newly created project may resume the specific adoption that created it.
const visible = "actor_id=? AND ((origin_project IS ? AND origin_detached=0) OR (adoption_id IS NOT NULL AND project_id=?) OR json_extract(preview_json,'$.target.kind')='personal')";
const scopeArgs = (scope: Scope) => [scope.actor_id, scope.project_id, scope.project_id] as const;
const missing = () => new ActionError("actions.missing", "在当前范围找不到这份场景记录");
const conflict = (message: string) => blueprintsErrors.step_conflict(message);

export class AdoptionStore {
  constructor(private readonly home: string) {}
  // Each operation is synchronous. Release the Home connection before calling another owner.
  private access<T>(fn: (db: ReturnType<typeof openBaselineHomeSqlite>) => T): T {
    const db = openBaselineHomeSqlite(this.home, BLUEPRINTS_STORE, BLUEPRINTS_BASELINE);
    try { return fn(db); } finally { db.close(); }
  }
  private transaction<T>(fn: (db: ReturnType<typeof openBaselineHomeSqlite>) => T): T {
    return this.access(db => {
      db.exec("BEGIN IMMEDIATE");
      try { const value = fn(db); db.exec("COMMIT"); return value; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    });
  }

  saveDraft(scope: Scope, input: BlueprintDraftSaveInput, locale: string): BlueprintDraftResult {
    const problems = inspectBlueprint(input.blueprint, { source: "draft" });
    if (problems.length) throw blueprintsErrors.part_unsupported(problems[0]!.path + " " + problems[0]!.reason);
    const draftId = "draft_id" in input ? input.draft_id : randomUUID();
    const revision = (input.expected_revision ?? 0) + 1;
    const body = JSON.stringify(input.blueprint);
    this.access(db => {
      if (input.expected_revision === null) {
        db.prepare("INSERT INTO blueprint_drafts (draft_id, actor_id, project_id, revision, locale, blueprint_json) VALUES (?, ?, ?, ?, ?, ?)")
          .run(draftId, scope.actor_id, scope.project_id, revision, locale, body);
      } else if (!db.prepare(`UPDATE blueprint_drafts SET revision=?, locale=?, blueprint_json=?
        WHERE draft_id=? AND actor_id=? AND project_id IS ? AND revision=?`)
        .run(revision, locale, body, draftId, scope.actor_id, scope.project_id, input.expected_revision).changes) {
        throw conflict("草稿已更改或不在当前范围，请重新读取");
      }
    });
    return { draft: { source: { kind: "draft", draft_id: draftId, revision }, blueprint: input.blueprint, locale } };
  }

  draft(scope: Scope, draftId: string): BlueprintDraftResult["draft"] {
    return this.access(db => {
      const row = db.prepare("SELECT revision, locale, blueprint_json FROM blueprint_drafts WHERE draft_id=? AND actor_id=? AND project_id IS ?")
        .get(draftId, scope.actor_id, scope.project_id) as { revision: number; locale: string; blueprint_json: string } | undefined;
      if (!row) throw missing();
      return { source: { kind: "draft", draft_id: draftId, revision: row.revision }, locale: row.locale, blueprint: JSON.parse(row.blueprint_json) as Blueprint };
    });
  }

  library(scope: Scope, filter: BlueprintLibraryInput): BlueprintLibraryResult {
    const handle = "adoption_id" in filter ? { by: "adoption_id", id: filter.adoption_id }
      : "preview_id" in filter ? { by: "preview_id", id: filter.preview_id } : undefined;
    return this.access(db => {
      const drafts = handle ? [] : db.prepare(`SELECT draft_id, revision, json_extract(blueprint_json,'$.title') AS title
        FROM blueprint_drafts WHERE actor_id=? AND project_id IS ? ORDER BY rowid DESC LIMIT 50`).all(scope.actor_id, scope.project_id);
      const records = db.prepare(`SELECT adoption_id, title_json, project_id, preview_id, apply_request, selection_json,
        ${handle ? "preview_json" : "NULL AS preview_json"} FROM adoptions WHERE ${visible}
        AND ${handle ? handle.by + "=?" : "adoption_id IS NOT NULL"} ORDER BY rowid DESC LIMIT 50`)
        .all(...scopeArgs(scope), ...(handle?.id ? [handle.id] : []));
      if (handle && !records.length) throw missing();
      return {
        drafts: drafts.map(row => ({ source: { kind: "draft", draft_id: String(row.draft_id), revision: Number(row.revision) }, title: JSON.parse(String(row.title)) })),
        adoptions: records.filter(row => row.adoption_id).map(row => ({ adoption_id: String(row.adoption_id), title: JSON.parse(String(row.title_json)),
          target: row.project_id ? { kind: "project", project_id: String(row.project_id) } : { kind: "personal" },
          request: { preview_id: String(row.preview_id), part_ids: JSON.parse(String(row.selection_json)), request_id: String(row.apply_request) } })),
        ...(handle && { preview: JSON.parse(String(records[0]!.preview_json)) }),
      };
    });
  }

  savePreview(scope: Scope, preview: SavedPreview, title: Blueprint["title"], plans: ReadonlyMap<string, SettingPlan>): void {
    this.transaction(db => {
      db.prepare("INSERT INTO adoptions (preview_id, actor_id, origin_project, project_id, preview_json, title_json) VALUES (?, ?, ?, ?, ?, ?)")
        .run(preview.preview_id, scope.actor_id, preview.target.kind === "personal" ? null : scope.project_id, preview.target.kind === "current_project" ? scope.project_id : null, JSON.stringify(preview), JSON.stringify(title));
      const add = db.prepare("INSERT INTO adoption_steps (preview_id, part_id, position, plan_json, apply_json) VALUES (?, ?, ?, ?, ?)");
      for (const [position, part] of preview.parts.entries()) {
        const initial: BlueprintApplyStep = { part_id: part.part_id, state: "not_started" };
        add.run(preview.preview_id, part.part_id, position, JSON.stringify(plans.get(part.part_id) ?? null), JSON.stringify(initial));
      }
    });
  }

  load(scope: Scope, by: "preview_id" | "adoption_id", id: string) {
    return this.access(db => {
      const row = db.prepare(`SELECT * FROM adoptions WHERE ${by}=? AND ${visible}`).get(id, ...scopeArgs(scope)) as StoredAdoption | undefined;
      if (!row) throw missing();
      const steps = db.prepare("SELECT part_id, plan_json, apply_json, undo_json, revision FROM adoption_steps WHERE preview_id=? ORDER BY position").all(row.preview_id) as StoredStep[];
      return { row, preview: JSON.parse(row.preview_json) as SavedPreview, steps: steps.map((step): StepRecord => ({
        part_id: step.part_id, plan: JSON.parse(step.plan_json), apply: JSON.parse(step.apply_json),
        undo: step.undo_json === null ? null : JSON.parse(step.undo_json), revision: step.revision,
      })) };
    });
  }

  start(scope: Scope, preview: SavedPreview, selected: string[], request: string, now: number): string {
    const choice = JSON.stringify([...selected].sort());
    return this.transaction(db => {
      const current = db.prepare(`SELECT origin_project, adoption_id, apply_request, selection_json FROM adoptions WHERE preview_id=? AND ${visible}`)
        .get(preview.preview_id, ...scopeArgs(scope)) as Pick<StoredAdoption, "origin_project" | "adoption_id" | "apply_request" | "selection_json"> | undefined;
      if (!current) throw missing();
      if (current.adoption_id) {
        if (current.apply_request !== request || current.selection_json !== choice) throw conflict("此预览已按另一组选择采用");
        return current.adoption_id;
      }
      if (Date.parse(preview.expires_at) <= now) throw blueprintsErrors.preview_expired("预览已过期，请重新查看");
      if (db.prepare("SELECT 1 FROM adoptions WHERE actor_id=? AND origin_project IS ? AND origin_detached=0 AND apply_request=?").get(scope.actor_id, current.origin_project, request))
        throw conflict("这次请求已用于其他预览");
      const adoptionId = randomUUID();
      const project = preview.target.kind === "new_project" ? "project-onboarding-" + randomUUID()
        : preview.target.kind === "current_project" ? scope.project_id : null;
      db.prepare("UPDATE adoptions SET adoption_id=?, project_id=?, apply_request=?, selection_json=? WHERE preview_id=?")
        .run(adoptionId, project, request, choice, preview.preview_id);
      return adoptionId;
    });
  }

  writeStep(previewId: string, step: StepRecord, outcome: BlueprintApplyStep | UndoStep, operation: "apply" | "undo"): boolean {
    return this.access(db => Boolean(db.prepare(`UPDATE adoption_steps SET ${operation === "apply" ? "apply_json" : "undo_json"}=?, plan_json=?, revision=revision+1
      WHERE preview_id=? AND part_id=? AND revision=?`).run(JSON.stringify(outcome), JSON.stringify(step.plan), previewId, step.part_id, step.revision).changes));
  }

  /** A second scene may have adopted the same explicit layer without writing a new owner revision. */
  sharedSetting(actor: string, project: string | null, previewId: string, plan: SettingPlan, current: Extract<EffectiveSetting, { state: "ok" }>): boolean {
    const scoped = plan.layer === "project" || plan.binding.project_scoped;
    const layerRevision = current.layer_revisions?.[plan.layer];
    return this.access(db => {
      const rows = db.prepare(`SELECT s.plan_json, a.project_id,
        COALESCE(json_extract(s.apply_json,'$.receipt.revision'),json_extract(s.plan_json,'$.expected_revision')) AS observed_revision FROM adoption_steps s JOIN adoptions a USING (preview_id)
        WHERE a.actor_id=? AND a.preview_id<>? AND a.adoption_id IS NOT NULL AND (?=0 OR a.project_id IS ?)
        AND json_extract(s.plan_json,'$.key')=? AND json_extract(s.plan_json,'$.layer')=?
        AND json_extract(s.apply_json,'$.state')='applied'
        AND (s.undo_json IS NULL OR json_extract(s.undo_json,'$.state') IN ('pending_verification','failed')
          OR json_extract(s.undo_json,'$.reason')='owner_unavailable')`).all(actor, previewId, Number(scoped), project, plan.key, plan.layer);
      return rows.some(row => {
        const other = JSON.parse(String(row.plan_json)) as SettingPlan;
        if (layerRevision !== undefined && other.applied_layer_revision !== undefined) {
          if (layerRevision !== other.applied_layer_revision) return false;
        } else if (project === row.project_id && current.revision !== row.observed_revision) return false;
        return canonicalJsonText(other.binding) === canonicalJsonText(plan.binding) && canonicalJsonText(other.change) === canonicalJsonText(plan.change);
      });
    });
  }

  startUndo(scope: Scope, adoptionId: string, op: "revert" | "remove", request: string): void {
    this.transaction(db => {
      const row = db.prepare(`SELECT undo_operation, undo_request FROM adoptions WHERE adoption_id=? AND ${visible}`)
        .get(adoptionId, ...scopeArgs(scope)) as Pick<StoredAdoption, "undo_operation" | "undo_request"> | undefined;
      if (!row) throw missing();
      if (row.undo_request === request && row.undo_operation !== op) throw conflict("这次请求已用于另一种操作");
      db.prepare("UPDATE adoptions SET undo_operation=?, undo_request=? WHERE adoption_id=?").run(op, request, adoptionId);
    });
  }

  clearProject(projectId: string): void {
    if (!existsSync(homeSqlitePath(this.home, BLUEPRINTS_STORE))) return;
    this.transaction(db => {
      db.prepare("DELETE FROM adoptions WHERE project_id=? OR (adoption_id IS NULL AND origin_project=?)").run(projectId, projectId);
      db.prepare("UPDATE adoptions SET origin_detached=1 WHERE origin_project=?").run(projectId);
      db.prepare("DELETE FROM blueprint_drafts WHERE project_id=?").run(projectId);
    });
  }
}
