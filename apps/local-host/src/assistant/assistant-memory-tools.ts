import type { MemoryCandidate } from "@molis-ai/molis-work-contracts/services/memory";
import type { AssistantMemoryCandidate } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentMemoryTools } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryCaller, MemoryService } from "@molis-ai/molis-work-service-memory";
import { assistantErrors } from "./assistant-errors.js";
import type { StoredWork } from "./assistant-store.js";

interface AssistantMemoryToolsInput {
  memory: MemoryService;
  actorId: string;
  work: StoredWork;
  /** The work's project, when it has one. */
  projectId: string | null;
  caller: MemoryCaller;
  /** What the person typed in this work, one message each: the rounds they wrote and the supplements they sent them (`typedWords`), plus the one being started. Words the Host, the Assistant or a page wrote are not among them. */
  spoken(): Promise<readonly string[]>;
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
  if (!personal.form && !project?.form) return undefined;
  // Suggesting is its own switch per scope: a project's work suggests for that project only where the person allows it.
  const mayPropose = (personal.form && personal.learn_from_work) || (!!project?.form && project.learn_from_work);
  const propose: AgentMemoryTools["propose"] = async request => {
    await memory.propose(caller, { scope: request.scope, text: request.text, kind: request.scope === "project" ? "convention" : "preference", applies: request.applies.trim() ? { task: request.applies.trim().slice(0, 200) } : {},
      basis: "inferred", why: request.why, from: "work" });
    return { candidate_id: "", note: "已作为建议放在工作面板，等用户认可；在他认可前不会生效。" };
  };
  return {
    ...(mayPropose ? { propose: async request => { const made = await propose(request); const latest = (await memory.candidates(caller, { work_id: work.work_id })).at(-1); return { ...made, candidate_id: latest?.candidate_id ?? "" }; } } : {}),
    ...(work.delegated_by ? {} : { remember: async (request: Parameters<NonNullable<AgentMemoryTools["remember"]>>[0]) => {
      if (request.scope === "project" && !projectId) throw assistantErrors.scope("这是个人工作，没有项目；只能记为个人偏好");
      if (request.scope === "character" && !caller.character) throw assistantErrors.scope("这一轮不是由某个角色承担的，不能记为角色记忆");
      // “You said” is the person's only when the text is the whole of a message they typed in this work: the gate judges it against these saved messages (not against the quote the model gives), and what is kept
      // is that message as they wrote it. A paraphrase, a part of a message or anything else is the Assistant's own suggestion, which waits for the person.
      const result = await memory.write(caller, { scope: request.scope, text: request.text, said: request.said, ...(request.kind ? { kind: request.kind } : {}), ...(request.replaces ? { replaces: request.replaces } : {}) }, { originals: await input.spoken() });
      // Only what really went into memory counts as kept; the reply must say what happened instead.
      if (result.outcome === "refused") throw assistantErrors.invalid(`没有记住：${result.reason}`);
      // Only the outcome: why the gate held it is the person's to read on the card, not a rule for the model to repeat (specs/ai-input-receipts D32).
      // A suggestion means 允许记住 is on for this scope (the memory service refuses outright when it is off), so the model is told that too, rather than guessing a reason (D32-b).
      // It is a success, not an error: nothing was kept, and the card waiting for the person is the outcome (BL-323).
      if (result.outcome === "candidate") return { memory_id: "", scope: request.scope, applies: result.applies_text, candidate_id: (await memory.candidates(caller, { work_id: work.work_id })).at(-1)?.candidate_id ?? "",
        note: "没有直接记住，已作为建议放在工作面板，等用户认可；这个范围的“允许记住”是开着的，没直接记住的原因写在卡片的详情里" };
      return { memory_id: result.memory!.memory_id, scope: request.scope, applies: result.applies_text, ...(result.outcome === "duplicate" ? { note: result.reason } : {}) };
    } }),
    list: async () => (await memory.list(caller, { scope: "all" })).items.map(item => ({ memory_id: item.memory_id, scope: item.scope,
      text: item.state === "active" ? item.text : `（已停用）${item.text}`, origin: item.origin })),
    ...(work.delegated_by ? {} : { forget: async (memoryId: string) => {
      // Forgetting is switching off, in the Assistant's name: it is no longer used, stays the person's to switch back on or delete in settings.
      try { await memory.change(caller, { memory_id: memoryId, action: "disable" }); return { forgotten: true, note: "已停用：以后不会再用到这条；它还在用户的记忆设置里，用户可以重新启用或彻底删除。" }; }
      catch (error) { if (error instanceof ActionError && error.code === "memory.not_found") return { forgotten: false }; throw error; }
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
