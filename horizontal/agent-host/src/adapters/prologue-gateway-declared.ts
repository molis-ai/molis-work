import type { PackParameterBranches } from "@prologue/sdk";
import { actionEffect, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentFrozenRole } from "@molis-ai/molis-work-contracts/services/agent-host";

type Gateway = NonNullable<AgentFrozenRole["action_gateway"]>;

/** What read-capability, change-capability and change-reversible take: the exact identity find-capabilities returned, and the input. */
export const CAPABILITY_PARAMETERS = { type: "object", properties: {
  capability_id: { type: "string" }, version: { type: "integer" }, provider_id: { type: "string" },
  input: { type: ["object", "array", "string", "number", "boolean", "null"], description: "The capability's input as a JSON value (an object, not a string of JSON), shaped exactly by the input_schema find-capabilities returned; {} when that schema declares no properties." },
}, required: ["capability_id", "version", "provider_id"] };

/** What suggest-action takes: the button's words beside the same identity and input. */
export const SUGGEST_PARAMETERS = { type: "object", properties: {
  title: { type: "string", description: "The button's words, verb first, at most 40 characters, e.g. \"加入计划（3 项）\"." },
  summary: { type: "string", description: "What clicking does in the person's words: which object, which key values, dates with their day and time zone." },
  capability_id: { type: "string" }, version: { type: "integer" }, provider_id: { type: "string" },
  input: { type: ["object", "array", "string", "number", "boolean", "null"], description: "The full prepared JSON value matching input_schema from find-capabilities. For an object schema, put every required capability field INSIDE this object, including any field named title; the button title and summary do not supply business fields. Never send an empty string in place of an object." },
  editable: { type: "array", items: { type: "string" }, description: "Top-level input fields the person may adjust before running it." },
  missing: { type: "array", items: { type: "object", properties: { field: { type: "string" }, question: { type: "string" } }, required: ["field", "question"] }, description: "Required fields you could not fill, each with the question to ask." },
}, required: ["title", "summary", "capability_id", "version", "provider_id", "input"] };

/**
 * How much of what a round found is declared. The tools stay the same few (the Assistant's main round is at the
 * runtime's deferral limit, BL-145), so the found capabilities ride on their `input`: at most this many per tool, a
 * schema up to this size, and this much for all of them in one request. Past that the oldest found are left out;
 * they are still callable, and find-capabilities still shows their schema.
 */
const PER_TOOL = 12;
const PER_BRANCH = 8 * 1024;
const PER_REQUEST = 24 * 1024;
const KEPT = 48;

type Tool = "read-capability" | "change-capability" | "change-reversible" | "suggest-action";

/**
 * The capabilities this round found, declared on the tools that call them.
 *
 * A tool's `input` becomes one branch per found capability (its identity as the title, the directory's own
 * input_schema as the body) beside the generic value it was registered with. Nothing else changes: the runtime still
 * checks calls against the registration, and gatewayProblem still checks the input against the capability's contract
 * before any review. Found ones belong to this round: a new round, or the Host after a restart, starts with none.
 */
export function declaredCapabilities(gateway: Gateway) {
  const found = new Map<string, { view: ActionView; direct: boolean }>();
  let answer: ReadonlyMap<Tool, readonly Record<string, unknown>[]> | undefined;
  const fits = (tool: Tool, row: { view: ActionView; direct: boolean }) => {
    const reads = actionEffect(row.view.action, row.view.capability_id) === "read";
    if (tool === "read-capability") return reads;
    if (tool === "suggest-action") return !!gateway.client.offer;
    return gateway.operate && !reads && (tool === "change-capability" || row.direct);
  };
  const branch = ({ view }: { view: ActionView }): Record<string, unknown> =>
    ({ title: `${view.capability_id}@${view.version}`, description: `${view.provider.title} · ${view.action.title}`, ...view.action.input_schema });
  const allocate = (): ReadonlyMap<Tool, readonly Record<string, unknown>[]> => {
    const rows = [...found.values()];
    const tools: Tool[] = ["read-capability", "change-capability", "change-reversible", "suggest-action"];
    // Drop the oldest found until everything fits in one request.
    for (let from = 0; from < rows.length; from++) {
      const per = new Map(tools.map(tool => [tool, rows.slice(from).filter(row => fits(tool, row)).map(branch)
        .filter(one => JSON.stringify(one).length <= PER_BRANCH).slice(-PER_TOOL)] as const));
      if ([...per.values()].flat().reduce((bytes, one) => bytes + JSON.stringify(one).length, 0) <= PER_REQUEST) return per;
    }
    return new Map();
  };
  /** Found by find-capabilities and usable now (one that cannot run has no schema to call it with). */
  const note = (view: ActionView): void => {
    if (!view.availability.available) return;
    const key = JSON.stringify([view.capability_id, view.version, view.provider.provider_id]);
    // First found keeps its place, so a request's declaration changes only when something new is found.
    found.set(key, { view, direct: Boolean(gateway.client.direct?.(view)) });
    while (found.size > KEPT) found.delete(found.keys().next().value!);
    answer = undefined;
  };
  const parameterBranches: PackParameterBranches = tool => {
    answer ??= allocate();
    const list = answer.get(tool as Tool);
    return list?.length ? { input: list } : undefined;
  };
  return { note, parameterBranches };
}
