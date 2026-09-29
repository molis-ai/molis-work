import { PLUGIN_COMPONENT_PROP_KEYS, validatePluginPresentation } from '@molis-ai/molis-work-design-system';
import type { AgentBuild } from './agent-model.js';
import { parseModelJson } from './validation.js';

/** Model observations remain advice. Only located, expressible presentation findings can request a repair. */
export function acceptPresentationReview(output: string, build: AgentBuild, screenshots: string[]) {
  const answer = parseModelJson(output) as { issues?: unknown };
  if (!answer || !Array.isArray(answer.issues) || answer.issues.length > 5) throw new Error('视觉复查需要 issues 数组（最多五条）');
  const issues: string[] = [], repairs: string[] = [], design = build.design!;
  for (const raw of answer.issues) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('复查意见需要范围、截图、页面、证据、影响和改法，不能只返回一句文字');
    const item = raw as Record<string, unknown>;
    for (const field of ['scope', 'screenshot', 'pageId', 'evidence', 'impact', 'change'])
      if (typeof item[field] !== 'string' || (item[field] as string).length > 1000 || !String(item[field]).trim()) throw new Error('复查意见缺少有效的 ' + field);
    if (!['presentation', 'design', 'host', 'unverified'].includes(String(item.scope))) throw new Error('复查 scope 只能是 presentation/design/host/unverified');
    if (item.partId !== undefined && typeof item.partId !== 'string') throw new Error('partId 应为组件 id');
    let reason = '';
    const page = design.contract.pages.find(page => page.id === item.pageId), part = design.parts.find(part => part.id === item.partId);
    if (!screenshots.includes(String(item.screenshot))) reason = '截图引用无效';
    else if (!page || (item.partId !== undefined && (!part || part.pageId !== page.id))) reason = '页面或组件引用无效';
    else if (item.scope !== 'presentation') reason = item.scope === 'design' ? '需调整功能或动线设计' : item.scope === 'host' ? '宿主能力问题' : '证据不足，待确认';
    else if (item.property === 'layout') { /* The existing page's composition can be redesigned. */ }
    else if (part && typeof item.property === 'string' && item.property.startsWith('props.') && (PLUGIN_COMPONENT_PROP_KEYS as readonly string[]).includes(item.property.slice(6))) { /* Public prop. */ }
    else if (part && typeof item.property === 'string' && item.property.startsWith('appearance.') && design.presentation) {
      try {
        // Use the renderer's actual validator as the property vocabulary; do not maintain a second list.
        const candidate = structuredClone(design.presentation);
        candidate.parts[part.id] = { ...candidate.parts[part.id], [item.property.slice(11)]: undefined };
        validatePluginPresentation(candidate, design.parts, design.contract);
      } catch { reason = '当前呈现能力不支持该属性'; }
    } else reason = '未指定当前能力支持的呈现属性';
    const text = `${item.screenshot} · ${item.pageId}${item.partId ? '/' + item.partId : ''}：${item.evidence} → ${item.impact} → ${item.change}`;
    issues.push(reason ? '［未自动修改：' + reason + '］' + text : text);
    if (!reason) repairs.push(text);
  }
  return { issues, repairs };
}
