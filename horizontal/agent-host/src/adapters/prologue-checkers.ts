import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { CheckRequest, CheckerResult, ConditionCheckers, HeldWait, Runtime } from "@prologue/sdk";
import { actionEffect, platformErrorKind, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionClient, AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import { ownedConditionChecks, type OwnedConditionChecker } from "./prologue-owned-checkers.js";

/**
 * The checkers a step may wait on (specs/prologue-adoption §4.6.8): something outside the runtime, looked at by the Host
 * on the SDK's bounded schedule, never through a model. Both only look. Every look is checked again against the round
 * that registered the wait: its own check (its plugin instance, its Character), its actions through the action service,
 * its directory. What the round could not do now is refused, and the SDK stops looking and holds the step for a person.
 */
export const ACTION_QUERY_CHECKER = { id: "molis.action-query", version: "1" } as const;
const FILE_PRESENT_CHECKER = { id: "molis.file-present", version: "1" } as const;

const REFUSED = agentErrors.collaboration_check_refused("").code;
const NOT_READ = agentErrors.collaboration_check_not_read("").code;

/** What a round leaves for the looks at the waits it registers. Kept in memory: after a restart there is none, and a look is refused. */
interface RoundCheckAuthority {
  readonly session_id: string;
  /** The round's own check before anything leaves for it (its plugin instance, its Character); none for a trusted Host start. */
  readonly beforeDispatch?: () => void | Promise<void>;
  /** The round's action client: every look finds and calls the action through it, with the round's grant. */
  readonly actions?: { readonly client: AgentActionClient };
  /** The round's action tools by the name the model calls them (`actionToolRefs`, prologue-action-tools.ts); a name outside it is refused. */
  readonly tools?: Promise<ReadonlyMap<string, ExactActionReference>>;
  /** The round's authorized directory. */
  readonly root_path?: string;
}

/** What a work's authority gives the looks at the jobs it follows: its own check and its action client, as it is now. */
type WorkCheckAuthority = Pick<RoundCheckAuthority, "beforeDispatch"> & Required<Pick<RoundCheckAuthority, "actions">>;

/** What the Host answers for the checks. */
export interface PrologueCheckPorts {
  /** Whether this directory is still authorized for the project now. */
  directoryAuthorized?(projectId: string, path: string): Promise<boolean>;
  /** The project's workspace at this directory, authorized with its real path verified now, for its after-write checks; none when it is not. */
  workspaceAt?(projectId: string, path: string): Promise<string | undefined>;
  /** Narrow, read-only owner checks whose current grants can be proven from durable domain facts. */
  owned?: readonly OwnedConditionChecker[];
  /**
   * The authority of the work that follows the job a Host wait hangs on (§6.0o; the step on that work's graph names
   * it): asked on every look, since no round registered that wait. None when the work is gone. Given when the Host is
   * assembled, so it is there for the first look after a restart.
   */
  workAuthority?(at: { graph_id: string; node_id: string }): Promise<WorkCheckAuthority | undefined>;
}

/**
 * The name a Host wait gives the status query of a job it follows: the exact reference itself. A round's tool names come
 * from its own table and never take this form, so a model cannot name an action through it.
 */
const JOB_QUERY = "molis-job-query:";
export const jobQueryTool = (ref: ExactActionReference) => `${JOB_QUERY}${JSON.stringify([ref.provider_id, ref.capability_id, ref.version])}`;
const jobQueryRef = (tool: unknown): ExactActionReference | undefined => {
  if (typeof tool !== "string" || !tool.startsWith(JOB_QUERY)) return undefined;
  try {
    const [provider_id, capability_id, version] = JSON.parse(tool.slice(JOB_QUERY.length)) as unknown[];
    return typeof provider_id === "string" && typeof capability_id === "string" && Number.isSafeInteger(version) ? { provider_id, capability_id, version: version as number } : undefined;
  } catch { return undefined; }
};

type Look = (round: Remembered, params: unknown, signal: AbortSignal) => Promise<CheckerResult>;
interface Remembered extends RoundCheckAuthority {
  readonly started_at_ms: number;
  /** A job the work follows: its owner declares only what done and failed are, so any other state is not yet. */
  readonly anyOtherPending?: true;
}

const refused = (code: string, note: string): CheckerResult => ({ status: "unknown", refused: { code }, note });
/** The error's own code when it is one; else the given one. */
const codeOf = (error: unknown, fallback: string) => {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && /^[a-z][a-z0-9_]*\.[a-z0-9_.]+$/.test(code) ? code : fallback;
};
/** An answer that says the caller may not do this (any more): the look is refused, not unknown. */
const notAllowed = (error: unknown) => {
  const code = (error as { code?: unknown } | undefined)?.code, kind = (error as { kind?: unknown } | undefined)?.kind;
  return kind === "forbidden" || typeof code === "string" && platformErrorKind(code) === "forbidden";
};
const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const words = (value: unknown, min: number, max: number) => Array.isArray(value) && value.length >= min && value.length <= max
  && value.every(item => typeof item === "string" && item.length >= 1 && item.length <= 100);

/** `molis.action-query@1`: one of the round's action tools by its name, its input, where its answer says the state, and which states count as what. */
function actionQueryProblem(params: unknown): string | undefined {
  if (!object(params) || !onlyKeys(params, ["tool", "input", "status"])) return "takes { tool, input?, status }";
  if (typeof params.tool !== "string" || !params.tool || params.tool.length > 200) return "tool is the name of one of this round's action tools, as you call it";
  const status = params.status;
  if (!object(status) || !onlyKeys(status, ["path", "satisfied", "failed", "pending"])) return "status is { path, satisfied, failed?, pending? }";
  if (!Array.isArray(status.path) || status.path.length > 8 || !status.path.every(part => typeof part === "string" && part.length >= 1 && part.length <= 64)) return "status.path is a JSON array of field names, like [\"state\"] (at most 8)";
  if (!words(status.satisfied, 1, 20) || status.failed !== undefined && !words(status.failed, 0, 20) || status.pending !== undefined && !words(status.pending, 0, 20)) return "status.satisfied, failed and pending are JSON arrays of states, like [\"done\"] (satisfied has at least one; at most 20 each)";
  const all = [...status.satisfied as string[], ...(status.failed as string[] | undefined ?? []), ...(status.pending as string[] | undefined ?? [])];
  return new Set(all).size === all.length ? undefined : "a state is in one list only";
}

/** `molis.file-present@1`: a file under the round's directory, an optional marker that says it is complete, and one that says it failed. */
function filePresentProblem(params: unknown): string | undefined {
  if (!object(params) || !onlyKeys(params, ["path", "marker", "failed_marker", "non_empty"])) return "takes { path, marker?, failed_marker?, non_empty? }";
  for (const key of ["path", "marker", "failed_marker"] as const) {
    const value = params[key];
    if (value === undefined && key !== "path") continue;
    if (typeof value !== "string" || !value || value.length > 400 || value.includes("\0") || isAbsolute(value) || value.startsWith("~")
      || value.split(/[\\/]/).includes("..")) return `${key} is a path inside the round's directory`;
  }
  return params.non_empty === undefined || typeof params.non_empty === "boolean" ? undefined : "non_empty is true or false";
}

const states = (min: number, description: string) => ({ type: "array", items: { type: "string", minLength: 1, maxLength: 100 }, minItems: min, maxItems: 20, description }) as const;
const insidePath = (description: string) => ({ type: "string", minLength: 1, maxLength: 400, description }) as const;

/**
 * Each checker's parameters as a JSON schema, in the subset the SDK checks: the model sees them on `board-wait`, and the SDK
 * refuses parameters that do not match before the checker's own rules above look (specs/prologue-adoption §6.0e).
 */
const PARAMS = new Map<string, Readonly<Record<string, unknown>>>([
  [ACTION_QUERY_CHECKER.id, {
    type: "object",
    description: "One of this round's read-only query action tools, asked again until its answer says a state.",
    properties: {
      tool: { type: "string", minLength: 1, maxLength: 200, description: "The action tool's name itself, as you call it (molis-action-…)." },
      input: { type: "object", description: "The tool's input, as you would call it." },
      status: {
        type: "object",
        description: "Where the answer says its state, and which states count as what. A state is in one list only.",
        properties: {
          path: { type: "array", items: { type: "string", minLength: 1, maxLength: 64 }, maxItems: 8, description: "Field names leading to the state in the answer, like [\"state\"]." },
          satisfied: states(1, "States that mean the wait is over."),
          failed: states(0, "States that mean it failed."),
          pending: states(0, "States that mean not yet."),
        },
        required: ["path", "satisfied"],
        additionalProperties: false,
      },
    },
    required: ["tool", "status"],
    additionalProperties: false,
  }],
  [FILE_PRESENT_CHECKER.id, {
    type: "object",
    description: "A file under the round's directory, written after the round started.",
    properties: {
      path: insidePath("The file, relative to the round's directory."),
      marker: insidePath("A file that says it is complete, relative to the round's directory."),
      failed_marker: insidePath("A file that says it failed, relative to the round's directory."),
      non_empty: { type: "boolean", description: "Whether an empty file does not count yet." },
    },
    required: ["path"],
    additionalProperties: false,
  }],
]);

const sameRef = (view: Pick<ActionView, "capability_id" | "version" | "provider">, ref: ExactActionReference) =>
  view.capability_id === ref.capability_id && view.version === ref.version && view.provider.provider_id === ref.provider_id;

/** The action behind one of the round's tool names, as the round may call it now: found through the action service, a read-only query. */
async function readableAction(round: Remembered, tool: string): Promise<{ view: ActionView; ref: ExactActionReference } | { refused: CheckerResult } | { unknown: CheckerResult }> {
  if (!round.actions) return { refused: refused(REFUSED, "这一轮没有可调用的动作") };
  const ref = (await round.tools?.catch(() => undefined))?.get(tool);
  if (!ref) return { refused: refused(REFUSED, "这个动作不在这一轮可调用的动作里：tool 写这一轮动作工具的名字本身（molis-action- 开头，find-tools 的说明里列着）") };
  let views: readonly ActionView[];
  try { views = await round.actions.client.discover(); }
  catch (error) { if (notAllowed(error)) return { refused: refused(codeOf(error, REFUSED), "这一轮现在不能再查动作") }; throw error; }
  const view = views.find(one => sameRef(one, ref));
  if (!view || !view.action.audiences.includes("agent")) return { refused: refused(REFUSED, "这一轮现在不能调用这个动作") };
  // A judgment asks a model (it is a command), a navigation opens something: only a plain query that reads is looked at again and again.
  if (view.operation !== "query" || view.action.kind !== "query" || actionEffect(view.action, view.capability_id) !== "read") {
    return { refused: refused(NOT_READ, "只能查只读的查询动作") };
  }
  // Looked at again and again, a query that asks a model (it declares model:invoke) would spend on every look (coordinator 2026-10-16).
  if (view.action.permissions.includes("model:invoke")) return { refused: refused(NOT_READ, "要调用模型的查询不能这样等") };
  if (!view.availability.available) return { unknown: { status: "unknown", note: `动作暂不可用：${view.availability.reason}` } };
  return { view, ref };
}

const answerAt = (value: unknown, path: readonly string[]) => path.reduce<unknown>((at, key) => object(at) ? at[key] : undefined, value);

const lookAtAction: Look = async (round, params, signal) => {
  const query = params as { tool: string; input?: unknown; status: { path: string[]; satisfied: string[]; failed?: string[]; pending?: string[] } };
  const found = await readableAction(round, query.tool);
  if ("refused" in found) return found.refused;
  if ("unknown" in found) return found.unknown;
  signal.throwIfAborted();
  let output: unknown;
  try { output = await round.actions!.client.invoke(found.ref, query.input ?? {}, signal); }
  catch (error) { if (notAllowed(error)) return refused(codeOf(error, REFUSED), "这一轮现在不能调用这个动作"); throw error; }
  const said = answerAt(output, query.status.path), source = { ref: `${found.ref.capability_id}@${found.ref.version}` };
  if (typeof said !== "string" && typeof said !== "number" && typeof said !== "boolean") return { status: "unknown", source, note: "动作的回答里没有这个状态" };
  const state = String(said);
  const status = query.status.satisfied.includes(state) ? "satisfied" : query.status.failed?.includes(state) ? "failed"
    : query.status.pending?.includes(state) || round.anyOtherPending ? "pending" : undefined;
  return status ? { status, source, note: `「${found.view.action.title}」回答 ${state}` } : { status: "unknown", source, note: `「${found.view.action.title}」回答 ${state}，不在给定的状态里` };
};

/** A file under the directory, written since the round that waits on it started; anything else, or outside, is not it. */
async function freshFile(root: string, path: string, since: number, nonEmpty: boolean): Promise<"here" | "absent" | "old" | "empty" | "outside"> {
  const base = await realpath(root);
  let real: string;
  try { real = await realpath(resolve(base, path)); } catch { return "absent"; }
  const inside = relative(base, real);
  if (!inside || inside.startsWith(`..${sep}`) || inside === ".." || isAbsolute(inside)) return "outside";
  // Not followed again: a path swapped for a link after it was resolved is not the file.
  const seen = await lstat(real);
  if (!seen.isFile()) return "absent";
  if (seen.mtimeMs < since) return "old";
  return nonEmpty && seen.size === 0 ? "empty" : "here";
}

function filePresentLook(ports: PrologueCheckPorts, project: (sessionId: string) => Promise<string | undefined>): Look {
  return async (round, params) => {
    const file = params as { path: string; marker?: string; failed_marker?: string; non_empty?: boolean };
    const root = round.root_path, projectId = await project(round.session_id);
    if (!root || !projectId) return refused(REFUSED, "这一轮没有授权目录");
    if (!ports.directoryAuthorized || !await ports.directoryAuthorized(projectId, root)) return refused(REFUSED, "这一轮的目录已不再授权");
    const since = round.started_at_ms;
    const failed = file.failed_marker ? await freshFile(root, file.failed_marker, since, false) : undefined;
    if (failed === "outside") return refused(REFUSED, "路径指向授权目录之外");
    if (failed === "here") return { status: "failed", source: { ref: file.failed_marker! }, note: `出现了失败标记 ${file.failed_marker}` };
    const main = await freshFile(root, file.path, since, file.non_empty === true);
    if (main === "outside") return refused(REFUSED, "路径指向授权目录之外");
    if (main !== "here") return { status: "pending", note: main === "old" ? `${file.path} 比登记它的那一轮还旧，不算` : main === "empty" ? `${file.path} 还是空的` : `还没有 ${file.path}` };
    if (file.marker) {
      const marker = await freshFile(root, file.marker, since, false);
      if (marker === "outside") return refused(REFUSED, "路径指向授权目录之外");
      if (marker !== "here") return { status: "pending", note: `有 ${file.path}，还没有完成标记 ${file.marker}` };
    }
    // Being there is all this says: not that what is in it is right, nor that whatever made it succeeded.
    return { status: "satisfied", source: { ref: file.path }, note: `看到了 ${file.path}${file.marker ? ` 和完成标记 ${file.marker}` : ""}；只说明文件在，不证明内容对，也不证明生成成功` };
  };
}

const sameScope = (wait: HeldWait, scope: CheckRequest["scope"]) => wait.scope.board === scope.board && wait.scope.node === scope.node && wait.scope.generation === scope.generation;
const REGISTER_HOOK = "molis-external-check-register";

/**
 * The Host's checkers, and the rounds they answer for. A round is remembered when it starts and let go once it is over
 * and no wait it registered is still waiting.
 */
export function createPrologueConditionCheckers(deps: { readonly runtime: () => Runtime; readonly ports?: PrologueCheckPorts; readonly project: (sessionId: string) => Promise<string | undefined>; readonly owner: (sessionId: string) => Promise<AgentSessionView["owner"] | undefined> }) {
  const rounds = new Map<string, Remembered>(), ended = new Set<string>(), offs: Array<() => void> = [];
  const roundOffs = new Map<string, () => void>();
  const ports = deps.ports ?? {};
  const owned = ownedConditionChecks(ports.owned ?? [], deps.owner);
  const looks = new Map<string, Look>([[ACTION_QUERY_CHECKER.id, lookAtAction], [FILE_PRESENT_CHECKER.id, filePresentLook(ports, deps.project)]]);
  const problems = new Map<string, (params: unknown) => string | undefined>([[ACTION_QUERY_CHECKER.id, actionQueryProblem], [FILE_PRESENT_CHECKER.id, filePresentProblem]]);
  for (const checker of owned.entries.values()) problems.set(checker.id, params => checker.checkParams(params));
  const prune = () => {
    for (const runId of [...ended]) if (!deps.runtime().waits.list().some(wait => wait.state === "waiting" && wait.run?.id === runId)) { rounds.delete(runId); ended.delete(runId); }
  };
  /** The round's own check first, every time: its plugin instance, its Character. */
  const roundRefusal = async (round: Remembered | undefined, sessionId: string): Promise<CheckerResult | undefined> => {
    if (!round || round.session_id !== sessionId) return refused(REFUSED, "登记这个等待的那一轮的授权已经不在（宿主重启过，或不是这个会话的）");
    try { await round.beforeDispatch?.(); } catch (error) { return refused(codeOf(error, REFUSED), "那一轮的授权已经收回"); }
    return undefined;
  };
  /** Registering: whether the round could look at this now, without looking (no action is called, no file is read). */
  const couldLook = async (round: Remembered | undefined, sessionId: string, checker: string, params: unknown): Promise<string | undefined> => {
    const stop = await roundRefusal(round, sessionId);
    if (stop) return stop.note;
    if (owned.entries.has(checker)) return owned.authorize(checker, sessionId, params);
    if (checker === ACTION_QUERY_CHECKER.id) {
      const found = await readableAction(round!, (params as { tool: string }).tool).catch(() => undefined);
      return found && "refused" in found ? found.refused.note : undefined;
    }
    const projectId = await deps.project(sessionId);
    if (!round!.root_path || !projectId || !ports.directoryAuthorized || !await ports.directoryAuthorized(projectId, round!.root_path)) return "这一轮没有授权目录";
    return undefined;
  };
  /**
   * A Host wait on a job a work follows (§6.0o): no round registered it, so every look is checked against the work's
   * authority now, and its query is the one the wait names exactly. A work that is gone is refused; one that cannot be
   * read just now is not known yet (the SDK looks again).
   */
  const workRound = async (wait: HeldWait): Promise<Remembered | CheckerResult> => {
    let authority: WorkCheckAuthority | undefined;
    try { authority = await ports.workAuthority?.({ graph_id: wait.scope.board, node_id: wait.scope.node }); } catch (error) { return { status: "unknown", note: `还读不到这项工作：${error instanceof Error ? error.message : String(error)}`.slice(0, 300) }; }
    if (!authority) return refused(REFUSED, "跟进这个后台任务的工作已经不在");
    const tools = new Map<string, ExactActionReference>();
    for (const one of wait.on) {
      const tool = one.kind === "external" && object(one.check.params) ? one.check.params.tool : undefined, ref = jobQueryRef(tool);
      if (ref) tools.set(tool as string, ref);
    }
    return { session_id: wait.session.id, ...authority, tools: Promise.resolve(tools), started_at_ms: wait.createdAtMs, anyOtherPending: true };
  };
  const checkers: ConditionCheckers = {
    list: () => [ACTION_QUERY_CHECKER, FILE_PRESENT_CHECKER, ...[...owned.entries.values()].map(({ id, version }) => ({ id, version }))],
    describe(id, version) {
      const problem = version === "1" ? problems.get(id) : undefined;
      return problem && { readOnly: true, params: owned.entries.get(id)?.params ?? PARAMS.get(id), checkParams: params => problem(params as unknown) };
    },
    async check(request, signal) {
      const wait = deps.runtime().waits.get(request.wait.ref.id);
      if (!wait || wait.state !== "waiting" || !sameScope(wait, request.scope)) return refused(REFUSED, "这个等待已不在原来的那一步上");
      const round = wait.run ? rounds.get(wait.run.id) : undefined;
      // Only a registered owner checker may restore its narrowly proven read grant; general round grants still expire.
      if (owned.entries.has(request.check.checker.id)) {
        const stop = round ? await roundRefusal(round, wait.session.id) : undefined;
        return stop ?? owned.check(request.check.checker.id, wait.session.id, request.check.params, signal);
      }
      // A wait no round registered is the Host's, on a job a work follows: one that ends its step, nothing else.
      const found = wait.run ? round : wait.by === "app" && wait.afterwards === "end-step" ? await workRound(wait) : undefined;
      if (found && "status" in found) return found;
      const stop = await roundRefusal(found, wait.session.id);
      if (stop) return stop;
      signal.throwIfAborted();
      return looks.get(request.check.checker.id)!(found!, request.check.params, signal);
    },
  };
  /** A wait the round could never have looked at is not registered: the round hears why at once, not after its run is over. */
  const register = async (runId: string | undefined, sessionId: string, input: unknown): Promise<string | undefined> => {
    const on = object(input) && Array.isArray(input.on) ? input.on : [];
    for (const one of on) {
      if (!object(one) || one.kind !== "external" || typeof one.checker !== "string") continue;
      const at = one.checker.lastIndexOf("@"), id = one.checker.slice(0, at);
      // An unknown checker or parameters it does not take: the SDK refuses those itself, with what is wrong.
      if (one.checker.slice(at + 1) !== "1" || !problems.has(id) || problems.get(id)!(one.params ?? null) !== undefined) continue;
      const why = await couldLook(runId ? rounds.get(runId) : undefined, sessionId, id, one.params);
      if (why) return why;
    }
    return undefined;
  };
  return {
    checkers,
    /** A round started: what its waits will be checked against, until it is over and nothing it registered still waits. */
    remember(runId: string, authority: RoundCheckAuthority, events: { subscribe(listener: (event: { type: string }) => void): () => void }) {
      roundOffs.get(runId)?.();
      const round = { ...authority, started_at_ms: Date.now() };
      rounds.set(runId, round);
      const off = events.subscribe(event => {
        if (rounds.get(runId) !== round) return;
        if (!["completed", "failed", "cancelled"].includes(event.type)) return;
        ended.add(runId);
        queueMicrotask(() => { off(); if (roundOffs.get(runId) === off) roundOffs.delete(runId); });
        prune();
      });
      roundOffs.set(runId, off);
    },
    /** Forget only this idle session's round authority and subscriptions; global wait observation stays installed. */
    forgetSession(sessionId: string) {
      for (const [runId, round] of rounds) {
        if (round.session_id !== sessionId) continue;
        rounds.delete(runId); ended.delete(runId);
        roundOffs.get(runId)?.(); roundOffs.delete(runId);
      }
    },
    open() {
      const runtime = deps.runtime();
      offs.push(runtime.waits.subscribe(prune));
      runtime.hooks.register({ id: REGISTER_HOOK, event: "tool-before", blocking: true, handler: async context => {
        if (context.toolName !== "board-wait" || !context.origin?.session) return { kind: "allow" as const };
        const why = await register(context.origin.run, context.origin.session, context.input);
        return why ? { kind: "deny" as const, why } : { kind: "allow" as const };
      } });
    },
    close() { for (const off of offs.splice(0)) off(); for (const off of roundOffs.values()) off(); roundOffs.clear(); rounds.clear(); ended.clear(); },
  };
}
