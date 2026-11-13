import { GOAL_MATERIAL_SNAPSHOT_SOURCE } from "../contract/goal-inputs.js";

import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/**
 * A Goal's inputs in one place (specs/artifact-positioning 五.1, 「合成一种入口」): materials it follows as they change
 * (bound work objects) and versions it fixed (成果 taken as input), one list and one 「加输入」. New materials can still be
 * created straight into the project; plugin objects are filled in by the placement client from their owners. A source an assistant,
 * an Agent, a workflow or an MCP client only proposed reads 「待确认」 and carries 「认可」 and 「移除」: the person decides it here.
 */
interface GoalInputsItem {
  readonly goal: { readonly goal_id: string };
  readonly input_bindings: ReadonlyArray<{ readonly binding_id: string; readonly source_type: string; readonly source_ref: string; readonly input_name: string;
    readonly state: string; readonly reason: string; readonly snapshot_digest?: string | null }>;
  /** Versions in the 成果库 this Goal takes as input (`goal.input`). */
  readonly artifact_inputs?: ReadonlyArray<{ readonly artifact_id: string; readonly version: number; readonly title: string;
    readonly state: "available" | "unavailable" | "archived" | "missing"; readonly reason: string | null }>;
}

interface GoalInputsPrimitives {
  readText: (text: string, values?: Record<string, string | number>) => string;
  escapeHtml: (value: unknown) => string;
  renderReference: (value: string, label?: string) => string;
}

/** A kind the project can make new for a Goal: a station of a plugin it shows, with the title that plugin's view declares (`creates`). */
export interface GoalInputsCreatableKind {
  readonly station: string;
  readonly title: string;
  readonly label?: string;
  /** The plugin that declared the create station. */
  readonly plugin_id: string;
}

