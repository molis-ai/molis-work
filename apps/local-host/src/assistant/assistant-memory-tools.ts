import type { MemoryCandidate, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import type { AssistantMemoryCandidate } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentMemoryExecutionControl, AgentMemorySourceSnapshot, AgentMemoryTools } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { isDeepStrictEqual } from "node:util";
import { characterOwner, consumerAccess, memoryErrors, theirWords, type MemoryCaller, type MemoryService, type MemoryServicePorts } from "@molis-ai/molis-work-service-memory";
import type { memorySources } from "../memory/memory-sources.js";
import { assistantErrors } from "./assistant-errors.js";
import type { StoredWork } from "./assistant-store.js";

interface AssistantMemoryToolsInput {
  memory: MemoryService;
  controlled(control: AgentMemoryExecutionControl, bindChangeTarget: NonNullable<MemoryServicePorts["bindChangeTarget"]>): MemoryService | undefined;
  sources?: Pick<ReturnType<typeof memorySources>, "check">;
  currentWork(): StoredWork;
  currentInput(): boolean;
  onSourceWithdrawal(listener: (eventId: string) => void): () => void;
  actorId: string;
  work: StoredWork;
  /** The work's project, when it has one. */
  projectId: string | null;
  caller: MemoryCaller;
  /** What the person typed in this work, one message each: the Runtime-owned originals and the supplements they sent them (`typedWords`), including the accepted Run before its display round exists. Words the Host, the Assistant or a page wrote are not among them. */
  spoken(): Promise<readonly AgentMemorySourceSnapshot[]>;
}

type ToolControl = Parameters<NonNullable<AgentMemoryTools["remember"]>>[1];

