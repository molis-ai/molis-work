/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { PluginComponentNode } from './plugin-components.js';
import type { PluginPresentation } from './plugin-presentation.js';
import { createPluginPresentationClient as present } from './plugin-presentation-client.js';
import type { Ctl, Det, Kit, Out, Prt, Qry, Rec, Rel, State, Sub } from './plugin-component-types.js';
import { pcKit } from './plugin-component-kit.js';
import { pcRecords, pcRelations } from './plugin-component-records.js';
import { pcControls, pcDetail } from './plugin-component-controls.js';
import { pcOutput, pcQuery } from './plugin-component-output.js';
import { pcPart, pcSubmit } from './plugin-component-part.js';
export interface PluginComponentView { contract: SandboxPluginContract; nodes: PluginComponentNode[]; connected: string[]; presentation?: PluginPresentation }
export interface PluginComponentClientOptions { root: HTMLElement; call(nodeId: string, binding: 'read' | 'submit', payload: unknown): Promise<unknown>; inspect?(nodeId: string): void;
  /** The inspect button's label (the studio passes it translated). */
  inspectLabel?: string;
  /** Observe only accepted query results, with the same request/selection ordering as the rendered view. */
  onRead?(nodeId: string, result: { value: unknown } | { error: string }): void;
}

/**
 * Host-owned browser renderer: model data is always text; generated code never runs in this page. Every part is drawn
 * with the UI catalog's own components (`mw-*`, `/__ui/catalog`), so a generated plugin looks and themes like the rest
 * of the product. The part's kind is the catalog component it was given; kinds from older builds map onto the catalog.
 */
