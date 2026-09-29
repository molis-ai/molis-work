/**
 * A round that ends by saying what it will do next, with nothing done.
 *
 * Some models close a round with "现在去改 calc.js" and no tool call: the person reads a promise, and nothing has
 * happened. For rounds that may change things, the Host holds such an ending once and lets the model continue (the
 * person chose this on 2026-09-28: one automatic continuation, shown in the round, at the cost of one more model call).
 * Only the closing paragraph is judged; a report of results, a question or a stated blocker is never held.
 */
// “现在是 19:04”“开始时间是…” state a fact; only “现在去…”“开始改…” announce a step.
const INTENT = /(?:^|[。，,；;：:！!\s（(])(?:现在(?![是有还已在的为共处约大]|\s*\*)|接下来|下面|马上|随后|然后|先|开始(?![时于日前后的是])|我(?:来|先|会|将|要|准备|这就|马上|现在|去))|\b(?:I'll|I will|I'm going to|let me|now I|next,? I)\b/i;
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