/** One tool invocation retains its authority through every SDK commit and synchronous ledger operation. */
async function memoryInvocation(input: AssistantMemoryToolsInput, call: ToolControl, scope?: MemoryScope,
  selectSources?: (available: readonly AgentMemorySourceSnapshot[]) => readonly AgentMemorySourceSnapshot[], suggesting = false) {
  if (!call?.signal || !call.operation_id) throw memoryErrors.forbidden("记忆工具缺少本次执行控制");
  const withdrawn = new AbortController(), signal = AbortSignal.any([call.signal, withdrawn.signal]);
  const sourceIds = new Set<string>(), withdrawals = new Set<string>();
  let bound = false, sources: readonly AgentMemorySourceSnapshot[] = [], originals: string[] = [];
  const cancelSource = () => withdrawn.abort(memoryErrors.forbidden("原始输入正在撤回，停止记忆写入"));
  const dispose = selectSources ? input.onSourceWithdrawal(eventId => {
    if (!bound) withdrawals.add(eventId); else if (sourceIds.has(eventId)) cancelSource();
  }) : () => {};
  const work = input.work, projectId = input.projectId;
  let changeTarget: Parameters<NonNullable<MemoryServicePorts["bindChangeTarget"]>>[0] | undefined;
  const owner = scope === "personal" ? input.actorId : scope === "character" && input.caller.character && projectId
    ? characterOwner(projectId, input.caller.character.id) : projectId;
  const assertCurrent = () => {
    signal.throwIfAborted();
    const current = input.currentWork();
    if (current.archived || ["paused", "stopped"].includes(current.continuation_hold ?? "") || current.session_id !== work.session_id
      || current.continuation_hold === "input" && !input.currentInput()
      || !isDeepStrictEqual(current.delegated_by, input.work.delegated_by) || (current.project_ref?.project_id ?? null) !== input.projectId
      || current.character?.artifact_id !== work.character?.artifact_id || current.character?.version !== work.character?.version)
      throw memoryErrors.forbidden("原工作已停止或权限已变化，停止记忆写入");
    if (scope) {
      const permitted = (target: "personal" | "project") => {
        const prefs = input.memory.prefsFor(input.actorId, target, target === "personal" ? null : projectId);
        if (!prefs.enabled) throw memoryErrors.off("这个范围的记忆已关闭；仍可查看和删除，启用后才能保存或恢复");
        if (!prefs.form) {
          if (suggesting) throw memoryErrors.off("用户关掉了“允许记住”，不要提出记忆建议");
          throw assistantErrors.invalid("没有记住：你关掉了“允许记住”，这条没有记住，也没有留作建议");
        }
        return consumerAccess(prefs, "assistant", undefined, "explicit").allowed;
      };
      if (!permitted(scope === "personal" ? "personal" : "project") || projectId && !permitted("project"))
        throw memoryErrors.forbidden("用户没有允许本次记忆写入");
      if (suggesting && !input.memory.prefsFor(input.actorId, scope === "personal" ? "personal" : "project", scope === "personal" ? null : projectId).learn_from_work)
        throw memoryErrors.forbidden(scope === "project" ? "用户没有允许从项目工作里提出项目约定" : "用户没有允许从工作里提出个人偏好");
    }
    if (scope && owner && !input.memory.sourceAllowed(input.actorId, scope, owner, sources))
      throw memoryErrors.forbidden("这份来源已遗忘，停止记忆写入");
    if (changeTarget && !consumerAccess(input.memory.prefsFor(input.actorId, changeTarget.scope, changeTarget.project), "assistant", undefined, "explicit").allowed)
      throw memoryErrors.forbidden("用户没有允许助理变更这条记忆");
  };
  const bindChangeTarget: NonNullable<MemoryServicePorts["bindChangeTarget"]> = target => {
    const expectedOwner = target.scope === "personal" ? input.actorId : target.scope === "character" && input.caller.character && projectId
      ? characterOwner(projectId, input.caller.character.id) : target.scope === "project" ? projectId : null;
    if (!expectedOwner || target.owner !== expectedOwner || target.project !== (target.scope === "personal" ? null : projectId)
      || changeTarget && !isDeepStrictEqual(changeTarget, target)) throw memoryErrors.forbidden("记忆变更目标不属于本次工作");
    changeTarget = { ...target };
    assertCurrent();
  };
  const beforeEffect = async () => {
    assertCurrent();
    if (sources.length && (!scope || !owner || !input.sources || !await input.sources.check({
      actor_id: input.actorId, project_id: projectId, consumer: "assistant", current_scene: "assistant", source_use: "explicit", purpose: "management",
      ...(work.session_id ? { session_id: work.session_id } : {}), ...(input.caller.character ? { character_id: input.caller.character.id } : {}),
    }, { app_id: "io.molis.work", target: { scope: scope === "personal" ? "user" : scope, owner }, signal,
      identities: sources.map(({ text: _text, ...identity }) => identity) }))) throw memoryErrors.forbidden("原始输入已撤回或不再允许使用，停止记忆写入");
    assertCurrent();
  };
  try {
    signal.throwIfAborted();
    if (selectSources) {
      const available = await input.spoken();
      originals = [...available].reverse().map(source => source.text);
      sources = selectSources(available);
      for (const source of sources) sourceIds.add(source.event_id);
      bound = true;
      if ([...withdrawals].some(eventId => sourceIds.has(eventId))) cancelSource();
      withdrawals.clear();
    }
    await beforeEffect();
    const memory = input.controlled({ beforeEffect, assert_current: assertCurrent }, bindChangeTarget);
    if (!memory) throw memoryErrors.unavailable("当前没有受控记忆服务");
    return { memory, dispose, sources, originals, caller: { ...input.caller, operation_id: call.operation_id, signal,
      ...(work.session_id ? { session_id: work.session_id } : {}) } };
  } catch (error) { dispose(); throw error; }
}

/**
 * The round's memory tools, or none when forming memories is off everywhere this work could keep something (the stop
 * check reads a round without them as “memory is off”). Every call goes through the platform's write gate. Keeping and
 * forgetting rest on the person's own words and wishes, so a delegated sub-task (whose only words are the delegating
 * work's brief) is given neither: it can read what is kept, and suggest.
 */
