import { APP_MODE_SURFACE_TOOLS, APP_MODE_SYSTEM_TOOLS } from "@prologue/sdk";
import { DELEGATION_TOOLS, GATEWAY_TOOLS, MEMORY_TOOLS } from "./prologue-action-gateway.js";

/**
 * A round that ends by saying what it will do next, with nothing done.
 *
 * Some models close a round with "现在去改 calc.js" and no tool call: the person reads a promise, and nothing has
 * happened. For rounds that may change things, the Host holds such an ending once and lets the model continue (the
 * person chose this on 2026-09-28: one automatic continuation, shown in the round, at the cost of one more model call).
 * Only the closing paragraph is judged; a report of results, a question or a stated blocker is never held.
 */
// “现在是 19:04”“开始时间是…” state a fact; only “现在去…”“开始改…” announce a step. “我再试一次”“我重新提交” too (seen with
// MiniMax-M3 after a refused edit: it ended on “我用 … 再试一次，由你确认后落地” with nothing sent and nothing to confirm).
const INTENT = /(?:^|[。，,；;：:！!\s（(])(?:现在(?![是有还已在的为共处约大]|\s*\*)|接下来|下面|马上|随后|然后|先|开始(?![时于日前后的是])|我(?:来|先|会|将|要|准备|这就|马上|现在|去|再|重新|改用|直接)|我把(?![^。！!\n]*[了过])|我用(?=[^。！!\n：:]*?(?:删|改|建|写入|加上|调用|提交|发送|撤销|撤回|更新|保存|记下|移动))(?![^。！!\n]*[了过]))|(?<![你您]|可以|可|请)再(?:试|提交|发送|调用)一[次遍下]|\b(?:I'll|I will|I'm going to|let me|now I|next,? I)\b/i;
const SETTLED = /已(?:经)?(?:完成|修改|改好|改完|创建|新建|写入|保存|运行|执行|提交|添加|加上|删除)|完成[了。！!]|通过|成功|失败|报错|无法|不能|做不了|没有权限|未获授权|需要你|请你|请确认|请(?:在|到|去|先|点|打开)|告诉我|你(?:希望|想|要不要|是否)|是否|\b(?:done|finished|completed|passed|failed|cannot|can't|unable)\b/i;

// A whole reply that is one short line opening with the step itself (“调用…读回…，核对…”), not with what came of it.
// Seen from MiniMax-M3: asked to read saved items back, it answered only that line and ended with nothing read.
const PLAN_LINE = /^(?:调用|读取|读回|查看|核对|检查|打开|创建|新建|修改|更新|保存|写入|搜索|查找|查询|抽取|提取|列出|获取|整理|点击|点开|输入|填写|观察|浏览|滚动)(?![了过完好到成])(?![^。！!]*(?:结果|如下|无误|没有问题|没问题|一致))/;

export function announcesWithoutActing(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 600) return false;
  const closing = trimmed.split(/\n+/).map(line => line.trim()).filter(Boolean).at(-1) ?? "";
  if (/[？?]\s*$/.test(closing) || SETTLED.test(closing)) return false;
  return INTENT.test(closing) || (!trimmed.includes("\n") && trimmed.length <= 90 && PLAN_LINE.test(trimmed));
}

/** What the model reads when its announcement is held. */
export const ANNOUNCE_HELD =
  "Your last message only said what you would do next and called no tool, so nothing has happened yet. If the work is not finished, call the tools now. If it is finished, needs the person's decision, or cannot proceed, say so plainly.";

/**
 * A reply that says something was remembered or forgotten, from a round in which no such call succeeded. Seen from
 * MiniMax-M3: it listed the memories and then answered “记下了……”, keeping nothing. Only the closing paragraph counts.
 */
const KEPT = /已(?:经)?(?:记下|记住)|(?:记下|记住)(?:了|啦)|已(?:经)?(?:保存|存)(?:为|到|进)(?:记忆|偏好)|(?:记|存)(?:到|进)(?:了)?(?:项目「[^」]{1,40}」里|个人(?:偏好|记忆)|你的(?:偏好|记忆))|用\s*remember|\b(?:I(?:'ve| have) (?:noted|saved|remembered)|noted that)\b/i;
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

/** What the model reads when it claimed a memory change in a round the person gave no memory (switched off in settings). */
export const MEMORY_OFF_HELD =
  "The person has switched off forming memories, so this round cannot keep or forget anything and nothing was kept. Say plainly that you did not keep it, that it still applies within this work, and that they can turn on “允许记住” under 设置 · 个人 · 记忆.";

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
  if (!trimmed || trimmed.length > 2000 || NOT_MADE.test(trimmed)) return false;
  // The button and its being ready are said in one sentence. A browser round that tells of a page's 「清除」按钮 and ends
  // with “我停在这里了” claims no button of its own.
  return trimmed.split(/[。！？!?\n]+/u).some(sentence => BUTTON.test(sentence) && READY.test(sentence));
}

/**
 * A reply that says something was saved, created or changed in a place the person keeps things, from a round in which
 * no change succeeded. Seen from MiniMax M3.1: asked to note an idea, it answered “记下了……已经存到 Jelly 灵感里” with no
 * call at all, and nothing was kept. Memory claims have their own check; a pending confirmation or an offer is no claim.
 */
const SAVED = /已(?:经)?(?:保存|存|记(?!住)|写入|写|加入|加|添加|新建|创建|建|安排|放|排|改|更新|修改|删除|删|移)|(?:记|存|建|加|写|改|删|排|放)(?:好|下|进去|进|到)了|记下了/;
const PLACE = /待办|日历|日程|Jelly|灵光|灵感|笔记|文档|Pages|表单|Goal|目标|资料架|Shelf|工作区|看板|\b(?:todo|calendar|note|document|page)s?\b/i;
const NOT_SAVED = /(?:没有|没|未|还没|无法|不能|不会|没能)(?:保存|存|记|写|加|建|创建|新建|添加|改|修改|删|安排|放)|确认后|等你确认|需要你确认|请确认|要不要|是否要|可以帮你|\b(?:not|didn't|couldn't|wasn't)\b/i;
export function claimsSavedChange(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 2000 || /[？?]\s*$/.test(trimmed)) return false;
  return SAVED.test(trimmed) && PLACE.test(trimmed) && !NOT_SAVED.test(trimmed);
}

/** What the model reads when it said something was saved or created but no change succeeded this round. */
export const SAVED_CLAIM_HELD =
  "You said it was saved, created or changed, but no change succeeded in this round, so nothing was kept. If the person asked for it, make the change now with the tools; if it was done in an earlier round, say that it was done earlier; otherwise say plainly that it was not done.";

/** What the model reads when it said a button is ready but made none. */
export const BUTTON_CLAIM_HELD =
  "You said a button or card is ready, but no suggest-action call succeeded in this round, so the person has nothing new to click. If they asked for a button now, call suggest-action for it; if you meant one offered in an earlier round, say that it is that earlier one; otherwise say plainly that no button was made.";

/**
 * A reply that writes a tool call out as text instead of making it. Seen from MiniMax-M3: asked for buttons, it
 * answered with “[suggest-action] … capability_id: pages.create …” blocks, so the person saw markup and no card.
 * Held once whatever the round's execution: nothing it wrote happened.
 */
// Every tool a business round can be given, from the same constants that register them: a new tool is covered by itself.
export const GUARDED_TOOL_NAMES: readonly string[] = [...Object.values(GATEWAY_TOOLS), ...Object.values(DELEGATION_TOOLS), ...Object.values(MEMORY_TOOLS),
  ...APP_MODE_SYSTEM_TOOLS, ...APP_MODE_SURFACE_TOOLS];
const TOOL_NAMES = GUARDED_TOOL_NAMES.join("|");
const WRITTEN_CALL = new RegExp(`\\[\\/?(?:${TOOL_NAMES})\\]|<\\/?(?:${TOOL_NAMES})>|(?:^|\\n)\\s*(?:capability_id|provider_id)\\s*[:=：]|"capability_id"\\s*:`);
export function writesToolCallAsText(text: string): boolean {
  return WRITTEN_CALL.test(text);
}

/** What the model reads when it wrote a call instead of making it. */
export const WRITTEN_CALL_HELD =
  "Your reply wrote a tool call out as text (a [tool] block or capability_id lines), so nothing happened: the person sees that text, not a button or an action. Make the call itself now with the tool, or answer in plain words without it.";


/**
 * A reply that shows the person internal identifiers: a tool's name, a capability id the round found, a UUID, an error
 * code, a field's own name. The instructions already forbid it (use titles and names), yet MiniMax-M3 still wrote “用 pages.create
 * 建好了” and “要不要我帮你把它标上 due_date？”.
 * Only identifiers that cannot be ordinary words count: a file name such as calc.js is never one of them.
 */
const SPOKEN_TOOLS = TOOL_NAMES.split("|").filter(name => name.includes("-"));
const TOOL_WORD = new RegExp(`(?<![\\w./-])(?:${SPOKEN_TOOLS.join("|")})(?![\\w/-])`);
const UUID = /(?<![\w-])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\w-])/i;
const ERROR_CODE = /(?<![\w.])(?:actions|agent|assistant|memory|prologue)\.[a-z]+_[a-z_]+(?![\w.])/;
// A field's own name (due_date, expected_revision): never a word the person uses. Not inside a path, address or file name.
const FIELD_NAME = /(?<![\w./@#:-])[a-z]+(?:_[a-z]+)+(?![\w/@-]|\.\w)/;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function mentionsInternalIds(text: string, capabilityIds: Iterable<string> = []): string[] {
  const found = new Set<string>();
  for (const pattern of [TOOL_WORD, UUID, ERROR_CODE, FIELD_NAME]) {
    const match = pattern.exec(text);
    if (match) found.add(match[0]);
  }
  for (const id of capabilityIds) {
    if (id.length < 4 || !/[._-]/.test(id)) continue;
    if (new RegExp(`(?<![\\w.-])${escape(id)}(?![\\w-]|\\.\\w)`).test(text)) found.add(id);
  }
  return [...found];
}

/** What the model reads when its reply showed internal identifiers. */
export function internalIdsHeld(found: readonly string[]): string {
  return `Your reply shows the person internal identifiers (${found.slice(0, 4).join(", ")}). Write it again naming things by their titles and names — the capability's title, the plugin, the document or project title — and leave the identifiers out. Keep one only if the person asked for that identifier itself.`;
}
