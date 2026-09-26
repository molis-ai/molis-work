/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { PluginComponentNode } from './plugin-components.js';
export interface PluginComponentView { contract: SandboxPluginContract; nodes: PluginComponentNode[]; connected: string[] }
export interface PluginComponentClientOptions { root: HTMLElement; call(nodeId: string, binding: 'read' | 'submit', payload: unknown): Promise<unknown>; inspect?(nodeId: string): void }

/** Host-owned browser renderer: model data is always text; generated code never runs in this page. */
export function createPluginComponentClient(options: PluginComponentClientOptions) {
  const root = options.root; root.classList.add('pc-view');
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
    const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el;
  };
  /** The schema a binding's output path points at, from the contract in view. */
  const pluginSchemaOf = (operationId?: string, path?: string) => {
    let schema = view?.contract.operations.find(op => op.id === operationId)?.output;
    for (const key of path ? path.split('.') : []) schema = schema?.type === 'object' ? schema.properties?.[key] : undefined;
    return schema;
  };
  const text = (value: unknown): string => value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  /** How a record's field reads: the column's own words for its values, 是/否 for a plain boolean. */
  const shown = (column: { field?: string; values?: Record<string, string> } | undefined, value: unknown): unknown =>
    column?.values && Object.hasOwn(column.values, text(value)) ? column.values[text(value)] : typeof value === 'boolean' ? value ? '是' : '否' : value;
  /** Model answers often carry light Markdown: show **emphasis**, drop heading marks. Always text nodes, never markup. */
  const prose = <K extends keyof HTMLElementTagNameMap>(tag: K, value: unknown) => {
    const element = make(tag), source = text(value).replace(/^#{1,6}\s+/gmu, '');
    for (const [index, piece] of source.split(/\*\*([^*\n][^*]*?)\*\*/u).entries()) element.append(index % 2 ? make('strong', piece) : document.createTextNode(piece));
    return element;
  };
  const at = (value: unknown, path?: string): unknown => {
    if (!path) return value;
    for (const key of path.split('.')) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || !value || typeof value !== 'object' || !Object.hasOwn(value, key)) return undefined;
      value = (value as Record<string, unknown>)[key];
    } return value;
  };
  const tabs = make('nav', undefined, 'pc-tabs'); tabs.setAttribute('aria-label', '插件页面'); root.append(tabs);
  let view: PluginComponentView | undefined, currentPage = '', selection: Record<string, unknown> = {}, disposed = false, epoch = 0;
  const selectionVersions = new Map<string, number>();
  const pages = new Map<string, HTMLElement>(), regions = new Map<string, HTMLElement>();
  interface Part { node: PluginComponentNode; root: HTMLElement; output: HTMLElement; status: HTMLElement; feedback: HTMLElement; form?: HTMLFormElement; filter?: HTMLElement; waiting?: ReturnType<typeof setTimeout>; busy: boolean; query: number; signature: string; prefilled: Map<string, number> }
  const parts = new Map<string, Part>();
  const ready = (id?: string) => !!id && !!view?.connected.includes(id);
  const collections = new Set<PluginComponentNode['kind']>(['list', 'cards', 'table', 'calendar']);
  /** A part whose whole input is the chosen record of one collection on its page acts on a record: it shows as a button on each record. */
  const rowHost = (node: PluginComponentNode): string | undefined => {
    if (node.read || !node.submit) return undefined;
    const sources = Object.values(node.submit.input), hosts = new Set(sources.flatMap(source => source.source === 'selection' ? [source.componentId] : []));
    const [host] = hosts;
    return hosts.size === 1 && sources.every(source => source.source !== 'form') && view?.nodes.some(other => other.id === host && other.pageId === node.pageId && collections.has(other.kind)) ? host : undefined;
  };
  const rowLabel = (node: PluginComponentNode) => (node.props.submitLabel || node.props.title || node.purpose).replace(/选中的?/gu, '').trim() || '执行';
  const selectable = (componentId: string) => !!view?.nodes.some(other => rowHost(other) !== componentId && [other.read, other.submit].some(binding => Object.values(binding?.input ?? {})
    .some(source => source.source === 'selection' && source.componentId === componentId || source.source === 'form' && source.prefill?.componentId === componentId)));
  const signature = (node: PluginComponentNode) => JSON.stringify({ kind: node.kind, read: node.read, submit: node.submit, input: view?.contract.operations.find(op => op.id === node.submit?.operationId)?.input });
  const selectPage = (id: string) => {
    currentPage = id; pages.forEach((page, key) => { page.hidden = key !== id; });
    tabs.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.setAttribute('aria-selected', String(button.dataset.page === id)));
  };
  function select(id: string, value: unknown) { selection[id] = value; selectionVersions.set(id, (selectionVersions.get(id) ?? 0) + 1); }
  function output(part: Part, raw: unknown, binding: 'read' | 'submit') {
    const node = part.node, value = at(raw, node[binding]?.outputPath), fragment = document.createDocumentFragment();
    if (value && typeof value === 'object' && !Array.isArray(value)) fragment.append(figures(value as Record<string, unknown>, pluginSchemaOf(node[binding]?.operationId, node[binding]?.outputPath), 0));
    else if (!Array.isArray(value)) fragment.append(prose('p', value));
    else if (!value.length) fragment.append(make('p', node.props.emptyText || '这里还没有内容。', 'pc-empty'));
    else {
      const table = ['table', 'matrix'].includes(node.kind), first = value[0];
      // Without configured columns a table shows the record's own fields rather than an empty grid.
      const configured = node.props.columns?.length ? node.props.columns : first && typeof first === 'object' && !Array.isArray(first)
        ? Object.keys(first as Record<string, unknown>).filter(key => key !== node.props.idField).slice(0, 8).map(field => ({ field, label: field })) : [];
      // A table leads with the record's title and text, named after the contract's own field descriptions.
      const described = (field: string) => { const items = pluginSchemaOf(node.read?.operationId, node.read?.outputPath); return (items?.type === 'array' ? items.items : items)?.properties?.[field]?.description || field; };
      const lead = table && node.props.columns?.length ? [...new Set([node.props.titleField, node.props.textField])].filter((field): field is string => !!field && !configured.some(column => column.field === field)).map(field => ({ field, label: described(field) })) : [];
      const columns = [...lead, ...configured];
      const container = make(table ? 'table' : 'div', undefined, table ? 'pc-table' : 'pc-' + node.kind), body = table ? make('tbody') : container;
      if (table) { const head = make('thead'), tr = make('tr'); for (const column of columns) tr.append(make('th', column.label)); tr.append(make('th', node.kind === 'reader' || selectable(node.id) ? '选择' : '')); head.append(tr); container.append(head); }
      for (const [index, row] of value.entries()) {
        const item = make(table ? 'tr' : 'article', undefined, 'pc-record'); item.dataset.recordId = text(at(row, node.props.idField)) || String(index);
        item.id = 'pc-' + node.id + '-' + encodeURIComponent(item.dataset.recordId);
        if (node.props.roleField) item.dataset.role = text(at(row, node.props.roleField));
        if (table) for (const column of columns) item.append(make('td', text(shown(column, at(row, column.field)))));
        else {
          if (node.props.titleField) item.append(make('h3', text(at(row, node.props.titleField))));
          if (node.props.textField) item.append(prose('p', at(row, node.props.textField)));
          // Columns also apply to lists and cards: the extra fields show under the title, whichever kind was chosen.
          const extra = (node.props.columns ?? []).filter(column => column.field !== node.props.titleField && column.field !== node.props.textField && at(row, column.field) !== undefined && at(row, column.field) !== null && at(row, column.field) !== '');
          if (extra.length) { const list = make('dl', undefined, 'pc-fields'); for (const column of extra) list.append(make('dt', column.label || column.field), prose('dd', shown(column, at(row, column.field)))); item.append(list); }
          if (!node.props.textField && !node.props.titleField && !extra.length) {
            // No display fields configured: a readable field list, never a raw JSON dump.
            const fields = row && typeof row === 'object' && !Array.isArray(row) ? Object.entries(row as Record<string, unknown>).filter(([key]) => key !== node.props.idField).slice(0, 6) : [];
            if (fields.length) { const list = make('dl', undefined, 'pc-fields'); for (const [key, value] of fields) list.append(make('dt', key), prose('dd', shown(undefined, value))); item.append(list); }
            else item.append(make('p', text(row)));
          }
        }
        if (node.props.hintLevelField) { const level = text(at(row, node.props.hintLevelField)); if (level) item.append(make('span', '提示级别 ' + level, 'pc-reference')); }
        const citations = node.props.citationsField ? at(row, node.props.citationsField) : undefined;
        if (Array.isArray(citations)) for (const citation of citations) {
          const componentId = at(citation, 'componentId'), recordId = at(citation, 'recordId');
          if (typeof componentId !== 'string' || typeof recordId !== 'string' || !view?.nodes.some(part => part.id === componentId && part.kind === 'reader')) continue;
          const link = make('button', text(at(citation, 'label')) || '查看原文', 'pc-row-action'); link.type = 'button';
          link.addEventListener('click', async () => { const reader = parts.get(componentId); if (!reader) return; selectPage(reader.node.pageId); await refresh(); document.getElementById('pc-' + componentId + '-' + encodeURIComponent(recordId))?.scrollIntoView({ block: 'center' }); }); item.append(link);
        }
        const choose = () => { select(node.id, row); part.output.querySelectorAll('[aria-current]').forEach(el => el.removeAttribute('aria-current')); item.setAttribute('aria-current', 'true'); };
        const actions: HTMLButtonElement[] = [];
        // "Choose" only where another part actually consumes this component's selection.
        if (node.kind === 'reader' || selectable(node.id)) {
          const button = make('button', node.kind === 'reader' ? '引用这一节' : '选择', 'pc-row-action'); button.type = 'button'; button.dataset.pcSelect = '';
          button.addEventListener('click', () => { choose(); void refresh(); }); actions.push(button);
        }
        // An action on one record sits on that record.
        for (const action of view?.nodes.filter(other => rowHost(other) === node.id) ?? []) {
          const button = make('button', rowLabel(action), 'pc-row-action'); button.type = 'button'; button.dataset.pcAction = action.id; button.disabled = !ready(action.submit!.operationId);
          button.addEventListener('click', () => { choose(); parts.get(action.id)?.form?.requestSubmit(); }); actions.push(button);
        }
        if (table) { const td = make('td'); td.append(...actions); item.append(td); }
        else if (actions.length) { const bar = make('div', undefined, 'pc-row-actions'); bar.append(...actions); item.append(bar); }
        body.append(item);
      }
      if (table) container.append(body);
      const wrap = make('div', undefined, table ? 'pc-table-wrap' : undefined); wrap.append(container); fragment.append(wrap);
    }
    part.output.replaceChildren(fragment);
  }
  /** A field's typed value, or undefined when left empty (an optional filter left at 全部). */
  function fieldValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, spec: { type: string }): unknown {
    if (spec.type === 'boolean') return input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value === '' ? undefined : input.value === 'true';
    if (input.value === '') return undefined;
    return ['number', 'integer'].includes(spec.type) ? Number(input.value) : ['object', 'array', 'null'].includes(spec.type) ? JSON.parse(input.value) : input.value;
  }
  function filterValues(part: Part): Record<string, unknown> | null {
    const binding = part.node.read!, schema = view!.contract.operations.find(op => op.id === binding.operationId)!.input, values: Record<string, unknown> = {};
    for (const input of part.filter?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]') ?? []) {
      const value = fieldValue(input, schema.properties![input.dataset.field!]!);
      if (value !== undefined) values[input.name] = value;
      else if (schema.required?.includes(input.dataset.field!)) return null;
    }
    return values;
  }
  /** An object result (a total, a breakdown) as labelled figures; a nested list of records as a small table. */
  function figures(record: Record<string, unknown>, schema: ReturnType<typeof pluginSchemaOf>, depth: number): HTMLElement {
    const list = make('dl', undefined, 'pc-fields pc-figures');
    for (const [key, value] of Object.entries(record).slice(0, 24)) {
      const spec = schema?.type === 'object' ? schema.properties?.[key] : undefined;
      const records = Array.isArray(value) && value.length > 0 && value.every(item => item && typeof item === 'object' && !Array.isArray(item));
      // An undescribed list needs no label: its table names its own columns.
      if (spec?.description || !records) list.append(make('dt', spec?.description || key));
      const cell = make('dd', undefined, spec?.description || !records ? undefined : 'pc-figures-wide');
      if (Array.isArray(value) && value.every(item => item && typeof item === 'object' && !Array.isArray(item)) && value.length) {
        const items = spec?.type === 'array' ? spec.items : undefined, keys = Object.keys(value[0] as object).slice(0, 6);
        const table = make('table', undefined, 'pc-table'), head = make('tr'), body = make('tbody');
        for (const field of keys) head.append(make('th', (items?.type === 'object' ? items.properties?.[field]?.description : undefined) || field));
        for (const row of value.slice(0, 50) as Array<Record<string, unknown>>) { const tr = make('tr'); for (const field of keys) tr.append(make('td', text(shown(undefined, row[field])))); body.append(tr); }
        const thead = make('thead'); thead.append(head); table.append(thead, body); cell.append(table);
      } else if (value && typeof value === 'object' && !Array.isArray(value) && depth < 2) cell.append(figures(value as Record<string, unknown>, spec, depth + 1));
      else cell.append(prose('span', shown(undefined, value)));
      list.append(cell);
    }
    return list;
  }
  async function query(part: Part) {
    const binding = part.node.read;
    if (part.node.pageId !== currentPage || !binding || !ready(binding.operationId) || Object.values(binding.input).some(source => source.source === 'selection' && at(selection[source.componentId], source.field) === undefined)) return;
    const form = filterValues(part);
    // A required filter left empty: nothing to show yet, and no read.
    if (!form) { part.query++; part.output.replaceChildren(make('p', '选好上面的条件后显示', 'pc-empty')); return; }
    const ticket = ++part.query, generation = epoch;
    try {
      const result = await options.call(part.node.id, 'read', { selection, form });
      if (!disposed && generation === epoch && ticket === part.query && parts.get(part.node.id) === part) {
        output(part, result, 'read');
        // An error a read left goes once a read succeeds; a failed save's message stays with the person's input.
        if (part.feedback.dataset.pcRead !== undefined) { part.feedback.className = ''; part.feedback.textContent = ''; delete part.feedback.dataset.pcRead; }
      }
    }
    catch (error) { if (!disposed && generation === epoch && ticket === part.query) { part.feedback.className = 'pc-error'; part.feedback.textContent = error instanceof Error ? error.message : '读取失败，稍后可以重试'; part.feedback.dataset.pcRead = ''; } }
  }
  function refresh() {
    for (const part of parts.values()) for (const source of Object.values(part.node.submit?.input ?? {})) if (source.source === 'form' && source.prefill) {
      const version = selectionVersions.get(source.prefill.componentId); if (version === undefined || part.prefilled.get(source.field) === version) continue;
      const value = at(selection[source.prefill.componentId], source.prefill.field);
      const input = [...part.form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]') ?? []].find(field => field.name === source.field);
      if (input && value !== undefined) { if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(value); else input.value = text(value); part.prefilled.set(source.field, version); }
    }
    return Promise.all([...parts.values()].map(query));
  }
  function createPart(node: PluginComponentNode): Part {
    const element = make('section', undefined, 'pc-node'); element.dataset.componentId = node.id;
    const header = make('header'), status = make('span', '', 'pc-status'); header.append(make(node.kind === 'heading' ? 'h1' : 'h2', node.props.title || node.purpose), status); element.append(header);
    if (node.props.description) element.append(make('p', node.props.description, 'pc-description'));
    if (options.inspect) { const button = make('button', '检查零件', 'pc-inspect'); button.type = 'button'; button.addEventListener('click', () => options.inspect?.(node.id)); element.append(button); }
    const content = make('div', undefined, 'pc-output'), feedback = make('div'); feedback.dataset.pcFeedback = node.id; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    const part: Part = { node, root: element, output: content, status, feedback, busy: false, query: 0, signature: signature(node), prefilled: new Map() };
    const reading = node.read && Object.entries(node.read.input).filter(([, source]) => source.source === 'form');
    if (reading?.length) {
      // The filter bar: the read's own inputs, re-read on change; typing waits a moment, and says so while it waits.
      const schema = view!.contract.operations.find(op => op.id === node.read!.operationId)!.input, filter = make('div', undefined, 'pc-filter'); filter.setAttribute('role', 'search');
      for (const [field, source] of reading) {
        const spec = schema.properties![field]!, label = make('label', undefined, 'pc-field'), required = schema.required?.includes(field) ?? false; label.append(make('span', spec.description || field));
        let input: HTMLInputElement | HTMLSelectElement;
        if (spec.enum || spec.type === 'boolean') {
          input = make('select');
          if (!required) { const all = make('option', '全部'); all.value = ''; input.append(all); }
          for (const value of spec.enum ?? [true, false]) { const option = make('option', typeof value === 'boolean' ? value ? '是' : '否' : text(value)); option.value = text(value); input.append(option); }
        } else { input = make('input'); input.type = ['integer', 'number'].includes(spec.type) ? 'number' : spec.format === 'date' ? 'date' : 'search'; }
        input.name = (source as { field: string }).field; input.dataset.field = field;
        input.addEventListener('change', () => { clearTimeout(part.waiting); delete element.dataset.pcPending; void query(part); });
        if (input instanceof HTMLInputElement) input.addEventListener('input', () => { clearTimeout(part.waiting); element.dataset.pcPending = ''; part.waiting = setTimeout(() => { delete element.dataset.pcPending; void query(part); }, 300); });
        label.append(input); filter.append(label);
      }
      part.filter = filter; element.append(filter);
    }
    element.append(content);
    if (node.submit) {
      const form = make('form'), schema = view!.contract.operations.find(op => op.id === node.submit!.operationId)!.input;
      for (const [field, source] of Object.entries(node.submit.input)) if (source.source === 'form') {
        const spec = schema.properties![field]!, label = make('label', undefined, 'pc-field'); label.append(make('span', spec.description || field));
        let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (spec.enum) { input = make('select'); for (const value of spec.enum) { const option = make('option', text(value)); option.value = text(value); input.append(option); } }
        else if (['object', 'array'].includes(spec.type) || spec.type === 'string' && (spec.maxLength ?? 1000) > 200) input = make('textarea');
        else { input = make('input'); input.type = spec.type === 'boolean' ? 'checkbox' : ['integer', 'number'].includes(spec.type) ? 'number' : spec.format === 'date' ? 'date' : spec.format === 'uri' ? 'url' : 'text'; if (spec.type === 'number') input.step = 'any'; if (spec.minimum !== undefined) input.min = String(spec.minimum); if (spec.maximum !== undefined) input.max = String(spec.maximum); }
        input.name = source.field; input.dataset.field = field; input.required = spec.type !== 'boolean' && (schema.required?.includes(field) ?? false);
        if ('maxLength' in input && spec.maxLength !== undefined) input.maxLength = spec.maxLength;
        label.append(input); form.append(label);
      }
      const submit = make('button', node.props.submitLabel || '提交', 'pc-submit'); submit.type = 'submit'; form.append(submit);
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (part.busy || !ready(node.submit?.operationId)) return;
        const generation = epoch;
        try {
          const values: Record<string, unknown> = {};
          for (const input of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]')) {
            const spec = schema.properties![input.dataset.field!]!; if (!input.value && !input.required) continue;
            values[input.name] = spec.type === 'boolean' ? input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value === 'true' : ['number', 'integer'].includes(spec.type) ? Number(input.value) : ['object', 'array', 'null'].includes(spec.type) ? JSON.parse(input.value) : input.value;
          }
          // A model call can take tens of seconds; say so rather than "saving".
          const slow = view!.contract.operations.find(op => op.id === node.submit!.operationId)?.effects.capabilities?.includes('model.generate');
          part.busy = true; submit.disabled = true; feedback.className = ''; feedback.textContent = slow ? '模型正在生成，可能要几十秒…' : '正在保存…';
          const result = await options.call(node.id, 'submit', { form: values, selection });
          if (disposed || generation !== epoch || parts.get(node.id) !== part) return;
          select(node.id, result);
          feedback.className = 'pc-success'; feedback.textContent = '已完成';
          // Show a command's result only when the design points at it or it is a plain value; an internal id or record is not a message.
          if (!part.node.read && (part.node.submit?.outputPath || ['string', 'number', 'boolean'].includes(typeof result))) output(part, result, 'submit');
          // A form that creates something starts empty again; an edit form (prefilled from a selection) keeps its values.
          if (!Object.values(part.node.submit?.input ?? {}).some(source => source.source === 'form' && source.prefill)) form.reset();
          await refresh();
        } catch (error) { if (!disposed) { feedback.className = 'pc-error'; feedback.textContent = error instanceof Error ? error.message : '操作失败，输入已保留'; } }
        finally { part.busy = false; submit.disabled = !ready(node.submit?.operationId); }
      });
      part.form = form; element.append(form);
    }
    element.append(feedback); return part;
  }
  return {
    async update(next: PluginComponentView) {
      if (disposed) return;
      if (view?.contract.revision !== next.contract.revision) { epoch++; selection = {}; selectionVersions.clear(); }
      view = next;
      const pageIds = new Set<string>(), regionIds = new Set<string>(), partIds = new Set<string>(); tabs.replaceChildren();
      // A single page needs no page switcher.
      tabs.hidden = next.contract.pages.length < 2;
      for (const page of next.contract.pages) {
        pageIds.add(page.id); let element = pages.get(page.id);
        if (!element) { element = make('div', undefined, 'pc-page'); element.dataset.page = page.id; pages.set(page.id, element); root.append(element); }
        const button = make('button', page.title); button.type = 'button'; button.dataset.page = page.id; button.setAttribute('role', 'tab'); button.addEventListener('click', () => { selectPage(page.id); void refresh(); }); tabs.append(button);
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
              const replacement = createPart(node); previous?.root.replaceWith(replacement.root); part = replacement; parts.set(node.id, part);
              replacement.form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]').forEach(input => { const saved = values.get(input.name); if (saved) { input.value = saved.value; if ('checked' in input && saved.checked !== undefined) input.checked = saved.checked; } if (focused === input.name) input.focus(); });
            } else {
              // Label-only changes update in place, so the person's input, focus and caret stay where they were.
              const before = part.node; part.node = node;
              const heading = part.root.querySelector('header h1,header h2'); if (heading) heading.textContent = node.props.title || node.purpose;
              const submit = part.form?.querySelector<HTMLButtonElement>('[type=submit]'); if (submit) submit.textContent = node.props.submitLabel || '提交';
              let description = part.root.querySelector<HTMLParagraphElement>(':scope > .pc-description');
              if (node.props.description) { if (!description) { description = make('p', undefined, 'pc-description'); part.root.querySelector(':scope > header')!.after(description); } description.textContent = node.props.description; }
              else description?.remove();
              const { title: _t, description: _d, submitLabel: _s, ...shown } = node.props, { title: _bt, description: _bd, submitLabel: _bs, ...wasShown } = before.props;
              if (JSON.stringify(shown) !== JSON.stringify(wasShown)) void query(part);
            }
            // Parts appear in the view's order; a part already in place is not moved, so focus and input stay.
            const expected = previousPart ? previousPart.nextElementSibling : section.firstElementChild;
            if (expected !== part.root) section.insertBefore(part.root, expected);
            previousPart = part.root;
            const ids = [node.read?.operationId, node.submit?.operationId].filter(Boolean) as string[], live = ids.every(ready);
            part.status.textContent = ids.length ? live ? '功能已接通' : '功能待接通' : ''; part.status.dataset.connected = String(live);
            part.form?.querySelectorAll<HTMLButtonElement>('[type=submit]').forEach(button => { button.disabled = part.busy || !ready(node.submit?.operationId); });
          }
        }
      }
      for (const [id, part] of parts) if (!partIds.has(id)) { part.query++; part.root.remove(); parts.delete(id); }
      // A record action has no block of its own; what it reports shows under the collection it acts on.
      for (const part of parts.values()) {
        const host = rowHost(part.node), home = host ? parts.get(host)?.root : part.root; part.root.hidden = !!host;
        if (home && part.feedback.parentElement !== home) home.append(part.feedback);
      }
      for (const [id, region] of regions) if (!regionIds.has(id)) { region.remove(); regions.delete(id); }
      for (const [id, page] of pages) if (!pageIds.has(id)) { page.remove(); pages.delete(id); }
      selectPage(pageIds.has(currentPage) ? currentPage : next.contract.pages[0]!.id); await refresh();
    },
    refresh,
    destroy() { disposed = true; epoch++; parts.clear(); pages.clear(); regions.clear(); root.replaceChildren(); },
  };
}
export const PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT = createPluginComponentClient.toString();