export function createPluginComponentClient(options: PluginComponentClientOptions) {
  const kit = pcKit(), { make } = kit;
  const root = options.root; root.classList.add('pc-view');
  const tabs = make('nav', undefined, 'mw-tabs pc-tabs'), tabList = make('div', undefined, 'mw-tabs__list'); tabs.dataset.slot = 'tabs'; tabList.setAttribute('role', 'tablist'); tabList.setAttribute('aria-label', '插件页面'); tabs.append(tabList); root.append(tabs);
  const state: State = { options, root, composition: present(), tabs, tabList, view: undefined, currentPage: '', selection: {}, disposed: false, epoch: 0, fresh: false,
    selectionVersions: new Map(), parts: new Map(), pages: new Map(), regions: new Map(), details: new Map(), refresh: async () => [] };
  // Each layer is a function of the state plus what the layers before it added.
  const c1 = Object.assign(state, kit), c2 = Object.assign(c1, pcRelations(c1)), c3 = Object.assign(c2, pcRecords(c2), pcDetail(c2), pcControls(c2));
  const c4 = Object.assign(c3, pcOutput(c3)), c5 = Object.assign(c4, pcQuery(c4)), c6 = Object.assign(c5, pcSubmit(c5)), c7 = Object.assign(c6, pcPart(c6));
  const { update, destroy } = pcLifecycle(c7);
  return { update, refresh: c7.refresh, destroy };
}
function pcLifecycle(c: State & Kit & Rel & Rec & Det & Ctl & Out & Qry & Sub & Prt) {
  const { root, tabs, tabList, composition, selectionVersions, parts, pages, regions, details, make, headingOf, detailEnabled, ready, rowHost, rowLabel, signature, selectPage, showDetail, syncChoices, query, refresh, createPart } = c;
  async function update(next: PluginComponentView) {
    if (c.disposed) return;
    const refreshNeeded = !c.view || JSON.stringify([c.view.contract.revision, c.view.nodes, c.view.connected]) !== JSON.stringify([next.contract.revision, next.nodes, next.connected]);
    const focused = root.contains(document.activeElement) ? document.activeElement as HTMLInputElement : null;
    const caret = focused && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : undefined;
    if (c.view?.contract.revision !== next.contract.revision) { c.epoch++; c.selection = {}; selectionVersions.clear(); }
    c.view = next;
    const pageIds = new Set<string>(), regionIds = new Set<string>(), partIds = new Set<string>(); tabList.replaceChildren();
    // A single page needs no page switcher.
    tabs.hidden = next.contract.pages.length < 2;
    for (const page of next.contract.pages) {
      pageIds.add(page.id); let element = pages.get(page.id);
      if (!element) { element = make('div', undefined, 'pc-page'); element.dataset.page = page.id; pages.set(page.id, element); root.append(element); }
      const tab = make('button', page.title, 'mw-tabs__tab'); tab.type = 'button'; tab.dataset.page = page.id; tab.setAttribute('role', 'tab'); tab.addEventListener('click', () => { selectPage(page.id); void refresh(); }); tabList.append(tab);
      for (const region of page.regions) {
        const key = page.id + '/' + region.id; regionIds.add(key); let section = regions.get(key);
        if (!section) { section = make('section', undefined, 'pc-region'); section.setAttribute('aria-label', region.title); regions.set(key, section); element.append(section); }
        let previousPart: HTMLElement | undefined;
        for (const node of next.nodes.filter(item => item.pageId === page.id && item.regionId === region.id)) {
          partIds.add(node.id); let part = parts.get(node.id);
          if (!part || part.signature !== signature(node)) {
            const previous = part, active = document.activeElement as HTMLInputElement | null;
            const focused = previous?.root.contains(active) ? active?.name : undefined;
            const values = new Map<string, { value: string; checked?: boolean }>();
            previous?.form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]').forEach(input => values.set(input.name, { value: input.value, ...('checked' in input ? { checked: input.checked } : {}) }));
            clearTimeout(previous?.feedbackTimer); previous?.opener?.remove(); details.delete(node.id);
            const replacement = createPart(node); previous?.root.replaceWith(replacement.root); part = replacement; parts.set(node.id, part);
            replacement.form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]').forEach(input => { const saved = values.get(input.name); if (saved) { input.value = saved.value; if ('checked' in input && saved.checked !== undefined) input.checked = saved.checked; } if (focused === input.name) input.focus(); });
            if (replacement.form) syncChoices(replacement.form);
          } else {
            // Label-only changes update in place, so the person's input, focus and caret stay where they were.
            const before = part.node; part.node = node;
            const heading = part.root.querySelector<HTMLElement>('[data-pc-title]'); if (heading) { heading.textContent = node.intent === 'heading' ? headingOf(node) : node.props.title ?? ''; heading.hidden = !heading.textContent; if (heading.parentElement?.classList.contains('pc-part-head')) heading.parentElement.hidden = heading.hidden; }
            const submit = part.form?.querySelector<HTMLButtonElement>('[type=submit]'); if (submit) submit.textContent = node.props.submitLabel || '提交';
            if (part.opener) part.opener.querySelector('[data-slot=button-label]')!.textContent = part.dialog ? node.props.title || node.props.submitLabel || '新建' : rowLabel(node);
            const overlay = part.dialog ?? part.confirm;
            if (overlay) {
              overlay.querySelector('h2')!.textContent = part.dialog ? node.props.title || node.props.submitLabel || '新建' : '确定要' + rowLabel(node) + '吗？';
              const hint = overlay.querySelector<HTMLElement>('[data-pc-overlay-description]')!;
              if (part.dialog) { hint.textContent = node.props.description ?? ''; hint.hidden = !hint.textContent; }
              const confirmLabel = part.confirm?.querySelector('[data-pc-confirm-yes] [data-slot=button-label]'); if (confirmLabel) confirmLabel.textContent = rowLabel(node);
            }
            const description = part.root.querySelector<HTMLElement>('[data-pc-description]'); if (description) { description.textContent = node.props.description ?? ''; description.hidden = !node.props.description; }
            part.root.setAttribute('aria-label', node.props.title || node.purpose);
            const { title: _t, description: _d, submitLabel: _s, ...shownProps } = node.props, { title: _bt, description: _bd, submitLabel: _bs, ...wasShown } = before.props;
            if (JSON.stringify(shownProps) !== JSON.stringify(wasShown)) void query(part);
          }
          // Parts appear in the view's order; a part already in place is not moved, so focus and input stay.
          const expected = previousPart ? previousPart.nextElementSibling : section.firstElementChild;
          if ((!next.presentation && expected !== part.root) || !part.root.isConnected) section.insertBefore(part.root, expected);
          previousPart = part.root;
          const ids = [node.read?.operationId, node.submit?.operationId].filter(Boolean) as string[], live = ids.every(ready);
          // Whether this part works yet: the studio shows it while building; people using the plugin never see it.
          if (ids.length) part.root.dataset.live = String(live); else delete part.root.dataset.live;
          part.form?.querySelectorAll<HTMLButtonElement>('[type=submit]').forEach(submit => { submit.disabled = part!.busy || !ready(node.submit?.operationId); });
          if (part.opener) part.opener.disabled = !ready(node.submit?.operationId);
        }
      }
    }
    for (const [id, part] of parts) if (!partIds.has(id)) { part.query++; clearTimeout(part.feedbackTimer); part.opener?.remove(); part.root.remove(); parts.delete(id); details.delete(id); }
    for (const part of parts.values()) {
      const hasReader = detailEnabled(part.node.id) || next.nodes.some(other => other.id !== part.node.id && other.props.textField && Object.values(other.read?.input ?? {}).some(source => source.source === 'selection' && source.componentId === part.node.id));
      part.root.toggleAttribute('data-reading-preview', !!next.presentation && part.node.kind === 'directory' && hasReader);
      // A record action has no block of its own; what it reports, and the question it asks, go with the collection it acts on.
      const host = rowHost(part.node), home = host ? parts.get(host)?.root : part.root; part.root.hidden = !!host;
      if (home && part.feedback.parentElement !== home) home.append(part.feedback);
      if (home && part.confirm && part.confirm.parentElement !== home) home.append(part.confirm);
      // A page's "new" buttons sit in its header, on the right, when the page has one.
      const head = part.opener && !host && [...parts.values()].find(other => other.node.pageId === part.node.pageId && other.node.kind === 'frame')?.root.querySelector('.pc-app-actions');
      part.root.toggleAttribute('data-header-action', !!head);
      for (const button of [part.opener, part.form?.querySelector<HTMLButtonElement>('[type=submit]')]) if (button && !button.classList.contains('mw-btn--danger-outline')) {
        const primary = next.presentation ? next.presentation.parts[part.node.id]?.emphasis === 'primary' : true;
        button.classList.toggle('mw-btn--primary', primary); button.classList.toggle('mw-btn--secondary', !primary);
      }
      if (part.opener && !host) { const place = head || part.root; if (part.opener.parentElement !== place) place.prepend(part.opener); }
    }
    for (const [id, region] of regions) if (!regionIds.has(id)) { region.remove(); regions.delete(id); }
    for (const [id, page] of pages) if (!pageIds.has(id)) { page.remove(); pages.delete(id); }
    composition.update(next.presentation, pages, parts);
    for (const part of parts.values()) showDetail(part);
    if (focused?.isConnected && !focused.closest('[hidden]')) { focused.focus({ preventScroll: true }); if (caret) focused.setSelectionRange(caret[0]!, caret[1]!); }
    selectPage(pageIds.has(c.currentPage) ? c.currentPage : next.contract.pages[0]!.id); if (refreshNeeded) await refresh();
  }
  function destroy() { c.disposed = true; c.epoch++; for (const part of parts.values()) { clearTimeout(part.waiting); clearTimeout(part.feedbackTimer); } parts.clear(); details.clear(); pages.clear(); regions.clear(); root.replaceChildren(); }
  return { update, destroy };
}
/** The renderer layers are plain functions so the whole client can be sent to a page as source (`toString`); they use nothing from this module. */
const CLIENT_LAYERS = [pcKit, pcRelations, pcRecords, pcDetail, pcControls, pcOutput, pcQuery, pcSubmit, pcPart, pcLifecycle, createPluginComponentClient];
export const PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT = '((present)=>{' + CLIENT_LAYERS.map(layer => layer.toString()).join(';') + ';return createPluginComponentClient})(' + present.toString() + ')';
