/**
 * What a link hands on to the next station, fixed and saved before anything reaches it: the judgment rule a link can use, the rule run on the
 * step's content, and the handoff made by rule, template, model or the person. `createWorkflowsActionHandlers` binds `prepareHandoff` to
 * `workflows.instances.continue`; nothing here keeps state.
 */
import type { ActionDefinition, ActionExecutionContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { aiHandoffPrompt, applyFunctionRule, handoffKey, holdInstance, linkReadiness, parseAiHandoff,
  type WorkflowHandoff, type WorkflowInstance, type WorkflowLink, type WorkflowPayload, type WorkflowVerdict } from "./model.js";
import type { WorkflowContentPorts, WorkflowsActionPorts, workflowsActions } from "./actions.js";
import { withPending } from "./continuation.js";
import { firstCharacters } from "./bounded-cut.js";
import { workflowsErrors } from "./error.js";
import { labelOf, readStep, resolveStation, type Pending, type Reach, type RunScope } from "./step-runner.js";

type ContinueInput = (typeof workflowsActions.continue) extends ActionDefinition<infer I, unknown> ? I : never;
/** What preparing a handoff needs besides the write: whether the text model is usable, and the model call itself. */
export interface HandoffScope extends RunScope {
  readonly ports: Pick<WorkflowsActionPorts, "textModel" | "complete">;
}

/** A published Choice rule a link can use to decide whether content goes on. */
export interface WorkflowJudgmentChoice {
  readonly ref: { readonly capability_id: string; readonly version: number; readonly provider_id: string };
  readonly title: string;
  readonly description: string;
  readonly choices: readonly string[];
  readonly available: boolean;
  readonly reason?: string;
}

/** Choice rules come from the caller's directory: a published judgment whose result names a finite set of answers. */
export function workflowJudgmentChoices(directory: readonly ActionView[]): WorkflowJudgmentChoice[] {
  return directory.flatMap(view => {
    if (view.action.kind !== "judgment" || view.operation !== "command" || !view.action.audiences.includes("workflow")) return [];
    const data = (view.action.output_schema?.properties as Record<string, { properties?: Record<string, { enum?: unknown[] }> }> | undefined)?.data;
    const choices = data?.properties?.choice?.enum?.filter((value): value is string => typeof value === "string") ?? [];
    if (!choices.length) return [];
    return [{ ref: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, title: view.action.title,
      description: view.action.description, choices, available: view.availability.available,
      ...(view.availability.available ? {} : { reason: view.availability.reason }) }];
  });
}

/** Runs the link's exact rule on the step's content, with the caller's own authority; a changed or revoked rule stops here. */
async function judge(reach: Reach, link: WorkflowLink, handed: WorkflowPayload): Promise<WorkflowVerdict> {
  const ref = link.judgment!;
  const view = await reach.find(ref);
  if (!view) throw workflowsErrors.not_ready("这一段的判断规则已不可用或版本已变化；原引用已保留，请重新选择");
  if (!view.availability.available) throw workflowsErrors.not_ready(`这一段的判断规则暂不可用：${view.availability.reason}`);
  const content = firstCharacters([handed.title, handed.body].filter(Boolean).join("\n\n"), 8000);
  const result = await reach.invoke({ capability_id: ref.capability_id, version: ref.version, provider_id: ref.provider_id }, { content }) as
    { status: "ok" | "needs_review"; function_key: string; version: number; data: { choice?: string | null }; confidence: number | null };
  const choice = result.data?.choice ?? null;
  return { choice, status: result.status, passed: result.status === "ok" && !!choice && (link.pass ?? []).includes(choice),
    function_key: result.function_key, version: result.version, confidence: result.confidence ?? null };
}

/**
 * What this link hands on — by rule, template, model or the person — fixed and saved before anything reaches the next
 * station. A judgment that holds the content back stops the run instead.
 */
export async function prepareHandoff(scope: HandoffScope, caller: ActionExecutionContext, content: WorkflowContentPorts, reach: Reach, current: WorkflowInstance, from: number,
  input: ContinueInput): Promise<{ stopped: WorkflowInstance } | { instance: WorkflowInstance; pending: Pending }> {
  const resolved = { ...current.chain, stations: await Promise.all(current.chain.stations.map((station, index) => index < from ? station : resolveStation(reach, content, station))) };
  const link = current.chain.links[from]!;
  const readiness = linkReadiness(link, scope.ports.textModel());
  if (!readiness.ready) throw workflowsErrors.not_ready(`这一段还没接上：${readiness.reason}`);
  const handed = await readStep(content, current, from);
  let output: WorkflowPayload, actor: WorkflowHandoff["actor"], rule: string | undefined, judged: WorkflowVerdict | undefined;
  let validateModelAnswer: (() => void) | undefined;
  if (link.kind === "manual") {
    const edited = { title: [...(input.title ?? "").trim()].slice(0, 200).join(""), body: (input.body ?? "").trim() };
    if (!edited.title || !edited.body) throw workflowsErrors.invalid("交过去的内容需要标题和正文");
    const unchanged = edited.title === handed.title.trim() && edited.body === handed.body.trim();
    output = { ...handed, ...edited, feed_item_id: unchanged ? handed.feed_item_id ?? null : null };
    actor = "person";
  } else if (link.kind === "judgment") {
    // The rule only decides whether this content goes on; what goes on is the step's own content.
    const verdict = await judge(reach, link, handed);
    if (!verdict.passed) {
      const at = new Date().toISOString();
      const reason = verdict.status === "needs_review" ? "判断需要人确认，这一次没有交过去" : `判断结果是「${verdict.choice ?? "无"}」，不在可以交过去的结果里`;
      return { stopped: await scope.commit(caller, store => store.saveInstance(current, holdInstance(current, from, { at, reason, verdict }))) };
    }
    output = handed; actor = "judgment"; judged = verdict;
    rule = link.judgment!.title ?? link.judgment!.capability_id;
  } else if (link.kind === "function") {
    output = applyFunctionRule(link, handed);
    actor = "function";
    rule = `标题：${link.title_template || "{标题}"}\n正文：${link.body_template}`;
  } else {
    if (!scope.ports.complete) throw workflowsErrors.not_ready("这一段还没接上：还没有可用的文字模型");
    const prompt = aiHandoffPrompt(link, handed, await labelOf(content, current.chain.stations[from]!.plugin), await labelOf(content, current.chain.stations[from + 1]!.plugin));
    caller.signal?.throwIfAborted();
    const answer = await scope.ports.complete(prompt, { signal: caller.signal, beforeDispatch: caller.beforeEffect });
    output = parseAiHandoff(answer.text, handed);
    validateModelAnswer = answer.validateResult;
    actor = "ai";
    rule = link.instructions;
  }
  if (!output.body.trim()) throw workflowsErrors.invalid("交接后的正文是空的，没有交过去");
  const pending: Pending = { key: handoffKey(current, from), kind: link.kind, actor, at: new Date().toISOString(), input: handed, output,
    ...(rule ? { rule } : {}), ...(judged ? { verdict: judged } : {}) };
  // Losing a race here delivers nothing: the other call's fixed handoff wins.
  return { pending, instance: await scope.commit(caller, store => {
    // The model's answer is only kept while its original call and model binding are still current.
    validateModelAnswer?.();
    return store.saveInstance(current, { ...withPending(current, from, pending), chain: resolved });
  }) };
}