export function assistantMemoryTools(input: AssistantMemoryToolsInput): AgentMemoryTools | undefined {
  const { memory, work, projectId, caller } = input;
  const personal = memory.prefsFor(input.actorId, "personal", null), project = projectId ? memory.prefsFor(input.actorId, "project", projectId) : null;
  if (!(personal.enabled && personal.form) && !(project?.enabled && project.form)) return undefined;
  // Suggesting is its own switch per scope: a project's work suggests for that project only where the person allows it.
  const mayPropose = (personal.enabled && personal.form && personal.learn_from_work) || (!!project?.enabled && project.form && project.learn_from_work);
  const propose: AgentMemoryTools["propose"] = async (request, call) => {
    const invocation = await memoryInvocation(input, call, request.scope, sources => sources, true), { sources } = invocation;
    try {
      const candidate = await invocation.memory.propose({ ...invocation.caller, source_use: "explicit" }, { scope: request.scope, text: request.text, kind: request.scope === "project" ? "convention" : "preference", applies: request.applies.trim() ? { task: request.applies.trim().slice(0, 200) } : {},
        basis: "inferred", why: request.why, from: "work" }, sources.length ? { sources: sources.map(({ event_id, version }) => ({ event_id, version })) } : {});
      return { candidate_id: candidate.candidate_id, note: "已作为建议放在工作面板，等用户认可；在他认可前不会生效。" };
    } finally { invocation.dispose(); }
  };
  return {
    ...(mayPropose ? { propose } : {}),
    ...(work.delegated_by ? {} : { remember: async (request: Parameters<NonNullable<AgentMemoryTools["remember"]>>[0], call: ToolControl) => {
      if (request.scope === "project" && !projectId) throw assistantErrors.scope("这是个人工作，没有项目；只能记为个人偏好");
      if (request.scope === "character" && !caller.character) throw assistantErrors.scope("这一轮不是由某个角色承担的，不能记为角色记忆");
      // “You said” is the person's only when the text is the whole of a message they typed in this work: the gate judges it against these saved messages (not against the quote the model gives), and what is kept
      // is that message as they wrote it. A paraphrase, a part of a message or anything else is the Assistant's own suggestion, which waits for the person.
      const invocation = await memoryInvocation(input, call, request.scope, sources => {
        const latest = [...sources].reverse(), said = theirWords(request.text, latest.map(source => source.text));
        // A later explicit request is a new authorization: unrelated historical inputs do not become this memory's sources.
        return said === null ? sources : latest.filter(source => theirWords(request.text, [source.text]) !== null).slice(0, 1);
      }), { sources: selected, originals } = invocation;
      try {
        const result = await invocation.memory.write(invocation.caller, { scope: request.scope, text: request.text, said: request.said, ...(request.kind ? { kind: request.kind } : {}), ...(request.replaces ? { replaces: request.replaces } : {}) },
          { originals, ...(selected.length ? { sources: selected.map(({ event_id, version }) => ({ event_id, version })) } : {}) });
        // Only what really went into memory counts as kept; the reply must say what happened instead.
        if (result.outcome === "refused") throw assistantErrors.invalid(`没有记住：${result.reason}`);
        // Only the outcome: why the gate held it is the person's to read on the card, not a rule for the model to repeat (specs/ai-input-receipts D32).
        // A suggestion means 允许记住 is on for this scope (the memory service refuses outright when it is off), so the model is told that too, rather than guessing a reason (D32-b).
        if (result.outcome === "candidate") throw assistantErrors.invalid("没有直接记住，已作为建议放在工作面板，等用户认可；这个范围的“允许记住”是开着的，没直接记住的原因写在卡片的详情里");
        return { memory_id: result.memory!.memory_id, scope: request.scope, applies: result.applies_text, ...(result.outcome === "duplicate" ? { note: result.reason } : {}) };
      } finally { invocation.dispose(); }
    } }),
    list: async call => {
      const invocation = await memoryInvocation(input, call);
      try {
        const items = (await invocation.memory.list(invocation.caller, { scope: "all" })).items;
        call.signal.throwIfAborted();
        return items.map(item => ({ memory_id: item.memory_id, scope: item.scope, text: item.state === "active" ? item.text : `（已停用）${item.text}`, origin: item.origin }));
      } finally { invocation.dispose(); }
    },
    ...(work.delegated_by ? {} : { forget: async (memoryId: string, call: ToolControl) => {
      // Forgetting is switching off, in the Assistant's name: it is no longer used, stays the person's to switch back on or delete in settings.
      const invocation = await memoryInvocation(input, call);
      try { await invocation.memory.change(invocation.caller, { memory_id: memoryId, action: "disable" }); return { forgotten: true, note: "已停用：以后不会再用到这条；它还在用户的记忆设置里，用户可以重新启用或彻底删除。" }; }
      catch (error) { if (error instanceof ActionError && error.code === "memory.not_found") return { forgotten: false }; throw error; }
      finally { invocation.dispose(); }
    } }),
  };
}

/** A platform memory candidate as the Assistant's work view has always shown it. */
export function assistantCandidate(candidate: MemoryCandidate): AssistantMemoryCandidate {
  return { candidate_id: candidate.candidate_id, work_id: candidate.work?.work_id ?? "", work_title: candidate.work?.title ?? "", scope: candidate.scope,
    ...(candidate.project_id ? { project_id: candidate.project_id } : {}), text: candidate.text, why: candidate.why, applies: candidate.applies.task ?? "",
    state: candidate.state, created_at: candidate.created_at, ...(candidate.memory_id ? { memory_id: candidate.memory_id } : {}),
    ...(candidate.from === "gate" && candidate.hold_reason ? { held: candidate.hold_reason } : {}) };
}
