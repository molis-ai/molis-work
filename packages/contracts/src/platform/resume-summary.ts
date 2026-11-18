import { inputSchemaFor } from "./action-input.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";
import type { ActionDefinition } from "./actions.js";

/**
 * Where a plugin's own work stands, for an outside Agent picking a session back up (batch 44 C7, contract-design §3). Any plugin may
 * answer it; the project connection tool gathers every one in the project and shows them by plugin. It is not an overview of the
 * project and derives no lifecycle facts: each plugin says, from its own records, what it would look at first and what comes next.
 */
export const RESUME_SUMMARY_INPUT_TYPE = /* @version type.molis.resume-summary.query "molis.resume-summary.query.v{version}" */ "molis.resume-summary.query.v1";
export const RESUME_SUMMARY_OUTPUT_TYPE = /* @version type.molis.resume-summary.view "molis.resume-summary.view.v{version}" */ "molis.resume-summary.view.v1";

/** One of the plugin's objects, as the summary names it. `open` has the shape of a subject context's `open`. */
export interface ResumeItem {
  subject: ActionSubject;
  title: string;
  /** What to do next with it, in the owner's words; empty when it says nothing. */
  next_hint: string;
  /** Where it stands, in the owner's words (「进行中」). */
  status_label: string;
  open: { surface: string; id: string };
}
export interface ResumeSummaryInput {
  /** What the host says it is working on (a terminal opened for an object). The owner answers it as the focus when it is one of its own. */
  focus?: ActionSubject;
}
export interface ResumeSummary {
  /** The section's heading: what the plugin calls its work. */
  title: string;
  /** What to look at first: the host's focus when it is the owner's, otherwise the owner's own pick; null when there is nothing. */
  focus: ResumeItem | null;
  /** What comes after, at most five. */
  next: ResumeItem[];
}

const text = { type: "string", maxLength: 2000 } as const;
const id = { type: "string", minLength: 1, maxLength: 200 } as const;
const RESUME_ITEM_SCHEMA = { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA, title: { ...text, maxLength: 500 }, next_hint: text, status_label: { type: "string", maxLength: 80 },
  open: { type: "object", properties: { surface: id, id }, required: ["surface", "id"], additionalProperties: false } },
  required: ["subject", "title", "next_hint", "status_label", "open"], additionalProperties: false } as const;
export const RESUME_SUMMARY_SCHEMAS = {
  input: inputSchemaFor<ResumeSummaryInput>()({ type: "object", properties: { focus: ACTION_SUBJECT_SCHEMA }, additionalProperties: false } as const),
  output: { type: "object", properties: { title: { ...id, maxLength: 120 }, focus: { anyOf: [{ type: "null" }, RESUME_ITEM_SCHEMA] }, next: { type: "array", maxItems: 5, items: RESUME_ITEM_SCHEMA } },
    required: ["title", "focus", "next"], additionalProperties: false },
} as const;

/** A plugin's resume summary over the object kinds it names: a query in the project, for the person, their Agents and MCP. */
export function defineResumeSummaryAction(capabilityId: string, version: number, kinds: string[], title: string, permissions: string[]): ActionDefinition<ResumeSummaryInput, ResumeSummary> {
  return { capability_id: capabilityId, version, operation: "query", action: { title,
    description: "读取本插件里的工作停在哪里、接着先看哪一项，给外部 Agent 接续会话用；只读，不推断新的状态。",
    kind: "query", scope: "project", audiences: ["user", "agent", "mcp"], permissions, subject_kinds: kinds,
    input_type: RESUME_SUMMARY_INPUT_TYPE, output_type: RESUME_SUMMARY_OUTPUT_TYPE, input_schema: RESUME_SUMMARY_SCHEMAS.input, output_schema: RESUME_SUMMARY_SCHEMAS.output } };
}

/** Whether an action is a resume summary, by its types. */
export const isResumeSummaryAction = (action: { input_type?: string; output_type?: string }): boolean =>
  action.input_type === RESUME_SUMMARY_INPUT_TYPE && action.output_type === RESUME_SUMMARY_OUTPUT_TYPE;
