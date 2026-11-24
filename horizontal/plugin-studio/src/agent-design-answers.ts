import { isRecord } from '@molis-ai/molis-work-plugin-sdk';
import { normalizeProposal } from './agent-authoring.js';
import type { AgentProposal } from './agent-model.js';

type ProposeOutcome = { kind: 'questions'; questions: string[]; summary: string } | { kind: 'proposals'; proposals: AgentProposal[]; summary: string; dropped: string[] };

/** Interpret a parsed first-round answer using the capabilities the designer was offered. */
export function readStudioProposals(value: unknown, pluginId: string, capabilityIds: readonly string[], clarificationAllowed: boolean): ProposeOutcome {
  if (!isRecord(value)) throw new Error('答案不是 JSON 对象');
  const summary = typeof value.summary === 'string' ? value.summary.slice(0, 2000) : '';
  if (Array.isArray(value.questions) && value.questions.length) {
    if (!clarificationAllowed || value.questions.length > 3 || value.questions.some(question => typeof question !== 'string' || !question.trim() || question.length > 1000))
      throw new Error('已经澄清过一次，这次必须直接给出方案，把仍不确定的地方写成假设放进 summary');
    return { kind: 'questions', questions: value.questions as string[], summary };
  }
  const list = Array.isArray(value.candidates) ? value.candidates : Array.isArray(value.proposals) ? value.proposals : null;
  if (!list || list.length < 2 || list.length > 3) throw new Error('初次要给 2–3 个在页面结构或关键行为上有实质差异的方案（candidates）');
  const dropped: string[] = [];
  const proposals = list.map((item, index) => normalizeProposal(item, index, pluginId, dropped));
  if (new Set(proposals.map(item => item.id)).size !== proposals.length) throw new Error('方案标识重复');
  for (const proposal of proposals) for (const capability of proposal.effects.capabilities ?? [])
    if (!capabilityIds.includes(capability)) throw new Error(`方案 ${proposal.id} 用了能力目录里没有的「${capability}」；目录为空时只能用插件自己的存储`);
  return { kind: 'proposals', proposals, summary, dropped };
}

/** A requested code change must name an operation in the accepted design. */
export function readStudioRework(value: unknown, operations: readonly { id: string }[]): Record<string, string> {
  const rework: Record<string, string> = {};
  const listed = isRecord(value) ? value.rework : undefined;
  for (const item of Array.isArray(listed) ? listed : []) {
    const entry = item as { op?: unknown; operation?: unknown; why?: unknown; change?: unknown };
    const op = String(entry?.op ?? entry?.operation ?? ''), why = String(entry?.why ?? entry?.change ?? '').trim();
    if (!operations.some(operation => operation.id === op)) throw new Error('rework 引用了不存在的操作：' + op);
    if (!why || why.length > 600) throw new Error('rework 的 why 写清要在代码里做的改变（600 字以内）：' + op);
    rework[op] = why;
  }
  return rework;
}