export function renderGoalInputsHtml(item: GoalInputsItem, { escapeHtml, renderReference }: GoalInputsPrimitives, creatable: readonly GoalInputsCreatableKind[]): string {
  const goalId = escapeHtml(item.goal.goal_id);
  const goalRoute = escapeHtml(`/api/plugins/io.molis.work.goals/goals/${encodeURIComponent(item.goal.goal_id)}`);
  const follows = `<span class="goal-input-mode" data-goal-input-mode="live">${uiText("goals.inputs.follow-original")}</span>`;
  const live = item.input_bindings.filter((binding) => binding.state !== "inactive").map((binding) => {
    // The buttons carry what they ask of the Goal's own route and what to say when it fails; one client handler serves them (placement.ts).
    const decide = (action: "accept" | "remove", label: string, fail: string, done = "") => `<button type="button" class="mw-btn mw-btn--${action === "accept" ? "secondary" : "ghost"} mw-btn--sm" data-goal-input-${action === "accept" ? "accept" : "release"} data-goal-input-post="${goalRoute}/inputs" data-goal-input-body="${escapeHtml(JSON.stringify({ binding_id: binding.binding_id, action }))}" data-goal-input-fail="${escapeHtml(fail)}"${done ? ` data-goal-input-done="${escapeHtml(done)}"` : ""}>${escapeHtml(label)}</button>`;
    // A version of a project-folder file the platform's materials service fixed: the Goal keeps only its version; the placement client asks
    // whether the person can still read it, and nothing of its path is on the page.
    if (binding.source_type === GOAL_MATERIAL_SNAPSHOT_SOURCE) {
      return `<article class="placement-goal-material goal-input-fixed" data-goal-material-snapshot="${escapeHtml(binding.source_ref)}"><div><strong>${escapeHtml(binding.input_name)}</strong><span class="goal-input-mode" data-goal-input-mode="fixed">${uiText("goals.inputs.fixed-this-version")}</span><small data-goal-material-snapshot-state></small></div><span class="placement-goal-material-actions">${decide("remove", uiText.text("goals.inputs.remove"), uiText.text("goals.inputs.couldn-t-remove"))}</span></article>`;
    }
    if (binding.source_type === "plugin_object") {
      let subject: [string, string] | null = null;
      try { const value = JSON.parse(binding.source_ref); if (Array.isArray(value) && value.length === 2) subject = [String(value[0]), String(value[1])]; } catch { subject = null; }
      if (!subject) return "";
      return `<article class="placement-goal-material" data-placement-material data-placement-kind="${escapeHtml(subject[0])}" data-placement-id="${escapeHtml(subject[1])}" data-placement-binding="${escapeHtml(binding.binding_id)}" data-goal-input-digest="${escapeHtml(binding.snapshot_digest ?? "")}" data-goal-id="${goalId}"><div><strong>${escapeHtml(binding.input_name)}</strong>${follows}<small data-placement-material-state>${escapeHtml(uiText.text("goals.inputs.loading"))}</small></div><span class="placement-goal-material-actions"></span></article>`;
    }
    const pending = binding.source_type === "feed_item" && binding.state === "proposed";
    const stated = { proposed: uiText.text("goals.inputs.pending-confirmation"), confirmed: uiText.text("goals.inputs.confirmed") }[binding.state] ?? binding.state;
    return `<article class="placement-goal-material" data-goal-input-binding="${escapeHtml(binding.binding_id)}"><div>${renderReference(binding.source_ref, binding.input_name)}<span class="goal-input-mode" data-goal-input-state="${escapeHtml(binding.state)}">${escapeHtml(stated)}</span><small>${escapeHtml(binding.reason)}${binding.snapshot_digest ? ` · ${escapeHtml(binding.snapshot_digest)}` : ""}</small></div>${pending ? `<span class="placement-goal-material-actions">${decide("accept", uiText.text("goals.inputs.accept-input"), uiText.text("goals.inputs.couldn-t-accept"), uiText.text("goals.inputs.confirmed"))}${decide("remove", uiText.text("goals.inputs.remove"), uiText.text("goals.inputs.couldn-t-remove"))}</span>` : ""}</article>`;
  });
  const fixed = (item.artifact_inputs ?? []).map((input) => {
    const path = `/artifacts/${encodeURIComponent(input.artifact_id)}/versions/${input.version}`;
    // The reference stays when the version cannot be read; it is never swapped for a later one.
    const note = { available: "", unavailable: uiText.text("goals.inputs.version-unavailable"), archived: uiText.text("goals.inputs.version-archived"), missing: uiText.text("goals.inputs.version-can-t-be-found") }[input.state];
    return `<article class="placement-goal-material goal-input-fixed" data-goal-input-fixed><div><a href="#" data-workbench-item-plugin="artifacts" data-workbench-item-id="${escapeHtml(path)}" data-workbench-item-title="${escapeHtml(input.title)}"><strong>${escapeHtml(input.title)}</strong></a><span class="goal-input-mode" data-goal-input-mode="fixed">${escapeHtml(uiText.text("goals.inputs.fixed-version-version", { version: input.version }))}</span>${note ? `<small>${escapeHtml([note, input.reason].filter(Boolean).join(" · "))}</small>` : ""}</div><span class="placement-goal-material-actions"><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-goal-input-remove data-goal-input-post="${goalRoute}/artifact-inputs" data-goal-input-body="${escapeHtml(JSON.stringify({ reference: { artifact_id: input.artifact_id, version: input.version }, used: false }))}" data-goal-input-fail="${escapeHtml(uiText.text("goals.inputs.couldn-t-remove"))}">${uiText("goals.inputs.remove")}</button></span></article>`;
  });
  const rows = [...live, ...fixed].join("");
  // The button carries the declared title; the placement client names a new object and its card from it, so no table by plugin lives there.
  const create = creatable.map(({ station, title, label }) => `<button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-placement-create="${escapeHtml(station)}" data-placement-create-title="${escapeHtml(title)}" data-goal-id="${goalId}">${escapeHtml(label ?? title)}</button>`).join("");
  return `<section class="placement-goal-materials" data-placement-goal-materials data-goal-inputs data-goal-id="${goalId}"><h3>${uiText("goals.inputs.inputs")}</h3>
    <div class="placement-goal-create"><button type="button" class="mw-btn mw-btn--primary mw-btn--sm" data-goal-input-add data-goal-id="${goalId}">${uiText("goals.inputs.add-input")}</button><span>${uiText("goals.inputs.create-goal")}</span>${create}</div>
    ${rows ? `<div class="bound-list">${rows}</div>` : `<p class="empty-row">${uiText("goals.inputs.no-inputs-yet")}</p>`}
    <p class="placement-goal-hint">${uiText("goals.inputs.follow-original-goal-sees-now-fix-version-goal")}</p></section>`;
}
