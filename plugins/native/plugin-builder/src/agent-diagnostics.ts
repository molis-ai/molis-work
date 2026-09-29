import type { AgentDesign } from './agent-model.js';

/** A person-readable reason from a failed case's detail (plain text or the runner's JSON diagnosis). */
export function failureReason(detail: string): string {
  try { const info = JSON.parse(detail) as { step?: number; reason?: string; visible?: string }; return (info.step ? '第 ' + info.step + ' 步' : '') + (info.reason ?? '') + (info.visible ? '（界面显示：' + info.visible.slice(0, 80) + '）' : ''); }
  catch { return detail; }
}
/** Reads the runner's diagnosis of a failed step: expected texts present in the part's data but not on screen. */
/**
 * Failures the code agent cannot fix. `display`: the part's own data has the expected text, the part does not show
 * it. `wiring`: the part reads nothing, so what it should show can only arrive through the design (a prefilled field
 * or a shown command result).
 */
export function displayProblem(test: AgentDesign['acceptance'][number], detail: string, parts: AgentDesign['parts']): { type: 'display' | 'wiring' | 'form' | 'choice'; componentId: string; expected: string[]; visible: string; reason?: string } | null {
  let info: { step?: number; componentId?: string; visible?: string; data?: string; reason?: string };
  try { info = JSON.parse(detail); } catch { return null; }
  const step = info.step ? test.steps[info.step - 1] : undefined;
  if (step?.action === 'fill' && info.componentId && /没有.*这个选项/.test(info.reason ?? '')) return { type: 'choice', componentId: info.componentId, expected: [String(step.value)], visible: info.visible ?? '', reason: info.reason };
  // A required field left empty: either another part should have carried it, or the case forgot to fill it.
  if (step?.action === 'submit' && info.componentId && /必填字段是空的/.test(info.reason ?? '')) return { type: 'form', componentId: info.componentId, expected: [], visible: info.visible ?? '', reason: (info.reason ?? '').replace(/^Error:\s*/, '') };
  const expected = step?.action === 'expect' ? [step.text] : step?.action === 'expectOrder' ? step.texts : step?.action === 'expectValue' ? [String(step.value)] : [];
  const flat = (value: string) => value.replace(/\s+/g, ' ');
  if (!expected.length || !info.componentId || typeof info.visible !== 'string') return null;
  const part = parts.find(item => item.id === info.componentId);
  if (part && !part.read) return { type: 'wiring', componentId: info.componentId, expected, visible: info.visible };
  const labels = (part?.props.columns ?? []).map(column => column.label).filter(Boolean);
  if (labels.some(label => expected.some(text => text !== label && flat(text).includes(label)))) return { type: 'display', componentId: info.componentId, expected, visible: info.visible };
  if (!info.data) return null;
  const inData = expected.every(text => flat(info.data!).includes(flat(text))), onScreen = expected.every(text => flat(info.visible!).includes(flat(text)));
  return inData && !onScreen ? { type: 'display', componentId: info.componentId, expected, visible: info.visible } : null;
}
/** Runtime and model errors in words the person can act on; the original stays in the collaboration record. */
export function humanize(text: string): string {
  if (/too many tool turns/i.test(text)) return '代码 Agent 这一轮用完了可用的操作次数，写好的文件都已保留；继续后会从检查结果接着修正';
  if (/验收等待超时/.test(text)) return '界面上等了 20 秒仍没有出现预期的结果';
  if (/timed? ?out|超时/i.test(text) && !/[\u4e00-\u9fa5]/.test(text)) return '等待模型或工具超时，写好的内容都已保留，可以继续';
  if (/credential|api key|401|403/i.test(text) && !/[\u4e00-\u9fa5]/.test(text)) return '模型服务拒绝了请求，请检查模型设置里的密钥和额度';
  return text.replace(/^Error:\s*/, '').replace(/\n\s+at [\s\S]*$/, '');
}
