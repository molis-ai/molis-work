/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type { SandboxPluginContract, SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { PluginComponentNode } from './plugin-components.js';
import type { PluginPresentation } from './plugin-presentation.js';
import { createPluginPresentationClient } from './plugin-presentation-client.js';
export interface PluginComponentView { contract: SandboxPluginContract; nodes: PluginComponentNode[]; connected: string[]; presentation?: PluginPresentation }
export interface PluginComponentClientOptions { root: HTMLElement; call(nodeId: string, binding: 'read' | 'submit', payload: unknown): Promise<unknown>; inspect?(nodeId: string): void;
  /** Observe only accepted query results, with the same request/selection ordering as the rendered view. */
  onRead?(nodeId: string, result: { value: unknown } | { error: string }): void;
}

/**
 * Host-owned browser renderer: model data is always text; generated code never runs in this page. Every part is drawn
 * with the UI catalog's own components (`mw-*`, `/__ui/catalog`), so a generated plugin looks and themes like the rest
 * of the product. The part's kind is the catalog component it was given; kinds from older builds map onto the catalog.
 */
export function createPluginComponentClient(options: PluginComponentClientOptions) {
  const root = options.root; root.classList.add('pc-view');
  const composition = createPluginPresentationClient();
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
    const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el;
  };
  /** An icon from the page's sprite; decorative, the words beside it carry the meaning. */
  const glyph = (name: string) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#icon-' + name); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'pc-icon'); svg.append(use); return svg;
  };
  /** A catalog button (`mw-btn`). */
  const button = (label: string, variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline', size: 'sm' | 'md' | 'lg' | 'icon' = 'sm', icon?: string) => {
    const el = make('button', undefined, 'mw-btn mw-btn--' + variant + ' mw-btn--' + size); el.type = 'button'; el.dataset.slot = 'button';
    if (icon) el.append(glyph(icon)); const words = make('span', label); words.dataset.slot = 'button-label'; el.append(words); return el;
  };
  const LEGACY: Record<string, string> = { heading: 'frame', text: 'card', list: 'directory', cards: 'card', reader: 'accordion', chat: 'card', matrix: 'table', notice: 'alert' };
  /** The catalog component a part is drawn with. */
  const kindOf = (node: PluginComponentNode) => LEGACY[node.kind] ?? node.kind;
  /** The schema a binding's output path points at, from the contract in view. */
  const pluginSchemaOf = (operationId?: string, path?: string) => {
    let schema = view?.contract.operations.find(op => op.id === operationId)?.output;
    for (const key of path ? path.split('.') : []) schema = schema?.type === 'object' ? schema.properties?.[key] : undefined;
    return schema;
  };
  const text = (value: unknown): string => value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  /** Common status words a design left in English ("open", "completed") read in Chinese, in a field named like a status. */
  const STATUS_WORDS: Record<string, string> = { open: '进行中', active: '进行中', in_progress: '进行中', 'in-progress': '进行中', completed: '已完成', complete: '已完成',
    done: '已完成', closed: '已关闭', cancelled: '已取消', canceled: '已取消', pending: '待处理', todo: '待办', archived: '已归档', draft: '草稿', paused: '已暂停', failed: '失败', succeeded: '成功' };
  const statusWord = (field: string | undefined, value: unknown): string | undefined => field && /status|state/i.test(field) && typeof value === 'string' ? STATUS_WORDS[value.trim().toLowerCase()] : undefined;
  /** The exact value beside the words it is shown as, for search and for checks; not read aloud. */
  const exactly = (value: unknown) => { const exact = make('span', ' ' + text(value), 'pc-sr'); exact.setAttribute('aria-hidden', 'true'); return exact; };
  /** How a record's field reads: the column's own words for its values, a status in Chinese, 是/否 for a plain boolean. */
  const shown = (column: { field?: string; values?: Record<string, string> } | undefined, value: unknown): unknown =>
    column?.values && Object.hasOwn(column.values, text(value)) ? column.values[text(value)] : statusWord(column?.field, value) ?? (typeof value === 'boolean' ? value ? '是' : '否'
      // A list of words or numbers reads as words ("晨跑、读书"), not as code.
      : Array.isArray(value) && value.every(item => typeof item === 'string' || typeof item === 'number') ? value.join('、') : value);
  /** Model answers often carry light Markdown: show **emphasis**, drop heading marks. Always text nodes, never markup. */
  const prose = <K extends keyof HTMLElementTagNameMap>(tag: K, value: unknown, cls?: string) => {
    const element = make(tag, undefined, cls), source = text(value).replace(/^#{1,6}\s+/gmu, '');
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
  /** Status tags use the catalog badge tones: a value's place among its choices picks its tone, yes is success. */
  const TONES = ['info', 'success', 'warning', 'neutral'];
  /** A plugin's mark: a neutral icon that says what it is about (colour belongs to state and selection). */
  const MARKS: Array<[RegExp, string]> = [[/书|读|阅|摘抄|文章/u, 'book'], [/单词|生词|词汇|英语|背诵/u, 'library'], [/账|钱|支出|收入|花销|预算|消费|报销/u, 'hash'],
    [/待办|任务|todo|清单|计划/iu, 'completed'], [/打卡|习惯|坚持/u, 'calendar'], [/提醒|闹钟|到期/u, 'bell'], [/目标|里程碑/u, 'target'], [/日志|日记|复盘|进展|周报/u, 'history'],
    [/灵感|想法|点子|创意/u, 'idea'], [/自测|测验|问答|题|考/u, 'question'], [/对话|聊天|助手/u, 'message'], [/报名|名单|联系人|客户|成员/u, 'user'],
    [/喝水|健康|运动|睡眠|体重/u, 'activity'], [/计时|番茄|时间/u, 'timer'], [/收藏|书签|链接|网址/u, 'bookmark'], [/图片|照片|相册/u, 'image'], [/笔记|随手记|记录|备忘/u, 'note']];
  const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  const TEMPLATE = /\{\{\s*[\w.]+\s*\}\}/u;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  /** A moment reads the way people say it; the exact value stays with it, for search and for checks. */
  const moment = (value: string) => {
    const date = new Date(value); if (Number.isNaN(date.getTime())) return make('span', value);
    const now = new Date(), day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), diff = Math.round((day(now) - day(date)) / 86_400_000);
    const time = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    const words = diff === 0 ? '今天 ' + time : diff === 1 ? '昨天 ' + time : diff === -1 ? '明天 ' + time
      : (date.getFullYear() === now.getFullYear() ? '' : date.getFullYear() + '年') + (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + time;
    const element = make('time', words); element.dateTime = value; element.title = value;
    const exact = make('span', ' ' + value, 'pc-sr'); exact.setAttribute('aria-hidden', 'true'); element.append(exact); return element;
  };
  /** A plugin's name: its heading's own title, else the page's title; the designer's note on the part is not a name. */
  const headingOf = (node: PluginComponentNode) => node.props.title || view?.contract.pages.find(page => page.id === node.pageId)?.title || node.purpose;
  // Pages switch with the catalog's tabs.
  const tabs = make('nav', undefined, 'mw-tabs pc-tabs'), tabList = make('div', undefined, 'mw-tabs__list'); tabs.dataset.slot = 'tabs'; tabList.setAttribute('role', 'tablist'); tabList.setAttribute('aria-label', '插件页面'); tabs.append(tabList); root.append(tabs);
  let view: PluginComponentView | undefined, currentPage = '', selection: Record<string, unknown> = {}, disposed = false, epoch = 0, fresh = false;
  const selectionVersions = new Map<string, number>();
  const pages = new Map<string, HTMLElement>(), regions = new Map<string, HTMLElement>();
  interface Part { node: PluginComponentNode; root: HTMLElement; output: HTMLElement; feedback: HTMLElement; form?: HTMLFormElement; dialog?: HTMLDialogElement; opener?: HTMLButtonElement; confirm?: HTMLDialogElement; filter?: HTMLElement; tools?: HTMLElement; waiting?: ReturnType<typeof setTimeout>; feedbackTimer?: ReturnType<typeof setTimeout>; busy: boolean; query: number; signature: string; prefilled: Map<string, number>; rows?: unknown[]; seen?: Set<string> }
  const parts = new Map<string, Part>();
  const details = new Map<string, { layout: HTMLElement; pane: HTMLElement; back: HTMLButtonElement; content?: string; scroll?: Array<[Element, number]> }>();
  const detailEnabled = (id: string) => !!view?.presentation?.parts[id]?.detail;
  function showDetail(part: Part, focus = false) {
    const id = part.node.id;
    part.root.toggleAttribute('data-has-detail', detailEnabled(id));
    let detail = details.get(id);
    if (!detailEnabled(id)) {
      if (detail) { detail.layout.before(part.output); detail.layout.remove(); details.delete(id); part.output.classList.remove('pc-detail-source'); }
      return;
    }
    if (!detail || !detail.layout.isConnected) {
      const layout = make('div', undefined, 'pc-detail-layout'), pane = make('article', undefined, 'pc-detail-pane');
      const back = button('返回列表', 'ghost', 'sm', 'chevron-left'); back.classList.add('pc-detail-back'); back.dataset.pcBack = id;
      back.addEventListener('click', () => { layout.removeAttribute('data-detail-open'); for (const [element, top] of details.get(id)?.scroll ?? []) element.scrollTop = top; part.output.querySelector<HTMLElement>('[aria-current] [data-pc-select]')?.focus({ preventScroll: true }); });
      part.output.before(layout); part.output.classList.add('pc-detail-source'); layout.append(part.output, pane);
      detail = { layout, pane, back }; details.set(id, detail);
    }
    const row = selection[id], node = part.node;
    if (focus && !detail.layout.hasAttribute('data-detail-open')) {
      detail.scroll = []; for (let ancestor: Element | null = detail.layout.parentElement; ancestor; ancestor = ancestor.parentElement) detail.scroll.push([ancestor, ancestor.scrollTop]);
    }
    const content = JSON.stringify([row, node.props]);
    if (detail.content === content) { if (focus && row) { detail.layout.setAttribute('data-detail-open', ''); detail.pane.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true }); } return; }
    detail.content = content;
    detail.pane.replaceChildren(detail.back);
    if (!row) { detail.layout.removeAttribute('data-detail-open'); detail.pane.append(make('p', '选择一条，展开阅读', 'pc-detail-empty')); return; }
    const heading = make('h2', text(at(row, node.props.titleField)) || node.props.title || '详情'); heading.tabIndex = -1;
    const body = prose('p', at(row, node.props.textField), 'pc-detail-copy'), meta = make('div', undefined, 'pc-detail-meta');
    for (const column of node.props.columns ?? []) if (![node.props.titleField, node.props.textField, node.props.idField].includes(column.field)) {
      const value = at(row, column.field); if (value !== undefined) meta.append(make('span', column.label + ' · ' + text(shown(column, value))));
    }
    detail.pane.append(heading, body, meta);
    if (focus) { detail.layout.setAttribute('data-detail-open', ''); heading.focus({ preventScroll: true }); }
  }
  const ready = (id?: string) => !!id && !!view?.connected.includes(id);
  const collections = new Set(['directory', 'card', 'table', 'calendar', 'accordion']);
  /** A part whose whole input is the chosen record of one collection on its page acts on a record: it shows as a button on each record. */
  const rowHost = (node: PluginComponentNode): string | undefined => {
    if (node.read || !node.submit) return undefined;
    const sources = Object.values(node.submit.input), hosts = new Set(sources.flatMap(source => source.source === 'selection' ? [source.componentId] : []));
    const [host] = hosts;
    return hosts.size === 1 && sources.every(source => source.source !== 'form') && view?.nodes.some(other => other.id === host && other.pageId === node.pageId && !!other.read && collections.has(kindOf(other))) ? host : undefined;
  };
  const rowLabel = (node: PluginComponentNode) => (node.props.submitLabel || node.props.title || node.purpose).replace(/选中的?/gu, '').trim() || '执行';
  const reading = (node: PluginComponentNode) => node.intent === 'reading' || node.kind === 'reader';
  const selectable = (componentId: string) => detailEnabled(componentId) || !!view?.nodes.some(other => rowHost(other) !== componentId && [other.read, other.submit].some(binding => Object.values(binding?.input ?? {})
    .some(source => source.source === 'selection' && source.componentId === componentId || source.source === 'form' && source.prefill?.componentId === componentId)));
  /** A form that adds something new: every value typed by the person, nothing taken from elsewhere, nothing to show back. */
  const composer = (node: PluginComponentNode) => !node.read && !!node.submit && !node.submit.outputPath && Object.values(node.submit.input).some(source => source.source === 'form')
    && Object.values(node.submit.input).every(source => source.source === 'form' && !source.prefill) && view?.contract.operations.find(op => op.id === node.submit!.operationId)?.kind === 'command';
  const signature = (node: PluginComponentNode) => JSON.stringify({ kind: node.kind, read: node.read, submit: node.submit, input: view?.contract.operations.find(op => op.id === node.submit?.operationId)?.input, composer: composer(node) });
  const selectPage = (id: string) => {
    currentPage = id; pages.forEach((page, key) => { page.hidden = key !== id; });
    tabList.querySelectorAll<HTMLButtonElement>('button').forEach(tab => { tab.setAttribute('aria-selected', String(tab.dataset.page === id)); tab.classList.toggle('is-active', tab.dataset.page === id); });
  };
  function select(id: string, value: unknown) { selection[id] = value; selectionVersions.set(id, (selectionVersions.get(id) ?? 0) + 1); const part = parts.get(id); if (part) showDetail(part, true); }
  /** Toggle items show which value a choice field holds; the value itself lives in the field. */
  const syncChoices = (scope: ParentNode) => scope.querySelectorAll<HTMLInputElement>('input[data-pc-choice]').forEach(input =>
    input.parentElement?.querySelectorAll<HTMLButtonElement>('[data-pc-value]').forEach(chip => { const on = chip.dataset.pcValue === input.value; chip.setAttribute('aria-checked', String(on)); chip.setAttribute('aria-pressed', String(on)); chip.classList.toggle('is-current', on); }));
  /** A short set of choices as the catalog's toggle group; the chosen value is kept in a hidden field so the form reads it like any other. */
  function choices(name: string, field: string, label: string, options: Array<{ value: string; label: string }>, initial: string) {
    const group = make('div', undefined, 'mw-toggle-group pc-chips'); group.dataset.slot = 'toggle-group'; group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', label);
    const input = make('input'); input.type = 'hidden'; input.name = name; input.dataset.field = field; input.dataset.pcChoice = ''; input.dataset.pcInitial = initial; input.value = initial; group.append(input);
    for (const option of options) {
      const chip = make('button', option.label, 'mw-toggle'); chip.type = 'button'; chip.dataset.pcValue = option.value; chip.setAttribute('role', 'radio');
      chip.addEventListener('click', () => { if (input.value === option.value) return; input.value = option.value; syncChoices(group); input.dispatchEvent(new Event('change', { bubbles: true })); });
      group.append(chip);
    }
    syncChoices(group); return { group, input };
  }
  /**
   * The page's own words for a field: a collection that shows the field names it and its values (未读 reads 想读), so
   * the form that writes it and the filter that picks it say the same as the records do.
   */
  const vocabulary = (pageId: string, field: string) => {
    const column = view?.nodes.filter(other => other.pageId === pageId).flatMap(other => other.props.columns ?? []).find(item => item.field === field);
    return { label: column?.label, values: column?.values };
  };
  /** "金额，大于 0" is a name and a hint: the name labels the field, the hint waits inside it. */
  const naming = (description: string | undefined, fallback: string) => { const [name, ...hint] = (description || fallback).split('，'); return { label: name!.trim() || fallback, hint: hint.join('，').trim() }; };
  /** A date written as a pattern in the description ("YYYY-MM") gets the matching picker. */
  const picker = (spec: SandboxSchema) => spec.type !== 'string' || spec.format || spec.enum ? undefined : /YYYY-MM-DD/i.test(spec.description ?? '') ? 'date' : /YYYY-MM/i.test(spec.description ?? '') ? 'month' : undefined;
  const chipsFit = (values: readonly unknown[]) => values.length <= 6 && values.every(value => text(value).length <= 12);
  type Column = { field: string; label: string; values?: Record<string, string> };
  /** A record's fields, classed by how they read: a status as a badge, a moment as a time, a number as a figure. */
  function describeField(node: PluginComponentNode, column: Column, raw: unknown) {
    const items = pluginSchemaOf(node.read?.operationId, node.read?.outputPath), spec = (items?.type === 'array' ? items.items : undefined)?.properties?.[column.field];
    if (column.values || spec?.enum || typeof raw === 'boolean') {
      const known = column.values ? Object.keys(column.values) : (spec?.enum ?? []).map(text), index = known.indexOf(text(raw));
      return { kind: 'tag' as const, tone: typeof raw === 'boolean' ? raw ? 'success' : 'neutral' : index < 0 ? 'neutral' : TONES[index % TONES.length]! };
    }
    if (typeof raw === 'string' && MOMENT.test(raw)) return { kind: 'time' as const };
    if (typeof raw === 'number') return { kind: 'number' as const };
    if (typeof raw === 'string' && raw.length > 40) return { kind: 'long' as const };
    return { kind: 'plain' as const };
  }
  /** A status as the catalog's badge. */
  const badge = (words: string, tone: string) => { const el = make('span', undefined, 'mw-badge mw-badge--' + tone + ' pc-tag'); el.dataset.slot = 'badge'; el.dataset.tone = tone === 'neutral' ? 'gray' : tone; el.append(words); return el; };
  /** One value inside a record: the field's name stays readable to assistive technology even where only a badge shows. */
  function fieldValue(node: PluginComponentNode, column: Column, raw: unknown, labelled: boolean): HTMLElement {
    const described = describeField(node, column, raw), value = shown(column, raw);
    if (described.kind === 'tag') { const tag = badge('', described.tone); tag.textContent = ''; if (labelled) tag.append(make('span', column.label + ' ', 'pc-sr')); tag.append(text(value)); if (statusWord(column.field, raw)) tag.append(exactly(raw)); return tag; }
    const item = make('span', undefined, described.kind === 'long' ? 'pc-record-note' : 'pc-meta-item');
    if (labelled) item.append(make('span', column.label, 'pc-meta-label'), ' ');
    if (described.kind === 'time') item.append(moment(raw as string));
    else if (described.kind === 'number') item.append(make('span', text(value), 'pc-meta-number'));
    else item.append(described.kind === 'long' ? prose('span', value) : text(value));
    if (statusWord(column.field, raw)) item.append(exactly(raw));
    return item;
  }
  /** The page's first form that adds records, if any: an "add" tile leads there. */
  const composerFor = (node: PluginComponentNode) => view?.nodes.find(other => other.pageId === node.pageId && composer(other));
  function exportRows(part: Part) {
    const node = part.node, rows = part.rows ?? [], columns = recordColumns(node, rows[0]);
    const cell = (value: unknown) => { const raw = text(value); return /[",\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw; };
    const csv = '﻿' + [columns.map(column => cell(column.label)).join(','), ...rows.map(row => columns.map(column => cell(shown(column, at(row, column.field)))).join(','))].join('\n');
    const link = make('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = (view?.nodes.find(other => kindOf(other) === 'frame' || other.intent === 'heading')?.props.title || node.props.title || '记录') + '.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  /** What a record shows, in order: its title and text first, then the configured columns (or its own fields when none are set). */
  function recordColumns(node: PluginComponentNode, first: unknown): Column[] {
    const items = pluginSchemaOf(node.read?.operationId, node.read?.outputPath), properties = (items?.type === 'array' ? items.items : undefined)?.properties;
    const described = (field: string) => properties?.[field]?.description || field;
    const configured = node.props.columns?.length ? node.props.columns : first && typeof first === 'object' && !Array.isArray(first)
      ? Object.keys(first as Record<string, unknown>).filter(key => key !== node.props.idField).slice(0, 8).map(field => ({ field, label: described(field) })) : [];
    const lead = [...new Set([node.props.titleField, node.props.textField])].filter((field): field is string => !!field && !configured.some(column => column.field === field)).map(field => ({ field, label: described(field) }));
    return [...lead, ...configured];
  }
  /** The field the calendar lays a record out by: the first that holds a day or a moment. */
  const dayField = (node: PluginComponentNode): string | undefined => {
    const items = pluginSchemaOf(node.read?.operationId, node.read?.outputPath), properties = (items?.type === 'array' ? items.items : undefined)?.properties ?? {};
    return Object.entries(properties).find(([name, spec]) => spec.type === 'string' && (spec.format === 'date' || spec.format === 'date-time' || /date|day|日期/i.test(name)))?.[0];
  };
  /** The record's own date, for the calendar: the first field that holds a day or a moment. */
  const dayOf = (node: PluginComponentNode, row: unknown): string => {
    const items = pluginSchemaOf(node.read?.operationId, node.read?.outputPath), properties = (items?.type === 'array' ? items.items : undefined)?.properties ?? {};
    for (const [name, spec] of Object.entries(properties)) if (spec.type === 'string' && (spec.format === 'date' || spec.format === 'date-time' || /date|day|日期/i.test(name))) {
      const value = text(at(row, name)); if (DAY.test(value.slice(0, 10))) return value.slice(0, 10);
    }
    return '';
  };
  /** The parts of one record, whichever component shows it: title, text, notes, tags and figures, and its actions. */
  function recordBody(node: PluginComponentNode, row: unknown, place: 'row' | 'card' | 'fold') {
    const title = node.props.titleField ? text(at(row, node.props.titleField)) : '';
    const textField = node.props.textField && node.props.textField !== node.props.titleField ? node.props.textField : undefined, status = textField ? statusWord(textField, at(row, textField)) : undefined;
    const body = !textField ? undefined : status ? make('p', status, 'pc-record-text') : prose('p', at(row, textField), 'pc-record-text');
    if (body && status) body.append(exactly(at(row, textField!)));
    const extra = (node.props.columns ?? []).filter(column => column.field !== node.props.titleField && column.field !== node.props.textField && at(row, column.field) !== undefined && at(row, column.field) !== null && at(row, column.field) !== '');
    const notes: HTMLElement[] = [], meta = make('div', undefined, 'pc-record-meta');
    // In a row, the record's main figure (an amount, a count) stands at the end, where the eye looks for it.
    const lead = place === 'row' ? extra.find(column => describeField(node, column, at(row, column.field)).kind === 'number') : undefined;
    for (const column of extra) { if (column === lead) continue; const element = fieldValue(node, column, at(row, column.field), true); if (element.classList.contains('pc-record-note')) notes.push(element); else meta.append(element); }
    let fallback: HTMLElement | undefined;
    if (!node.props.textField && !node.props.titleField && !extra.length) {
      // No display fields configured: a readable field list, never a raw JSON dump.
      // In the calendar the day already heads the record; it is not repeated inside it.
      const day = place === 'row' && kindOf(node) === 'calendar' ? dayField(node) : undefined;
      const fields = row && typeof row === 'object' && !Array.isArray(row) ? Object.entries(row as Record<string, unknown>).filter(([key]) => key !== node.props.idField && key !== day).slice(0, 6) : [];
      if (fields.length) { fallback = make('dl', undefined, 'pc-fields'); for (const [key, value] of fields) fallback.append(make('dt', key), prose('dd', shown(undefined, value))); }
      else fallback = make('p', text(row));
    }
    if (node.props.hintLevelField) { const level = text(at(row, node.props.hintLevelField)); if (level) meta.append(make('span', '提示级别 ' + level, 'pc-meta-item')); }
    const figure = lead ? make('span', undefined, 'pc-record-figure') : undefined;
    if (lead && figure) figure.append(make('span', lead.label + ' ', 'pc-sr'), text(shown(lead, at(row, lead.field))));
    return { title, body, notes, meta: meta.childNodes.length ? meta : undefined, fallback, figure };
  }
  function output(part: Part, raw: unknown, binding: 'read' | 'submit') {
    const node = part.node, kind = kindOf(node), value = at(raw, node[binding]?.outputPath), fragment = document.createDocumentFragment();
    const listing = binding === 'read' && Array.isArray(value);
    if (part.tools) { part.tools.hidden = !listing || !(value as unknown[]).length; part.tools.querySelector<HTMLElement>('.pc-count')!.dataset.count = listing ? String((value as unknown[]).length) : ''; }
    // A sentence the design wrote around the result ("今天已经喝了 {{count}} 杯") is filled from it and shown instead of figures.
    const template = [node.props.description, node.props.title].find(item => item && TEMPLATE.test(item));
    if (template && binding === 'read' && value && typeof value === 'object' && !Array.isArray(value)) {
      const sentence = make('p', undefined, 'pc-answer pc-filled');
      for (const [index, piece] of template.split(/\{\{\s*([\w.]+)\s*\}\}/u).entries()) sentence.append(index % 2 ? make('strong', text(shown(undefined, at(value, piece)))) : document.createTextNode(piece));
      fragment.append(sentence);
    }
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (node.props.titleField || node.props.textField) {
        const article = make('article', undefined, 'pc-single-record'), record = recordBody(node, value, 'card');
        if (record.title) article.append(make('h2', record.title));
        if (record.body) { record.body.classList.add('pc-detail-copy'); article.append(record.body); }
        article.append(...record.notes); if (record.meta) article.append(record.meta); fragment.append(article);
      } else fragment.append(figures(value as Record<string, unknown>, pluginSchemaOf(node[binding]?.operationId, node[binding]?.outputPath), 0));
    }
    else if (!Array.isArray(value)) {
      // A single value: an alert, a badge, or a card holding the text, as the part was given.
      if (kind === 'alert') { const alert = make('div', undefined, 'mw-alert mw-alert--info pc-answer'); alert.dataset.slot = 'alert'; alert.setAttribute('role', 'status'); if (node.props.title) alert.append(make('strong', node.props.title)); alert.append(prose('p', value)); fragment.append(alert); }
      else if (kind === 'badge') fragment.append(badge(text(shown(undefined, value)), 'neutral'));
      else { const card = make('article', undefined, 'mw-card pc-answer-card'), panel = make('div', undefined, 'mw-card__panel'); card.dataset.slot = 'card'; panel.append(prose('p', value, 'pc-answer')); card.append(panel); fragment.append(card); }
    }
    else if (!value.length) { const empty = make('div', undefined, 'mw-empty pc-empty'), mark = make('span', undefined, 'mw-empty__mark'); empty.dataset.slot = 'empty'; mark.append(glyph('inbox')); empty.append(mark, make('p', node.props.emptyText || '这里还没有内容。')); fragment.append(empty); }
    else {
      const first = value[0], table = kind === 'table';
      // Without configured columns a table shows the record's own fields rather than an empty grid.
      const configured = node.props.columns?.length ? node.props.columns : first && typeof first === 'object' && !Array.isArray(first)
        ? Object.keys(first as Record<string, unknown>).filter(key => key !== node.props.idField).slice(0, 8).map(field => ({ field, label: field })) : [];
      const columns: Column[] = table && node.props.columns?.length ? recordColumns(node, first) : configured;
      const actionable = view?.nodes.some(other => rowHost(other) === node.id) || reading(node) || selectable(node.id);
      const chosen = node.props.idField ? text(at(selection[node.id], node.props.idField)) : '', seen = new Set<string>();
      let container: HTMLElement, body: HTMLElement;
      if (table) {
        container = make('table', undefined, 'mw-table pc-table'); body = make('tbody');
        const head = make('thead'), tr = make('tr'); for (const column of columns) tr.append(make('th', column.label)); if (actionable) tr.append(make('th', reading(node) || selectable(node.id) ? '选择' : '')); head.append(tr); container.append(head, body);
      } else { container = make('div', undefined, kind === 'card' ? 'pc-card-grid' : kind === 'accordion' ? 'mw-accordion pc-accordion' : kind === 'calendar' ? 'pc-agenda' : 'pc-directory'); body = container; }
      if (kind === 'accordion') container.dataset.slot = 'accordion';
      if (reading(node)) container.classList.add('pc-reading');
      if (node.intent === 'conversation' || node.kind === 'chat') container.classList.add('pc-conversation');
      let day = '', dayList: HTMLElement | undefined;
      for (const [index, row] of value.entries()) {
        const record = recordBody(node, row, kind === 'directory' || kind === 'calendar' ? 'row' : kind === 'card' ? 'card' : 'fold');
        const item = make(table ? 'tr' : kind === 'accordion' ? 'details' : kind === 'card' ? 'article' : 'div', undefined, 'pc-record');
        item.dataset.recordId = text(at(row, node.props.idField)) || String(index);
        item.id = 'pc-' + node.id + '-' + encodeURIComponent(item.dataset.recordId); seen.add(item.dataset.recordId);
        // A record that was not here before arrives visibly, so the person sees what their action added.
        if (fresh && node.props.idField && part.seen && !part.seen.has(item.dataset.recordId)) item.classList.add('pc-new');
        if (node.props.roleField) item.dataset.role = text(at(row, node.props.roleField));
        const actions: HTMLButtonElement[] = [];
        const citations = node.props.citationsField ? at(row, node.props.citationsField) : undefined;
        if (Array.isArray(citations)) for (const citation of citations) {
          const componentId = at(citation, 'componentId'), recordId = at(citation, 'recordId');
          if (typeof componentId !== 'string' || typeof recordId !== 'string' || !view?.nodes.some(other => other.id === componentId && reading(other))) continue;
          const link = button(text(at(citation, 'label')) || '查看原文', 'ghost', 'sm', 'book'); link.classList.add('pc-row-action');
          link.addEventListener('click', async () => { const reader = parts.get(componentId); if (!reader) return; selectPage(reader.node.pageId); await refresh(); const target = document.getElementById('pc-' + componentId + '-' + encodeURIComponent(recordId)); if (target instanceof HTMLDetailsElement) target.open = true; target?.scrollIntoView({ block: 'center' }); }); actions.push(link);
        }
        const choose = () => { select(node.id, row); part.output.querySelectorAll('[aria-current]').forEach(el => el.removeAttribute('aria-current')); item.setAttribute('aria-current', 'true'); };
        if (chosen && chosen === item.dataset.recordId) item.setAttribute('aria-current', 'true');
        // "Choose" only where another part actually consumes this component's selection.
        if (reading(node) || selectable(node.id)) {
          const pick = button(detailEnabled(node.id) ? '阅读' : reading(node) ? '引用这一节' : '选择', 'secondary', 'sm'); pick.classList.add('pc-row-action'); pick.dataset.pcSelect = '';
          // Each row's button says which record it acts on, for anyone who hears rather than sees the list.
          if (record.title) pick.setAttribute('aria-label', (reading(node) ? '引用：' : '选择：') + record.title);
          pick.addEventListener('click', event => { event.preventDefault(); choose(); void refresh(); }); actions.push(pick);
          // The whole record is a place to choose it, not only its button.
          item.dataset.selectable = ''; item.addEventListener('click', event => { if ((event.target as Element).closest('button,a,input,select,textarea,summary')) return; choose(); void refresh(); });
        }
        // An action on one record sits on that record.
        for (const action of view?.nodes.filter(other => rowHost(other) === node.id) ?? []) {
          const danger = /删除|移除|清除|撤销|取消/u.test(rowLabel(action)), act = button(rowLabel(action), danger ? 'ghost' : 'secondary', 'sm');
          act.classList.add('pc-row-action'); if (record.title) act.setAttribute('aria-label', rowLabel(action) + '：' + record.title); act.dataset.pcAction = action.id; act.disabled = !ready(action.submit!.operationId); if (danger) act.dataset.danger = '';
          act.addEventListener('click', event => { event.preventDefault(); choose(); const target = parts.get(action.id); if (target?.confirm) { target.confirm.dataset.pcRecord = item.dataset.recordId!; target.confirm.showModal(); } else target?.form?.requestSubmit(); }); actions.push(act);
        }
        const bar = make('div', undefined, 'pc-row-actions'); bar.append(...actions);
        if (table) {
          for (const column of columns) {
            const cell = make('td'), raw = at(row, column.field), described = describeField(node, column, raw);
            if (described.kind === 'number') cell.dataset.number = '';
            cell.append(described.kind === 'tag' || described.kind === 'time' ? fieldValue(node, column, raw, false) : document.createTextNode(text(shown(column, raw))));
            item.append(cell);
          }
          if (actionable) { const td = make('td'); td.append(bar); item.append(td); }
        } else if (kind === 'card') {
          // A card: title and text in its header, notes and badges in its panel, actions in its footer.
          item.classList.add('mw-card'); item.dataset.slot = 'card';
          const head = make('header', undefined, 'mw-card__header'), copy = make('div'); if (record.title) copy.append(make('h3', record.title, 'mw-card__title'));
          if (record.body) { record.body.classList.add('mw-card__description'); copy.append(record.body); } head.append(copy); item.append(head);
          const panel = make('div', undefined, 'mw-card__panel'); panel.append(...record.notes); if (record.meta) panel.append(record.meta); if (record.fallback) panel.append(record.fallback); if (panel.childNodes.length) item.append(panel);
          if (actions.length) { const foot = make('footer', undefined, 'mw-card__footer'); foot.append(bar); item.append(foot); }
        } else if (kind === 'accordion') {
          // A fold: the title and its badges are the summary; the text, notes and actions open below it.
          item.classList.add('mw-collapsible'); item.dataset.slot = 'collapsible';
          const summary = make('summary'); summary.append(make('span', record.title || text(at(row, node.props.textField)).slice(0, 60) || '第 ' + (index + 1) + ' 条', 'pc-fold-title')); if (record.meta) summary.append(record.meta);
          const inside = make('div', undefined, 'mw-collapsible__body'); if (record.body) inside.append(record.body); inside.append(...record.notes); if (record.fallback) inside.append(record.fallback); if (actions.length) inside.append(bar);
          item.append(summary, inside);
        } else {
          // A directory row: the catalog's row, copy on the left, the main figure and the actions at the end.
          const rowEl = make('div', undefined, 'mw-dir-row mw-dir-row--meta pc-row'), copy = make('span', undefined, 'mw-dir-row__copy'), headline = make('span', undefined, 'mw-dir-row__headline');
          rowEl.dataset.slot = 'directory-row'; if (record.title) headline.append(make('strong', record.title)); copy.append(headline);
          if (record.body) copy.append(record.body); copy.append(...record.notes); if (record.meta) copy.append(record.meta); if (record.fallback) copy.append(record.fallback);
          rowEl.append(copy); if (record.figure) rowEl.append(record.figure);
          item.classList.add('mw-dir-row-wrap'); item.append(rowEl); if (actions.length) { bar.classList.add('mw-dir-row__ops'); item.append(bar); }
          if (kind === 'calendar') {
            // The calendar lays records out by their day, earliest first as they came.
            const date = dayOf(node, row);
            if (!dayList || date !== day) {
              day = date; const block = make('section', undefined, 'pc-agenda-day'), label = make('header', undefined, 'pc-agenda-date');
              const parsed = DAY.test(date) ? new Date(date + 'T00:00:00') : undefined;
              // Today, yesterday and tomorrow are named, as times are (see moment).
              const today = new Date(), offset = parsed ? Math.round((parsed.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000) : NaN;
              const near = offset === 0 ? '今天 · ' : offset === -1 ? '昨天 · ' : offset === 1 ? '明天 · ' : '';
              label.append(make('strong', parsed ? String(parsed.getDate()) : '·'), make('span', parsed ? near + (parsed.getMonth() + 1) + '月 · 周' + '日一二三四五六'[parsed.getDay()] : '未定日期'));
              dayList = make('div', undefined, 'pc-agenda-items'); block.append(label, dayList); body.append(block);
            }
            dayList.append(item); continue;
          }
        }
        body.append(item);
      }
      if (binding === 'read' && node.props.idField) part.seen = seen;
      // Cards end with a tile that leads to the page's own "add" form.
      const adder = kind === 'card' && composerFor(node);
      if (adder) { const tile = make('button', undefined, 'pc-add-tile'); tile.type = 'button'; tile.append(glyph('plus'), make('span', adder.props.title || '新建一条')); tile.addEventListener('click', () => { const target = parts.get(adder.id); if (target?.opener) { target.opener.click(); return; } target?.root.scrollIntoView({ block: 'center', behavior: 'smooth' }); target?.form?.querySelector<HTMLElement>('input:not([type=hidden]),textarea,select')?.focus({ preventScroll: true }); }); container.append(tile); }
      if (table) { const wrap = make('div', undefined, 'mw-table-wrap pc-table-wrap'); wrap.dataset.slot = 'table'; wrap.append(container); fragment.append(wrap); }
      else { const wrap = make('div', undefined, 'pc-records'); wrap.append(container); fragment.append(wrap); }
    }
    if (listing) { part.rows = value as unknown[]; if (!(value as unknown[]).length && node.props.idField) part.seen = new Set(); }
    part.output.replaceChildren(fragment);
    if (binding === 'read' && Array.isArray(value) && node.props.idField && selection[node.id]) {
      const selectedId = at(selection[node.id], node.props.idField);
      selection[node.id] = value.find(row => at(row, node.props.idField) === selectedId);
    }
    showDetail(part);
  }
  /** A field's typed value, or undefined when left empty (an optional filter left at 全部). */
  function typedValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, spec: { type: string; format?: string }): unknown {
    if (spec.type === 'boolean') return input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value === '' ? undefined : input.value === 'true';
    if (input.value === '') return undefined;
    // A moment picked on this device carries this device's offset, so it means the same time wherever it is read.
    if (input instanceof HTMLInputElement && input.type === 'datetime-local') {
      const local = new Date(input.value); if (Number.isNaN(local.getTime())) return input.value;
      const offset = -local.getTimezoneOffset(), sign = offset >= 0 ? '+' : '-', pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
      return input.value.slice(0, 16) + ':00' + sign + pad(offset / 60) + ':' + pad(offset % 60);
    }
    return ['number', 'integer'].includes(spec.type) ? Number(input.value) : ['object', 'array', 'null'].includes(spec.type) ? JSON.parse(input.value) : input.value;
  }
  function filterValues(part: Part): Record<string, unknown> | null {
    const binding = part.node.read!, schema = view!.contract.operations.find(op => op.id === binding.operationId)!.input, values: Record<string, unknown> = {};
    for (const input of part.filter?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]') ?? []) {
      const value = typedValue(input, schema.properties![input.dataset.field!]!);
      if (value !== undefined) values[input.name] = value;
      else if (schema.required?.includes(input.dataset.field!)) return null;
    }
    return values;
  }
  /** An object result (a total, a breakdown) as figure cards; a nested list of records as progress bars or a small table. */
  function figures(record: Record<string, unknown>, schema: ReturnType<typeof pluginSchemaOf>, depth: number): HTMLElement {
    const list = make('dl', undefined, 'pc-figures' + (depth ? ' pc-figures-nested' : ''));
    for (const [key, value] of Object.entries(record).slice(0, 24)) {
      const spec = schema?.type === 'object' ? schema.properties?.[key] : undefined, tile = make('div', undefined, 'mw-card pc-stat'); tile.dataset.slot = 'card';
      const records = Array.isArray(value) && value.length > 0 && value.every(item => item && typeof item === 'object' && !Array.isArray(item));
      // An undescribed list needs no label: its table names its own columns.
      if (spec?.description || !records) tile.append(make('dt', spec?.description || key));
      const cell = make('dd');
      if (records) {
        tile.classList.add('pc-figures-wide');
        const rows = (value as Array<Record<string, unknown>>).slice(0, 50), items = spec?.type === 'array' ? spec.items : undefined, keys = Object.keys(rows[0]!).slice(0, 6);
        const describe = (field: string) => (items?.type === 'object' ? items.properties?.[field]?.description : undefined) || field;
        const numeric = keys.filter(field => rows.every(row => typeof row[field] === 'number')), labels = keys.filter(field => !numeric.includes(field));
        if (keys.length === 2 && numeric.length === 1 && labels.length === 1) {
          // A label and an amount per row: the catalog's progress bars read faster than a table.
          const amount = numeric[0]!, label = labels[0]!, top = Math.max(...rows.map(row => Math.abs(row[amount] as number)), 0) || 1, bars = make('div', undefined, 'pc-bars');
          bars.setAttribute('role', 'table'); bars.setAttribute('aria-label', describe(label) + ' / ' + describe(amount));
          for (const row of rows) {
            const bar = make('div', undefined, 'pc-bar'), track = make('div', undefined, 'mw-progress'), fill = make('span'), share = Math.round(Math.abs(row[amount] as number) / top * 100);
            bar.setAttribute('role', 'row'); track.dataset.slot = 'progress'; track.setAttribute('role', 'progressbar'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); track.setAttribute('aria-valuenow', String(share));
            fill.style.width = share + '%'; track.append(fill); bar.append(make('span', text(shown(undefined, row[label]))), track, make('strong', text(row[amount]))); bars.append(bar);
          }
          cell.append(bars);
        } else {
          const table = make('table', undefined, 'mw-table pc-table'), head = make('tr'), body = make('tbody');
          for (const field of keys) head.append(make('th', describe(field)));
          for (const row of rows) { const tr = make('tr'); for (const field of keys) tr.append(make('td', text(shown(undefined, row[field])))); body.append(tr); }
          const thead = make('thead'); thead.append(head); table.append(thead, body); const wrap = make('div', undefined, 'mw-table-wrap pc-table-wrap'); wrap.append(table); cell.append(wrap);
        }
      } else if (value && typeof value === 'object' && !Array.isArray(value) && depth < 2) { tile.classList.add('pc-figures-wide'); cell.append(figures(value as Record<string, unknown>, spec, depth + 1)); }
      else if (typeof value === 'string' && MOMENT.test(value)) { tile.dataset.words = ''; cell.append(moment(value)); }
      else { if (typeof value !== 'number' && text(shown(undefined, value)).length > 12) tile.dataset.words = ''; cell.append(prose('span', shown(undefined, value))); }
      tile.append(cell); list.append(tile);
    }
    return list;
  }
  const skeleton = (idle: boolean) => { const block = make('div', undefined, 'pc-skeleton'); if (idle) block.dataset.idle = ''; block.setAttribute('aria-hidden', 'true'); for (let index = 0; index < (idle ? 2 : 3); index++) { const bone = make('span', undefined, 'mw-skeleton'); bone.dataset.slot = 'skeleton'; block.append(bone); } return block; };
  async function query(part: Part) {
    const binding = part.node.read;
    // A read that is not connected yet shows where its content will be, still.
    if (binding && !ready(binding.operationId) && !part.output.childNodes.length) part.output.append(skeleton(true));
    if (part.node.pageId !== currentPage || !binding || !ready(binding.operationId) || Object.values(binding.input).some(source => source.source === 'selection' && at(selection[source.componentId], source.field) === undefined)) return;
    const form = filterValues(part);
    // A required filter left empty: nothing to show yet, and no read.
    if (!form) { part.query++; const empty = make('div', undefined, 'mw-empty pc-empty'), mark = make('span', undefined, 'mw-empty__mark'); mark.append(glyph('filter')); empty.append(mark, make('p', '选好上面的条件后显示')); part.output.replaceChildren(empty); return; }
    const ticket = ++part.query, generation = epoch;
    // Until the first read answers, the shape of what is coming, not a blank.
    if (!part.output.childNodes.length || part.output.querySelector('[data-idle]')) part.output.replaceChildren(skeleton(false));
    try {
      const result = await options.call(part.node.id, 'read', { selection, form });
      if (!disposed && generation === epoch && ticket === part.query && parts.get(part.node.id) === part) {
        output(part, result, 'read');
        options.onRead?.(part.node.id, { value: result });
        // An error a read left goes once a read succeeds; a failed save's message stays with the person's input.
        if (part.feedback.dataset.pcRead !== undefined) { part.feedback.className = ''; part.feedback.textContent = ''; delete part.feedback.dataset.pcRead; }
      }
    }
    catch (error) { if (!disposed && generation === epoch && ticket === part.query && parts.get(part.node.id) === part) { const message = error instanceof Error ? error.message : '读取失败，稍后可以重试'; part.output.querySelector('.pc-skeleton')?.remove(); report(part, 'error', message); part.feedback.dataset.pcRead = ''; options.onRead?.(part.node.id, { error: message }); } }
  }
  /** What a part reports: an error as the catalog's alert, a success as a short badge that fades, work in progress as plain words. */
  function report(part: Part, tone: 'error' | 'success' | 'working' | '', message: string) {
    clearTimeout(part.feedbackTimer);
    part.feedback.className = tone === 'error' ? 'pc-error mw-alert mw-alert--danger' : tone === 'success' ? 'pc-success mw-badge mw-badge--success' : tone === 'working' ? 'pc-working' : '';
    part.feedback.textContent = message;
    // Clear the status itself, including when reduced motion disables the CSS fade.
    if (tone === 'success') part.feedbackTimer = setTimeout(() => report(part, '', ''), 3400);
    const mirror = part.dialog?.querySelector<HTMLElement>('.pc-dialog-error'); if (mirror) { mirror.hidden = tone !== 'error'; mirror.textContent = tone === 'error' ? message : ''; }
  }
  function refresh() {
    for (const part of parts.values()) for (const source of Object.values(part.node.submit?.input ?? {})) if (source.source === 'form' && source.prefill) {
      const version = selectionVersions.get(source.prefill.componentId); if (version === undefined || part.prefilled.get(source.field) === version) continue;
      const value = at(selection[source.prefill.componentId], source.prefill.field);
      const input = [...part.form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]') ?? []].find(field => field.name === source.field);
      if (input && value !== undefined) { if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(value); else input.value = text(value); part.prefilled.set(source.field, version); syncChoices(part.form!); input.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    return Promise.all([...parts.values()].map(query));
  }
  /** One field of a form or a filter, in the catalog control that suits its type. */
  function control(spec: SandboxSchema, name: string, field: string, label: string, required: boolean, filtering: boolean, words?: Record<string, string>, alone = false) {
    const say = (value: unknown) => words && Object.hasOwn(words, text(value)) ? words[text(value)]! : typeof value === 'boolean' ? value ? '是' : '否' : text(value);
    if ((spec.enum && chipsFit(spec.enum.map(say))) || spec.type === 'boolean' && filtering) {
      const values = spec.enum ?? [true, false], options = values.map(value => ({ value: text(value), label: say(value) }));
      // A filter whose own choices already include "all" needs no second one.
      const all = options.find(option => /^(全部|所有|全部状态|不限)$/u.test(option.label));
      if (filtering && !required && !all) return choices(name, field, label, [{ value: '', label: '全部' }, ...options], '');
      return choices(name, field, label, options, filtering && all ? all.value : options[0]!.value);
    }
    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (spec.enum || spec.type === 'boolean' && filtering) {
      // Many choices: the catalog's select, which opens as its menu rather than the system picker.
      input = make('select', undefined, 'mw-select'); input.dataset.slot = 'select';
      if (filtering && !required) { const all = make('option', '全部'); all.value = ''; input.append(all); }
      for (const value of spec.enum ?? [true, false]) { const option = make('option', say(value)); option.value = text(value); input.append(option); }
    } else if (!filtering && (['object', 'array'].includes(spec.type) || spec.type === 'string' && (spec.maxLength !== undefined ? spec.maxLength > (alone ? 1000 : 200)
      // Without a limit, the field's own name says whether it is a line (标题, 标签) or a passage (描述, 内容).
      : !alone && /描述|内容|正文|笔记|说明|详情|感受|心得|回答|答案|总结|摘抄|summary|content|body|description|note|answer|detail/i.test(field + ' ' + (spec.description ?? ''))))) {
      input = make('textarea', undefined, 'mw-textarea'); input.dataset.slot = 'textarea'; input.rows = 3;
    } else if (spec.type === 'boolean') {
      input = make('input', undefined, 'mw-check'); input.type = 'checkbox'; input.dataset.slot = 'checkbox';
    } else {
      input = make('input', undefined, 'mw-input'); input.dataset.slot = 'input';
      input.type = ['integer', 'number'].includes(spec.type) ? 'number' : spec.format === 'date' ? 'date' : spec.format === 'date-time' ? 'datetime-local' : spec.format === 'uri' ? 'url' : picker(spec) ?? (filtering ? 'search' : 'text');
      if (spec.type === 'number') input.step = 'any'; if (spec.minimum !== undefined) input.min = String(spec.minimum); if (spec.maximum !== undefined) input.max = String(spec.maximum);
    }
    input.name = name; input.dataset.field = field;
    const hint = naming(spec.description, field).hint; if (hint && !picker(spec) && 'placeholder' in input && !(input instanceof HTMLSelectElement)) input.placeholder = hint;
    if (!filtering) input.required = spec.type !== 'boolean' && required;
    if ('maxLength' in input && spec.maxLength !== undefined) input.maxLength = spec.maxLength;
    return { input };
  }
  /** The catalog's dialog or sheet around a form: title and close in its header, the fields in its body, the buttons in its footer. */
  function overlay(kind: 'sheet' | 'dialog' | 'confirm', title: string, description: string, id: string) {
    const dialog = make('dialog', undefined, kind === 'sheet' ? 'mw-sheet' : kind === 'confirm' ? 'mw-dialog mw-dialog--alert' : 'mw-dialog'); dialog.dataset.slot = kind === 'sheet' ? 'sheet' : kind === 'confirm' ? 'alert-dialog' : 'dialog';
    const labelled = 'pc-' + id + '-' + kind + '-title'; dialog.setAttribute('aria-labelledby', labelled);
    const form = make('form', undefined, 'mw-form ' + (kind === 'sheet' ? 'mw-sheet__shell' : 'mw-dialog__shell')); form.method = 'dialog';
    const header = make('header', undefined, 'mw-form__header'), heading = make('div'), h2 = make('h2', title), hint = make('p', description); h2.id = labelled; hint.dataset.pcOverlayDescription = ''; hint.hidden = !description; heading.append(h2, hint);
    const close = button('关闭', 'ghost', 'icon', 'x'); close.classList.add('mw-btn--icon-only', 'mw-dialog__close'); close.setAttribute('aria-label', '关闭'); close.querySelector('span')!.className = 'mw-sr-only';
    close.addEventListener('click', () => dialog.close()); header.append(heading, close);
    const body = make('div', undefined, 'mw-form__body'), footer = make('footer', undefined, 'mw-form__footer');
    form.append(header, body, footer); dialog.append(form);
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    return { dialog, form, body, footer };
  }
  function createPart(node: PluginComponentNode): Part {
    const kind = kindOf(node), element = make('section', undefined, 'pc-node pc-kind-' + kind); element.dataset.componentId = node.id; element.setAttribute('aria-label', node.props.title || node.purpose);
    const description = make('p', TEMPLATE.test(node.props.description ?? '') ? '' : node.props.description ?? '', 'pc-part-description');
    const title = make(node.intent === 'heading' ? 'h1' : 'h2', node.intent === 'heading' ? headingOf(node) : node.props.title ?? '', node.intent === 'heading' ? undefined : 'pc-part-title'); title.dataset.pcTitle = ''; title.hidden = !title.textContent;
    description.dataset.pcDescription = ''; description.hidden = !description.textContent;
    if (TEMPLATE.test(title.textContent ?? '')) { title.textContent = ''; title.hidden = true; }
    if (node.intent === 'heading' && kind === 'frame') {
      // The plugin's own header, as the catalog's frame header: a mark that says what it is about, its name, one line on
      // what it is for, and on the right, where the page's "new" buttons go.
      const header = make('header', undefined, 'mw-frame__header pc-app-head'), copy = make('div', undefined, 'mw-frame__heading'), mark = make('span', undefined, 'pc-mark'), actions = make('div', undefined, 'mw-frame__action pc-app-actions');
      mark.append(glyph(MARKS.find(([pattern]) => pattern.test((node.props.title || '') + ' ' + (node.props.description || '')))?.[1] ?? 'sparkles'));
      header.dataset.slot = 'frame'; description.className = 'pc-app-description'; copy.append(title, description); header.append(mark, copy, actions); element.append(header);
    } else if (node.intent === 'heading') {
      const card = make('article', undefined, 'mw-card pc-app-card'), header = make('header', undefined, 'mw-card__header'), copy = make('div'); card.dataset.slot = 'card';
      title.className = 'mw-card__title'; description.className = 'mw-card__description'; copy.append(title, description); header.append(copy); card.append(header); element.append(card);
    } else { const header = make('header', undefined, 'pc-part-head'); header.append(title); header.hidden = title.hidden; element.append(header, description); }
    if (options.inspect) { const inspect = make('button', '检查零件', 'pc-inspect'); inspect.type = 'button'; inspect.addEventListener('click', () => options.inspect?.(node.id)); element.append(inspect); }
    const content = make('div', undefined, 'pc-output'), feedback = make('div'); feedback.dataset.pcFeedback = node.id; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    const part: Part = { node, root: element, output: content, feedback, busy: false, query: 0, signature: signature(node), prefilled: new Map() };
    const filtered = node.read && Object.entries(node.read.input).filter(([, source]) => source.source === 'form');
    // The collection's toolbar: its filters, how many records show, and a way to take them out as a spreadsheet.
    const toolbar = make('div', undefined, 'mw-toolbar pc-toolbar'); toolbar.dataset.slot = 'toolbar';
    if (filtered?.length) {
      const schema = view!.contract.operations.find(op => op.id === node.read!.operationId)!.input, filter = make('div', undefined, 'pc-filter'); filter.setAttribute('role', 'search');
      for (const [field, source] of filtered) {
        const spec = schema.properties![field]!, required = schema.required?.includes(field) ?? false, words = vocabulary(node.pageId, field), label = spec.description ? naming(spec.description, field).label : words.label || field;
        const made = control(spec, (source as { field: string }).field, field, label, required, true, words.values);
        if ('group' in made && made.group) { const box = make('div', undefined, 'pc-filter-item'); box.append(make('span', label, 'pc-filter-label'), made.group); filter.append(box); made.input.addEventListener('change', () => { void query(part); }); continue; }
        const input = made.input!, wrap = make('label', undefined, 'pc-filter-item');
        if (input instanceof HTMLInputElement && input.type === 'search') {
          // Search is the catalog's input group: the magnifier and the field as one control.
          const group = make('span', undefined, 'mw-input-group pc-search'); group.dataset.slot = 'input-group'; group.append(glyph('search'), input);
          wrap.append(make('span', label, 'pc-sr'), group); input.placeholder = '搜索' + label;
        } else wrap.append(make('span', label, 'pc-filter-label'), input);
        input.addEventListener('change', () => { clearTimeout(part.waiting); delete element.dataset.pcPending; void query(part); });
        if (input instanceof HTMLInputElement) input.addEventListener('input', () => { clearTimeout(part.waiting); element.dataset.pcPending = ''; part.waiting = setTimeout(() => { delete element.dataset.pcPending; void query(part); }, 300); });
        filter.append(wrap);
      }
      part.filter = filter; toolbar.append(filter);
    }
    if (node.read && collections.has(kind)) {
      const tools = make('div', undefined, 'pc-tools'), count = make('span', undefined, 'pc-count'), save = button('导出', 'ghost', 'sm', 'download');
      save.dataset.pcExport = ''; save.title = '导出为表格（CSV）'; save.addEventListener('click', () => exportRows(part));
      tools.append(count, save); tools.hidden = true; part.tools = tools; toolbar.append(tools);
    }
    if (toolbar.childNodes.length) element.append(toolbar);
    if (node.read) element.append(content);
    if (node.submit) {
      const schema = view!.contract.operations.find(op => op.id === node.submit!.operationId)!.input, fields = make('div', undefined, 'pc-form-fields');
      const typed = Object.values(node.submit.input).filter(source => source.source === 'form').length;
      for (const [field, source] of Object.entries(node.submit.input)) if (source.source === 'form') {
        const spec = schema.properties![field]!, words = vocabulary(node.pageId, field), label = spec.description ? naming(spec.description, field).label : words.label || field;
        const made = control(spec, source.field, field, label, schema.required?.includes(field) ?? false, false, words.values, typed === 1 && composer(node) && kind === 'form');
        if ('group' in made && made.group) { const box = make('div', undefined, 'mw-field pc-field-choice'); box.append(make('span', label, 'mw-field__label'), made.group); if ((spec.enum?.length ?? 0) > 5) box.classList.add('pc-field-wide'); fields.append(box); continue; }
        const input = made.input!;
        if (input instanceof HTMLInputElement && input.type === 'checkbox') { const row = make('label', undefined, 'mw-check-row pc-field-check'); row.append(input, make('span', label)); fields.append(row); continue; }
        const wrap = make('label', undefined, 'mw-field'); wrap.dataset.slot = 'field'; wrap.append(make('span', label, 'mw-field__label'), input);
        if (input instanceof HTMLTextAreaElement) {
          wrap.classList.add('pc-field-wide');
          // A long answer grows with what is written; ⌘/Ctrl+Enter sends it.
          input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight + 2, 320) + 'px'; });
          input.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); part.form?.requestSubmit(); } });
        }
        fields.append(wrap);
      }
      const submit = make('button', node.props.submitLabel || '提交', 'mw-btn mw-btn--primary mw-btn--md pc-submit'); submit.type = 'submit'; submit.dataset.slot = 'button';
      const visible = [...fields.children];
      let form: HTMLFormElement;
      if (kind === 'sheet' || kind === 'dialog') {
        // Filled in the catalog's sheet or dialog: a button opens it, and it closes once saved.
        const shell = overlay(kind, node.props.title || node.props.submitLabel || '新建', node.props.description ?? '', node.id);
        const cancel = button('取消', 'secondary', 'md'); cancel.addEventListener('click', () => shell.dialog.close());
        const error = make('p', '', 'pc-dialog-error mw-field__error'); error.hidden = true;
        shell.body.append(fields); shell.footer.append(error, cancel, submit); form = shell.form; part.dialog = shell.dialog;
        const opener = button(node.props.title || node.props.submitLabel || '新建', 'primary', 'md', 'plus'); opener.dataset.pcOpen = node.id; opener.classList.add('pc-open');
        opener.addEventListener('click', () => { shell.dialog.showModal(); shell.form.querySelector<HTMLElement>('input:not([type=hidden]),textarea,select')?.focus(); });
        part.opener = opener; element.append(opener, shell.dialog);
      } else if (kind === 'alert-dialog') {
        // A step that cannot be undone asks first, in the catalog's alert dialog.
        const shell = overlay('confirm', '确定要' + rowLabel(node) + '吗？', '这一步不能撤销。', node.id);
        const cancel = button('取消', 'secondary', 'md'), yes = button(rowLabel(node), 'danger', 'md'); yes.dataset.pcConfirmYes = '';
        cancel.addEventListener('click', () => shell.dialog.close()); shell.footer.append(cancel, yes); shell.dialog.dataset.pcConfirm = node.id; part.confirm = shell.dialog;
        form = make('form', undefined, 'pc-form pc-bare'); form.append(fields, submit);
        yes.addEventListener('click', event => { event.preventDefault(); shell.dialog.close(); form.requestSubmit(); });
        // Standing alone, the button opens the question; its own submit stays out of reach until confirmed.
        const opener = button(rowLabel(node), 'danger-outline', 'md'); opener.dataset.pcOpen = node.id; opener.addEventListener('click', () => shell.dialog.showModal()); part.opener = opener;
        submit.hidden = true; element.append(opener, shell.dialog);
      } else {
        // On the page, the catalog's Form sits on a card (its own layout fills a sheet or a dialog).
        form = make('form', undefined, visible.length ? 'mw-card pc-form' : 'pc-form pc-bare'); form.dataset.slot = 'form';
        const panel = make('div', undefined, visible.length ? 'mw-card__panel pc-form-panel' : 'pc-form-panel');
        // One short field: a single line with its button, like a quick-add bar; a few short fields sit on one row.
        const only = visible.length === 1 && visible[0]!.matches('label.mw-field:not(.pc-field-wide)') ? visible[0]!.querySelector<HTMLInputElement>('input:not([type=hidden])') : null;
        if (only) {
          form.classList.add('pc-inline'); const words = visible[0]!.querySelector('span')!; only.placeholder = [words.textContent, only.placeholder].filter(Boolean).join('，') || '写点什么…'; words.className = 'pc-sr';
          const group = make('div', undefined, 'mw-input-group pc-inline-group'); group.dataset.slot = 'input-group'; group.append(visible[0]!, submit); panel.append(group);
        } else {
          if (visible.length && visible.length <= 4 && !fields.querySelector('.pc-field-wide')) form.classList.add('pc-compact');
          const foot = make('div', undefined, 'pc-form-actions'); foot.append(submit); panel.append(fields, foot);
        }
        form.append(panel);
        if (composer(node)) form.classList.add('pc-composer');
      }
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (part.busy || !ready(node.submit?.operationId)) return;
        const generation = epoch;
        try {
          const values: Record<string, unknown> = {};
          for (const input of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]')) {
            const spec = schema.properties![input.dataset.field!]!; if (!input.value && !input.required) continue;
            values[input.name] = spec.type === 'boolean' ? input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value === 'true' : typedValue(input, spec) ?? input.value;
          }
          // A model call can take tens of seconds; say so rather than "saving".
          const slow = view!.contract.operations.find(op => op.id === node.submit!.operationId)?.effects.capabilities?.includes('model.generate');
          part.busy = true; submit.disabled = true; submit.dataset.loading = ''; const spinner = make('span', undefined, 'mw-spinner'); spinner.dataset.slot = 'button-loading-indicator'; spinner.setAttribute('aria-hidden', 'true'); submit.prepend(spinner);
          report(part, 'working', slow ? '模型正在生成，可能要几十秒…' : '正在保存…');
          const result = await options.call(node.id, 'submit', { form: values, selection });
          if (disposed || generation !== epoch || parts.get(node.id) !== part) return;
          select(node.id, result);
          const verb = /^(保存|添加|提交|记录|删除|打卡|完成|生成|发送|更新|创建|记下|记一笔|写入|加入)/u.exec(submit.textContent ?? '')?.[1];
          // A toggle ("打卡" again on a checked day) answers with its new state: false means it was undone.
          const flags = result && typeof result === 'object' && !Array.isArray(result) ? Object.values(result as Record<string, unknown>).filter(value => typeof value === 'boolean') : [];
          const undone = (verb === '打卡' || verb === '完成') && flags.length === 1 && flags[0] === false;
          report(part, 'success', undone ? '已取消' + verb : verb ? '已' + verb : '已完成');
          part.dialog?.close();
          // Show a command's result only when the design points at it or it is a plain value; an internal id or record is not a message.
          if (!part.node.read && (part.node.submit?.outputPath || ['string', 'number', 'boolean'].includes(typeof result))) output(part, result, 'submit');
          // A form that creates something starts empty again; an edit form (prefilled from a selection) keeps its values.
          if (!Object.values(part.node.submit?.input ?? {}).some(source => source.source === 'form' && source.prefill)) {
            form.reset(); form.querySelectorAll<HTMLInputElement>('input[data-pc-choice]').forEach(input => { input.value = input.dataset.pcInitial ?? ''; }); syncChoices(form);
            form.querySelectorAll('textarea').forEach(area => { area.style.height = ''; }); form.querySelectorAll('select').forEach(choice => choice.dispatchEvent(new Event('change', { bubbles: true })));
            if (form.classList.contains('pc-composer')) form.querySelector<HTMLElement>('input:not([type=hidden]),textarea')?.focus({ preventScroll: true });
          }
          fresh = true; try { await refresh(); } finally { fresh = false; }
        } catch (error) { if (!disposed) report(part, 'error', error instanceof Error ? error.message : '操作失败，输入已保留'); }
        finally { part.busy = false; delete submit.dataset.loading; submit.querySelector('.mw-spinner')?.remove(); submit.disabled = !ready(node.submit?.operationId); }
      });
      part.form = form; if (!part.dialog) element.append(form);
    }
    if (!node.read) element.append(content);
    element.append(feedback); return part;
  }
  return {
    async update(next: PluginComponentView) {
      if (disposed) return;
      const refreshNeeded = !view || JSON.stringify([view.contract.revision, view.nodes, view.connected]) !== JSON.stringify([next.contract.revision, next.nodes, next.connected]);
      const focused = root.contains(document.activeElement) ? document.activeElement as HTMLInputElement : null;
      const caret = focused && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : undefined;
      if (view?.contract.revision !== next.contract.revision) { epoch++; selection = {}; selectionVersions.clear(); }
      view = next;
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
        part.root.toggleAttribute('data-reading-preview', !!next.presentation && kindOf(part.node) === 'directory' && hasReader);
        // A record action has no block of its own; what it reports, and the question it asks, go with the collection it acts on.
        const host = rowHost(part.node), home = host ? parts.get(host)?.root : part.root; part.root.hidden = !!host;
        if (home && part.feedback.parentElement !== home) home.append(part.feedback);
        if (home && part.confirm && part.confirm.parentElement !== home) home.append(part.confirm);
        // A page's "new" buttons sit in its header, on the right, when the page has one.
        const head = part.opener && !host && [...parts.values()].find(other => other.node.pageId === part.node.pageId && kindOf(other.node) === 'frame')?.root.querySelector('.pc-app-actions');
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
      selectPage(pageIds.has(currentPage) ? currentPage : next.contract.pages[0]!.id); if (refreshNeeded) await refresh();
    },
    refresh,
    destroy() { disposed = true; epoch++; for (const part of parts.values()) { clearTimeout(part.waiting); clearTimeout(part.feedbackTimer); } parts.clear(); details.clear(); pages.clear(); regions.clear(); root.replaceChildren(); },
  };
}
export const PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT = '((createPluginPresentationClient)=>(' + createPluginComponentClient.toString() + '))(' + createPluginPresentationClient.toString() + ')';
