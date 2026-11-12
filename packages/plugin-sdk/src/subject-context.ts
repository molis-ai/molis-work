import { isRecord } from "./json-value.js";
import { cutHead } from "./whole-units.js";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { UI_SUBJECT_CONTEXT_KINDS, UI_SUBJECT_CONTEXT_LIMIT, type UiSubjectContextKind } from "@molis-ai/molis-work-contracts/platform/plugin";
import { settingsReadActions } from "./view-placement-declarations.js";

// Text a plugin gives about another owner's object, for the person's own page (`ui.subject_context`, BL-911): the Manifest check, the
// read the Host calls for one kind, and the answer the page receives. Shared by the Manifest parser and the Host, so the two agree.

const KINDS: ReadonlySet<string> = new Set(UI_SUBJECT_CONTEXT_KINDS);
const READ_RULE = "本 Manifest 没有这个只读、面向用户（audience user）、只有一个版本的查询动作";

/** The refusals for `ui.subject_context`. Never throws. */
export function subjectContextProblems(parsed: PluginManifest): string[] {
  const declared: unknown = (parsed.ui as { subject_context?: unknown }).subject_context;
  if (declared === undefined) return [];
  if (!Array.isArray(declared) || declared.length === 0) return ["ui.subject_context 必须是非空数组"];
  const readables = settingsReadActions(parsed), seen = new Set<string>(), problems: string[] = [];
  for (const entry of declared) {
    if (!isRecord(entry) || Object.keys(entry).some(key => key !== "subject_kind" && key !== "action")) {
      problems.push("ui.subject_context 的每一项只写 subject_kind 与 action");
      continue;
    }
    const { subject_kind: kind, action } = entry;
    if (typeof kind !== "string" || !KINDS.has(kind)) {
      problems.push(`ui.subject_context 的 subject_kind 只能是 ${[...KINDS].join("、")}`);
      continue;
    }
    if (seen.has(kind)) problems.push(`ui.subject_context 重复声明了 ${kind}`);
    seen.add(kind);
    if (typeof action !== "string" || !readables.has(action)) problems.push(`ui.subject_context 的 ${kind} 指向 ${String(action)}，${READ_RULE}`);
  }
  return problems;
}

/** The Manifest's own read that gives text about one kind of object, or undefined when it declares none. */
export function subjectContextAction(manifest: PluginManifest, kind: UiSubjectContextKind): ActionDefinition | undefined {
  const declared = manifest.ui.subject_context?.find(entry => entry.subject_kind === kind);
  return declared ? manifest.actions?.find(action => action.capability_id === declared.action) : undefined;
}

/** The input the Host gives that read: exactly the object's id, under `<kind>_id`. */
export function subjectContextInput(kind: UiSubjectContextKind, id: string): Readonly<Record<string, string>> {
  return { [`${kind}_id`]: id };
}

/** A plugin's answer as the person's page receives it: its text, cut to the limit and marked, or null for anything else. */
export function subjectContextText(answer: unknown): string | null {
  if (!isRecord(answer) || typeof answer.source_context !== "string") return null;
  const text = answer.source_context.trim();
  if (!text) return null;
  return text.length <= UI_SUBJECT_CONTEXT_LIMIT ? text : `${cutHead(text, UI_SUBJECT_CONTEXT_LIMIT - 1)}…`;
}
