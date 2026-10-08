import type { AgentMemoryTools } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MemoryError, type MemoryCaller, type MemoryService } from "@molis-ai/molis-work-service-memory";
import type { StoredWork } from "./assistant-store.js";

export interface AssistantMemoryToolsInput {
  memory: MemoryService;
  actorId: string;
  work: StoredWork;
  /** The work's project, when it has one. */
  projectId: string | null;
  caller: MemoryCaller;
  /** What the person typed in this work, one message each: the rounds the Host keeps that they wrote, plus the one being started. A round the Host or the Assistant wrote is not among them. */
  spoken(): readonly string[];
  /** The Assistant's own errors (this module does not import the service that owns them). */
  fail(code: string, message: string): Error;
  asAssistantError(error: unknown): unknown;
}

/**
 * The round's memory tools, or none when forming memories is off everywhere this work could keep something (the stop
 * check reads a round without them as “memory is off”). Every call goes through the platform's write gate. Keeping and
 * forgetting rest on the person's own words and wishes, so a delegated sub-task (whose only words are the delegating
 * work's brief) is given neither: it can read what is kept, and suggest.
 */
export function assistantMemoryTools(input: AssistantMemoryToolsInput): AgentMemoryTools | undefined {
  const { memory, work, projectId, caller, fail, asAssistantError } = input;
  const personal = memory.prefsFor(input.actorId, "personal", null), project = projectId ? memory.prefsFor(input.actorId, "project", projectId) : null;
  if (!personal.form && !project?.form) return undefined;
  // Suggesting is its own switch per scope: a project's work suggests for that project only where the person allows it.
  const mayPropose = (personal.form && personal.learn_from_work) || (!!project?.form && project.learn_from_work);
  const propose: AgentMemoryTools["propose"] = async request => {
    try {
      await memory.propose(caller, { scope: request.scope, text: request.text, kind: request.scope === "project" ? "convention" : "preference", applies: request.applies.trim() ? { task: request.applies.trim().slice(0, 200) } : {},
        basis: "inferred", why: request.why, from: "work" });
    } catch (error) { throw asAssistantError(error); }
    return { candidate_id: "", note: "已作为建议放在工作面板，等用户认可；在他认可前不会生效。回复里说“建议记住……，需要你认可”，不要说已经记住。" };
  };
  return {
    ...(mayPropose ? { propose: async request => { const made = await propose(request); const latest = (await memory.candidates(caller, { work_id: work.work_id })).at(-1); return { ...made, candidate_id: latest?.candidate_id ?? "" }; } } : {}),
    ...(work.delegated_by ? {} : { remember: async (request: Parameters<NonNullable<AgentMemoryTools["remember"]>>[0]) => {
      if (request.scope === "project" && !projectId) throw fail("assistant.scope", "这是个人工作，没有项目；只能记为个人偏好");
      if (request.scope === "character" && !caller.character) throw fail("assistant.scope", "这一轮不是由某个角色承担的，不能记为角色记忆");
      // “You said” is the person's only when the text is the whole of a message they typed in this work: the gate judges it against these saved messages (not against the quote the model gives),
      // and a paraphrase, a part of a message or anything else is the Assistant's own suggestion, which waits for the person.
      let result;
      try { result = await memory.write(caller, { scope: request.scope, text: request.text, said: request.said, ...(request.kind ? { kind: request.kind } : {}), ...(request.replaces ? { replaces: request.replaces } : {}) }, { originals: input.spoken() }); }
      catch (error) { throw asAssistantError(error); }
      // Only what really went into memory counts as kept; the reply must say what happened instead.
      if (result.outcome === "refused") throw fail("assistant.invalid", `没有记住：${result.reason}`);
      if (result.outcome === "candidate") throw fail("assistant.invalid", `没有直接记住：${result.reason}。已作为建议放在工作面板，等用户认可`);
      return { memory_id: result.memory!.memory_id, scope: request.scope, applies: result.applies_text, ...(result.outcome === "duplicate" ? { note: result.reason } : {}) };
    } }),
    list: async () => (await memory.list(caller, { scope: "all" })).items.map(item => ({ memory_id: item.memory_id, scope: item.scope,
      text: item.state === "active" ? item.text : `（已停用）${item.text}`, origin: item.origin })),
    ...(work.delegated_by ? {} : { forget: async (memoryId: string) => {
      // Forgetting is switching off, in the Assistant's name: it is no longer used, stays the person's to switch back on or delete in settings.
      try { await memory.change(caller, { memory_id: memoryId, action: "disable" }); return { forgotten: true, note: "已停用：以后不会再用到这条；它还在用户的记忆设置里，用户可以重新启用或彻底删除。回复里说“已停用”，不要说已删除。" }; }
      catch (error) { if (error instanceof MemoryError && error.code === "memory.not_found") return { forgotten: false }; throw asAssistantError(error); }
    } }),
  };
}
