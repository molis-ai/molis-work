/// <reference lib="dom" />
import type { PluginLayout, PluginPresentation } from './plugin-presentation.js';

/** Self-contained so the HTML-slot browser factory can embed it without imports. */
export function createPluginPresentationClient() {
  const groups = new Map<string, HTMLElement>();
  return {
    update(presentation: PluginPresentation | undefined, pages: Map<string, HTMLElement>, parts: Map<string, { root: HTMLElement }>) {
      const used = new Set<string>();
      const previous = new Map<HTMLElement, HTMLElement>();
      const mount = (parent: HTMLElement, element: HTMLElement) => {
        const last = previous.get(parent);
        const before = last ? last.nextElementSibling : parent.firstElementChild;
        if (before !== element) parent.insertBefore(element, before);
        previous.set(parent, element);
      };
      for (const [pageId, page] of pages) {
        const plan = presentation?.pages.find(item => item.pageId === pageId);
        page.toggleAttribute('data-pc-composed', !!plan);
        if (!plan) continue;
        const place = (node: PluginLayout, parent: HTMLElement, key: string) => {
          if ('part' in node) {
            const el = parts.get(node.part)?.root;
            if (el) mount(parent, el);
            return;
          }
          used.add(key);
          let group = groups.get(key);
          if (!group) { group = document.createElement('div'); group.dataset.slot = 'frame'; groups.set(key, group); }
          group.className = 'pc-layout pc-layout-' + node.layout;
          group.dataset.gap = node.gap ?? 'normal'; group.dataset.ratio = node.ratio ?? 'equal';
          mount(parent, group);
          node.children.forEach((child, index) => place(child, group!, key + '/' + index));
        };
        place(plan.layout, page, pageId);
      }
      for (const [id, element] of groups) if (!used.has(id)) { element.remove(); groups.delete(id); }
      for (const [id, part] of parts) {
        const config = presentation?.parts[id];
        part.root.dataset.density = config?.density ?? 'normal';
        part.root.dataset.measure = config?.measure ?? 'full';
        part.root.dataset.emphasis = config?.emphasis ?? 'secondary';
      }
    },
  };
}

export const PLUGIN_PRESENTATION_STYLES = `
.pc-page[data-pc-composed]{display:block}.pc-page[data-pc-composed]>.pc-region:empty{display:none}
.pc-layout{min-width:0;display:grid;gap:var(--pc-layout-gap,24px);align-items:start}
.pc-layout[data-gap=tight]{--pc-layout-gap:12px}.pc-layout[data-gap=roomy]{--pc-layout-gap:36px}
.pc-layout-split{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.pc-layout-split[data-ratio=main-left]{grid-template-columns:minmax(0,2fr) minmax(0,1fr)}
.pc-layout-split[data-ratio=main-right]{grid-template-columns:minmax(0,1fr) minmax(0,2fr)}
.pc-layout-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}
.pc-node[data-measure=reading]{max-width:72ch;width:100%;justify-self:center}
.pc-node[data-density=compact] .pc-row{padding-block:8px}
.pc-node[data-density=reading] .pc-row{padding-block:18px}
.pc-page[data-pc-composed] .pc-record.mw-dir-row-wrap{display:flex;flex-direction:column;align-items:stretch}
.pc-page[data-pc-composed] .pc-record>.pc-row-actions{display:flex;align-self:stretch;justify-self:stretch;justify-content:flex-start;max-width:100%;padding:0 12px 10px;gap:6px}
.pc-page[data-pc-composed] .pc-row-actions .pc-row-action{width:auto;max-width:100%;padding:4px 8px;height:auto}
.pc-page[data-pc-composed] .pc-row-action [data-slot=button-label]{white-space:normal;overflow-wrap:anywhere}
.pc-page[data-pc-composed] .pc-record[aria-current=true]{background:var(--nav-active)!important;box-shadow:inset 2px 0 0 var(--ink-soft)}
.pc-page[data-pc-composed] .pc-node[data-header-action]{display:contents}
.pc-page[data-pc-composed] .pc-node[data-header-action]>.pc-part-head,.pc-page[data-pc-composed] .pc-node[data-header-action]>[data-pc-description]{display:none}
.pc-page[data-pc-composed] .pc-node[data-header-action]>.pc-output:empty,.pc-page[data-pc-composed] .pc-node[data-header-action]>[data-pc-feedback]:empty{display:none}
.pc-page[data-pc-composed] .pc-node[data-header-action]>[data-pc-feedback]{justify-self:start}
.pc-detail-layout{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,2fr);gap:32px;align-items:start}
.pc-node[data-has-detail]{container-type:inline-size}
.pc-detail-pane{min-width:0;border-left:1px solid var(--line);padding:8px 0 24px 32px}
.pc-detail-pane h2,.pc-single-record h2{font-size:24px;font-weight:400;line-height:1.35;margin:0 0 20px;text-wrap:balance}
.pc-detail-copy{font-size:15px;line-height:1.85;max-width:68ch;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.pc-detail-meta{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:12px;margin:24px 0}
.pc-detail-back{display:none;margin-bottom:20px}.pc-detail-empty{color:var(--muted);padding:40px 0;font-size:14px}
.pc-node[data-reading-preview] .pc-directory .pc-record-text{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal}
.pc-detail-source .pc-record{flex-wrap:wrap}.pc-detail-source .pc-row{width:100%}.pc-detail-source .pc-row-actions{padding:0 12px 10px}
.pc-detail-source [data-pc-select]{text-align:left}.pc-detail-source .pc-record[aria-current=true]{background:var(--nav-active)!important;box-shadow:none}
@container(max-width:680px){.pc-layout-split,.pc-layout-split[data-ratio]{grid-template-columns:minmax(0,1fr)}.pc-detail-layout{display:block}.pc-detail-pane{border:0;padding:0}.pc-detail-back{display:inline-flex}.pc-detail-layout:not([data-detail-open]) .pc-detail-pane{display:none}.pc-detail-layout[data-detail-open] .pc-detail-source{display:none}.pc-layout[data-gap=roomy]{--pc-layout-gap:24px}}
`;
