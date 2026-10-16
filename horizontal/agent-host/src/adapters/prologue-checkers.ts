import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { CheckRequest, CheckerResult, ConditionCheckers, HeldWait, Runtime } from "@prologue/sdk";
import { actionEffect, platformErrorKind, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";

/**
 * The checkers a step may wait on (specs/prologue-adoption §4.6.8): something outside the runtime, looked at by the Host
 * on the SDK's bounded schedule, never through a model. Both only look. Every look is checked again against the round
 * that registered the wait: its own check (its plugin instance, its Character), its actions through the action service,
 * its directory. What the round could not do now is refused, and the SDK stops looking and holds the step for a person.
 */
export const ACTION_QUERY_CHECKER = { id: "molis.action-query", version: "1" } as const;
export const FILE_PRESENT_CHECKER = { id: "molis.file-present", version: "1" } as const;

const REFUSED = agentErrors.collaboration_check_refused("").code;
const NOT_READ = agentErrors.collaboration_check_not_read("").code;

/** What a round leaves for the looks at the waits it registers. Kept in memory: after a restart there is none, and a look is refused. */
export interface RoundCheckAuthority {
  readonly session_id: string;
  /** The round's own check before anything leaves for it (its plugin instance, its Character); none for a trusted Host start. */
  readonly beforeDispatch?: () => void | Promise<void>;
  /** The round's actions: the frozen ones only, or what the business gateway finds. */
  readonly actions?: { readonly client: AgentActionClient; readonly tools?: readonly ActionView[] };
  /** The round's authorized directory. */
  readonly root_path?: string;
}

/** What the Host answers for the checks. */
export interface PrologueCheckPorts {
  /** Whether this directory is still authorized for the project now. */
  directoryAuthorized?(projectId: string, path: string): Promise<boolean>;
}

type Look = (round: Remembered, params: unknown, signal: AbortSignal) => Promise<CheckerResult>;
interface Remembered extends RoundCheckAuthority { readonly started_at_ms: number }

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

/** `molis.action-query@1`: an exact action, its input, where its answer says the state, and which states count as what. */
function actionQueryProblem(params: unknown): string | undefined {
  if (!object(params) || !onlyKeys(params, ["action", "input", "status"])) return "takes { action, input?, status }";
  const action = params.action;
  if (!object(action) || !onlyKeys(action, ["capability_id", "version", "provider_id"]) || typeof action.capability_id !== "string" || !action.capability_id
    || action.capability_id.length > 200 || !Number.isSafeInteger(action.version) || (action.version as number) < 1
    || typeof action.provider_id !== "string" || !action.provider_id || action.provider_id.length > 200) return "action is { capability_id, version, provider_id }";
  const status = params.status;
  if (!object(status) || !onlyKeys(status, ["path", "satisfied", "failed", "pending"])) return "status is { path, satisfied, failed?, pending? }";
  if (!Array.isArray(status.path) || status.path.length > 8 || !status.path.every(part => typeof part === "string" && part.length >= 1 && part.length <= 64)) return "status.path is at most 8 field names";
  if (!words(status.satisfied, 1, 20) || status.failed !== undefined && !words(status.failed, 0, 20) || status.pending !== undefined && !words(status.pending, 0, 20)) return "status lists at most 20 states each, satisfied at least one";
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

const sameRef = (view: Pick<ActionView, "capability_id" | "version" | "provider">, ref: ExactActionReference) =>
  view.capability_id === ref.capability_id && view.version === ref.version && view.provider.provider_id === ref.provider_id;

/** The action, as the round may call it now: granted to the round, found through the action service, a read-only query. */
async function readableAction(round: Remembered, ref: ExactActionReference): Promise<{ view: ActionView } | { refused: CheckerResult } | { unknown: CheckerResult }> {
  if (!round.actions) return { refused: refused(REFUSED, "这一轮没有可调用的动作") };
  if (round.actions.tools && !round.actions.tools.some(view => sameRef(view, ref))) return { refused: refused(REFUSED, "这个动作不在这一轮可调用的动作里") };
  let views: readonly ActionView[];
  try { views = await round.actions.client.discover(); }
  catch (error) { if (notAllowed(error)) return { refused: refused(codeOf(error, REFUSED), "这一轮现在不能再查动作") }; throw error; }
  const view = views.find(one => sameRef(one, ref));
  if (!view || !view.action.audiences.includes("agent")) return { refused: refused(REFUSED, "这一轮现在不能调用这个动作") };
  // A judgment asks a model (it is a command), a navigation opens something: only a plain query that reads is looked at again and again.
  if (view.operation !== "query" || view.action.kind !== "query" || actionEffect(view.action, view.capability_id) !== "read") {
    return { refused: refused(NOT_READ, "只能查只读的查询动作") };
  }
  if (!view.availability.available) return { unknown: { status: "unknown", note: `动作暂不可用：${view.availability.reason}` } };
  return { view };
}

const answerAt = (value: unknown, path: readonly string[]) => path.reduce<unknown>((at, key) => object(at) ? at[key] : undefined, value);

const lookAtAction: Look = async (round, params, signal) => {
  const query = params as { action: ExactActionReference; input?: unknown; status: { path: string[]; satisfied: string[]; failed?: string[]; pending?: string[] } };
  const found = await readableAction(round, query.action);
  if ("refused" in found) return found.refused;
  if ("unknown" in found) return found.unknown;
  signal.throwIfAborted();
  let output: unknown;
  try { output = await round.actions!.client.invoke(query.action, query.input ?? {}, signal); }
  catch (error) { if (notAllowed(error)) return refused(codeOf(error, REFUSED), "这一轮现在不能调用这个动作"); throw error; }
  const said = answerAt(output, query.status.path), source = { ref: `${query.action.capability_id}@${query.action.version}` };
  if (typeof said !== "string" && typeof said !== "number" && typeof said !== "boolean") return { status: "unknown", source, note: "动作的回答里没有这个状态" };
  const state = String(said);
  const status = query.status.satisfied.includes(state) ? "satisfied" : query.status.failed?.includes(state) ? "failed" : query.status.pending?.includes(state) ? "pending" : undefined;
  return status ? { status, source, note: `「${found.view.action.title}」回答 ${state}` } : { status: "unknown", source, note: `「${found.view.action.title}」回答 ${state}，不在给定的状态里` };
};

/** A file under the directory, written since the round that waits on it started; anything else, or outside, is not it. */
async function freshFile(root: string, path: string, since: number, nonEmpty: boolean): Promise<"here" | "absent" | "old" | "empty" | "outside"> {
  const base = await realpath(root);
  let real: string;
  try { real = await realpath(resolve(base, path)); } catch { return "absent"; }
  const inside = relative(base, real);
  if (!inside || inside.startsWith(`..${sep}`) || inside === ".." || isAbsolute(inside)) return "outside";
  const seen = await stat(real);
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
    if (file.failed_marker && await freshFile(root, file.failed_marker, since, false) === "here") return { status: "failed", source: { ref: file.failed_marker }, note: `出现了失败标记 ${file.failed_marker}` };
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
export function createPrologueConditionCheckers(deps: { readonly runtime: () => Runtime; readonly ports?: PrologueCheckPorts; readonly project: (sessionId: string) => Promise<string | undefined> }) {
  const rounds = new Map<string, Remembered>(), ended = new Set<string>(), offs: Array<() => void> = [];
  const ports = deps.ports ?? {};
  const looks = new Map<string, Look>([[ACTION_QUERY_CHECKER.id, lookAtAction], [FILE_PRESENT_CHECKER.id, filePresentLook(ports, deps.project)]]);
  const problems = new Map<string, (params: unknown) => string | undefined>([[ACTION_QUERY_CHECKER.id, actionQueryProblem], [FILE_PRESENT_CHECKER.id, filePresentProblem]]);
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
    if (checker === ACTION_QUERY_CHECKER.id) {
      const found = await readableAction(round!, (params as { action: ExactActionReference }).action).catch(() => undefined);
      return found && "refused" in found ? found.refused.note : undefined;
    }
    const projectId = await deps.project(sessionId);
    if (!round!.root_path || !projectId || !ports.directoryAuthorized || !await ports.directoryAuthorized(projectId, round!.root_path)) return "这一轮没有授权目录";
    return undefined;
  };
  const checkers: ConditionCheckers = {
    describe(id, version) {
      const problem = version === "1" ? problems.get(id) : undefined;
      return problem && { readOnly: true, checkParams: params => problem(params as unknown) };
    },
    async check(request, signal) {
      const wait = deps.runtime().waits.get(request.wait.ref.id);
      if (!wait || wait.state !== "waiting" || !sameScope(wait, request.scope)) return refused(REFUSED, "这个等待已不在原来的那一步上");
      const round = wait.run ? rounds.get(wait.run.id) : undefined;
      const stop = await roundRefusal(round, wait.session.id);
      if (stop) return stop;
      signal.throwIfAborted();
      return looks.get(request.check.checker.id)!(round!, request.check.params, signal);
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
      rounds.set(runId, { ...authority, started_at_ms: Date.now() });
      const off = events.subscribe(event => {
        if (!["completed", "failed", "cancelled"].includes(event.type)) return;
        ended.add(runId); queueMicrotask(off); prune();
      });
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
    close() { for (const off of offs.splice(0)) off(); rounds.clear(); ended.clear(); },
  };
}
