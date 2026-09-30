/**
 * A round that ends by saying what it will do next, with nothing done.
 *
 * Some models close a round with "现在去改 calc.js" and no tool call: the person reads a promise, and nothing has
 * happened. For rounds that may change things, the Host holds such an ending once and lets the model continue (the
 * person chose this on 2026-09-28: one automatic continuation, shown in the round, at the cost of one more model call).
 * Only the closing paragraph is judged; a report of results, a question or a stated blocker is never held.
 */
// “现在是 19:04”“开始时间是…” state a fact; only “现在去…”“开始改…” announce a step.
const INTENT = /(?:^|[。，,；;：:！!\s（(])(?:现在(?![是有还已在的为共处约大]|\s*\*)|接下来|下面|马上|随后|然后|先|开始(?![时于日前后的是])|我(?:来|先|会|将|要|准备|这就|马上|现在|去)|我把(?![^。！!\n]*[了过]))|\b(?:I'll|I will|I'm going to|let me|now I|next,? I)\b/i;
const SETTLED = /已(?:经)?(?:完成|修改|改好|改完|创建|新建|写入|保存|运行|执行|提交|添加|加上|删除)|完成[了。！!]|通过|成功|失败|报错|无法|不能|做不了|没有权限|未获授权|需要你|请你|请确认|你(?:希望|想|要不要|是否)|是否|\b(?:done|finished|completed|passed|failed|cannot|can't|unable)\b/i;

export function announcesWithoutActing(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 600) return false;
  const closing = trimmed.split(/\n+/).map(line => line.trim()).filter(Boolean).at(-1) ?? "";
  if (/[？?]\s*$/.test(closing) || SETTLED.test(closing)) return false;
  return INTENT.test(closing);
}

/** What the model reads when its announcement is held. */
export const ANNOUNCE_HELD =
  "Your last message only said what you would do next and called no tool, so nothing has happened yet. If the work is not finished, call the tools now. If it is finished, needs the person's decision, or cannot proceed, say so plainly.";

/**
 * A reply that says something was remembered or forgotten, from a round in which no such call succeeded. Seen from
 * MiniMax-M3: it listed the memories and then answered “记下了……”, keeping nothing. Only the closing paragraph counts.
 */
const KEPT = /已(?:经)?(?:记下|记住)|(?:记下|记住)(?:了|啦)|已(?:经)?(?:保存|存)(?:为|到|进)(?:记忆|偏好)|\b(?:I(?:'ve| have) (?:noted|saved|remembered)|noted that)\b/i;
const FORGOT = /已(?:经)?(?:删除|删掉|忘掉|忘记)|(?:删除|删掉|忘掉|忘记)(?:了|啦)|\bI(?:'ve| have) (?:forgotten|deleted|removed)\b/i;
// Only about memory: a note written into a document (“已记下会议要点”) or a deleted page is a business change, not this.
const ABOUT_MEMORY = /记忆|偏好|以后|生效|适用|记住的|\b(?:memory|memories|preference|from now on)\b/i;
const NOT_DONE = /(?:没有|没|未|不会|无法|不能)(?:记下|记住|保存|删除|删掉|忘掉)/;
export function claimsMemoryChange(text: string): "keep" | "forget" | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 1200 || /[？?]\s*$/.test(trimmed) || !ABOUT_MEMORY.test(trimmed) || NOT_DONE.test(trimmed)) return null;
  if (FORGOT.test(trimmed)) return "forget";
  if (KEPT.test(trimmed)) return "keep";
  return null;
}

/** What the model reads when it claimed a memory change it did not make. */
export const MEMORY_CLAIM_HELD = {
  keep: "You said you remembered it, but no remember call succeeded in this round, so nothing was kept. Call remember now if the person asked you to keep it; otherwise say plainly that it was not kept.",
  forget: "You said you forgot or deleted it, but no forget-memory call succeeded in this round, so it is still kept. Call forget-memory now if the person asked; otherwise say plainly that it was not deleted.",
} as const;

/**
 * A reply that says a button is ready when no suggestion was made this round. Seen from MiniMax-M3: asked for a
 * button, it listed the fields and said “按钮准备好了，等你点” without calling suggest-action — nothing to click.
 */
const BUTTON = /按钮|操作卡|卡片|\bbutton\b/i;
const READY = /准备好|备好|已(?:经)?(?:给|放|生成)|在(?:上面|下面|下方|这里)|等你点|点(?:一下|击)?(?:它|按钮)?(?:就|即可)|\b(?:ready|click|press|tap)\b/i;
const NOT_MADE = /(?:没有|没|未|无法|不能)(?:准备|给出|生成|做出|放)/;
export function claimsButton(text: string): boolean {
  const trimmed = text.trim();
  return Boolean(trimmed) && trimmed.length <= 2000 && BUTTON.test(trimmed) && READY.test(trimmed) && !NOT_MADE.test(trimmed);
}

/** What the model reads when it said a button is ready but made none. */
export const BUTTON_CLAIM_HELD =
  "You said a button or card is ready, but no suggest-action call succeeded in this round, so the person has nothing new to click. If they asked for a button now, call suggest-action for it; if you meant one offered in an earlier round, say that it is that earlier one; otherwise say plainly that no button was made.";

/**
 * A reply that writes a tool call out as text instead of making it. Seen from MiniMax-M3: asked for buttons, it
 * answered with “[suggest-action] … capability_id: pages.create …” blocks, so the person saw markup and no card.
 * Held once whatever the round's execution: nothing it wrote happened.
 */
const TOOL_NAMES = "suggest-action|change-capability|change-reversible|read-capability|find-capabilities|delegate-work|check-delegated-work|follow-up-delegated-work|remember|forget-memory|list-memories|suggest-memory|ask-user|update-todo";
const WRITTEN_CALL = new RegExp(`\\[\\/?(?:${TOOL_NAMES})\\]|<\\/?(?:${TOOL_NAMES})>|(?:^|\\n)\\s*(?:capability_id|provider_id)\\s*[:=：]|"capability_id"\\s*:`);
export function writesToolCallAsText(text: string): boolean {
  return WRITTEN_CALL.test(text);
}

/** What the model reads when it wrote a call instead of making it. */
export const WRITTEN_CALL_HELD =
  "Your reply wrote a tool call out as text (a [tool] block or capability_id lines), so nothing happened: the person sees that text, not a button or an action. Make the call itself now with the tool, or answer in plain words without it.";

