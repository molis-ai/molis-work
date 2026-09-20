import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { UiHostApi } from '@molis-ai/molis-work-contracts/platform/ui';
import { UiViewRegistry } from '@molis-ai/molis-work-ui-host';
import { VISUAL_FOUNDATION_STYLES, THEME_BOOTSTRAP_SCRIPT, TYPEFACE_STYLES, renderIconSprite } from '@molis-ai/molis-work-design-system';
import { renderWorkbenchDocument, WORKBENCH_UI_SLOTS } from './document-shell.js';

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Bounded installed-app workspace. Does not register a builtin or enable projects. */
export function renderPluginPageWorkspace(input: {
  ui: UiHostApi; manifest: PluginManifest; viewId: string; surface: string;
  model: unknown; basePath: string; development?: boolean;
}): string {
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(input.basePath)) throw new Error('Invalid workspace path');
  const registry = new UiViewRegistry([{manifest:input.manifest,enabled:true}]);
  const views = [...registry.slot('stage'), ...registry.slot('settings')];
  const current = views.find(view => view.view_id === input.viewId);
  if (!current) throw new Error('Plugin view unavailable');
  const content = input.ui.mount({slot:current.slot === 'settings' ? WORKBENCH_UI_SLOTS.settings : WORKBENCH_UI_SLOTS.main,
    contribution:{contribution_id:current.contribution_id,surface:input.surface,model:input.model}}).html;
  const nav = views.map(view => `<a class="plugin-page-nav" href="${escape(input.basePath)}?view=${encodeURIComponent(view.view_id)}"${view.view_id === current.view_id ? ' aria-current="page"' : ''}>${escape(view.title)}</a>`).join('');
  return renderWorkbenchDocument({lang:'zh-CN',title:`${input.manifest.name} · Molis Work`,
    head_html:`<script>${THEME_BOOTSTRAP_SCRIPT}</script><style>${TYPEFACE_STYLES}\n${VISUAL_FOUNDATION_STYLES}\n${STYLES}</style>`,
    body_html:`${renderIconSprite()}<div class="plugin-page-workspace"><aside><p class="plugin-page-brand">Molis Work</p><h1>${escape(input.manifest.name)}</h1><nav aria-label="插件页面">${nav}</nav>${input.development ? '<p class="plugin-page-development">开发预览<br>测试身份与隔离数据<br>不代表真实团队已接通</p>' : ''}</aside><main id="plugin-main">${content}</main></div>`});
}

const STYLES = `
html,body{margin:0;padding:0;min-height:100%;display:block}body{max-width:none}.plugin-page-workspace,.plugin-page-workspace *{box-sizing:border-box}
.icon-sprite{position:absolute;width:0;height:0;overflow:hidden}
.plugin-page-workspace{display:grid;grid-template-columns:208px minmax(0,1fr);min-height:100vh;color:var(--ink);background:var(--paper)}
.plugin-page-workspace>aside{padding:28px 18px;border-right:1px solid var(--line)}
.plugin-page-brand{color:var(--muted);font-size:13px;margin:0 12px 30px}.plugin-page-workspace h1{font-size:20px;font-weight:400;margin:0 12px 22px}
.plugin-page-workspace nav{display:grid;gap:4px}.plugin-page-nav{padding:10px 12px;border-radius:6px;color:var(--ink-soft);text-decoration:none;font-size:14px}
.plugin-page-nav:hover{background:var(--nav-hover)}.plugin-page-nav[aria-current]{background:var(--nav-active);color:var(--ink)}
.plugin-page-development{margin:36px 12px;color:var(--muted);font-size:12px;line-height:1.7}
.plugin-page-workspace>main{min-width:0;padding:36px 40px;max-width:1200px;width:100%;margin:0 auto;align-self:start}
@media(max-width:720px){.plugin-page-workspace{grid-template-columns:1fr}.plugin-page-workspace>aside{padding:16px;border-right:0;border-bottom:1px solid var(--line)}.plugin-page-workspace nav{display:flex;flex-wrap:wrap}.plugin-page-brand,.plugin-page-development{margin:8px 12px}.plugin-page-workspace h1{margin:12px}.plugin-page-workspace>main{padding:24px 18px}}
`;
