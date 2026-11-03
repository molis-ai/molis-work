/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type { Column, Kit, Part, Rel, State } from './plugin-component-types.js';
import type { PluginComponentNode } from './plugin-components.js';

export function pcRelations(c: State & Kit) {
  const { tabList, parts, pages } = c;
  /** The schema a binding's output path points at, from the contract in view. */
  const pluginSchemaOf = (operationId?: string, path?: string) => {
    let schema = operation(operationId)?.output;
    for (const key of path ? path.split('.') : []) schema = schema?.type === 'object' ? schema.properties?.[key] : undefined;
    return schema;
  };
  /** A plugin's name: its heading's own title, else the page's title; the designer's note on the part is not a name. */
  const headingOf = (node: PluginComponentNode) => node.props.title || c.view?.contract.pages.find(page => page.id === node.pageId)?.title || node.purpose;
  const operation = (id?: string) => c.view?.contract.operations.find(op => op.id === id), live = (part: Part, generation: number) => !c.disposed && generation === c.epoch && parts.get(part.node.id) === part;
  const detailEnabled = (id: string) => !!c.view?.presentation?.parts[id]?.detail;
  const ready = (id?: string) => !!id && !!c.view?.connected.includes(id);
  const collections = new Set(['directory', 'card', 'table', 'calendar', 'accordion']);
  /** A part whose whole input is the chosen record of one collection on its page acts on a record: it shows as a button on each record. */
  const rowHost = (node: PluginComponentNode): string | undefined => {
    if (node.read || !node.submit) return undefined;
    const sources = Object.values(node.submit.input), hosts = new Set(sources.flatMap(source => source.source === 'selection' ? [source.componentId] : []));
    const [host] = hosts;
    return hosts.size === 1 && sources.every(source => source.source !== 'form') && c.view?.nodes.some(other => other.id === host && other.pageId === node.pageId && !!other.read && collections.has(other.kind)) ? host : undefined;
  };
  const rowLabel = (node: PluginComponentNode) => (node.props.submitLabel || node.props.title || node.purpose).replace(/选中的?/gu, '').trim() || '执行';
  const reading = (node: PluginComponentNode) => node.intent === 'reading' || node.kind === 'reader';
  const selectable = (componentId: string) => detailEnabled(componentId) || !!c.view?.nodes.some(other => rowHost(other) !== componentId && [other.read, other.submit].some(binding => Object.values(binding?.input ?? {})
    .some(source => source.source === 'selection' && source.componentId === componentId || source.source === 'form' && source.prefill?.componentId === componentId)));
  /** A form that adds something new: every value typed by the person, nothing taken from elsewhere, nothing to show back. */
  const composer = (node: PluginComponentNode) => !node.read && !!node.submit && !node.submit.outputPath && Object.values(node.submit.input).some(source => source.source === 'form')
    && Object.values(node.submit.input).every(source => source.source === 'form' && !source.prefill) && operation(node.submit!.operationId)?.kind === 'command';
  const signature = (node: PluginComponentNode) => JSON.stringify({ kind: node.kind, read: node.read, submit: node.submit, input: operation(node.submit?.operationId)?.input, composer: composer(node) });
  const selectPage = (id: string) => {
    c.currentPage = id; pages.forEach((page, key) => { page.hidden = key !== id; });
    tabList.querySelectorAll<HTMLButtonElement>('button').forEach(tab => { tab.setAttribute('aria-selected', String(tab.dataset.page === id)); tab.classList.toggle('is-active', tab.dataset.page === id); });
  };
  /** The page's first form that adds records, if any: an "add" tile leads there. */
  const composerFor = (node: PluginComponentNode) => c.view?.nodes.find(other => other.pageId === node.pageId && composer(other));
  return { pluginSchemaOf, headingOf, operation, live, detailEnabled, ready, collections, rowHost, rowLabel, reading, selectable, composer, signature, selectPage, composerFor };
}

export function pcRecords(c: State & Kit & Rel) {
  const { make, text, statusWord, exactly, shown, prose, at, TONES, MOMENT, DAY, moment, badge, pluginSchemaOf } = c;
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
  function exportRows(part: Part) {
    const node = part.node, rows = part.rows ?? [], columns = recordColumns(node, rows[0]);
    const cell = (value: unknown) => { const raw = text(value); return /[",\n]/.test(raw) ? '"' + raw.replace(/"/g, '""') + '"' : raw; };
    const csv = '﻿' + [columns.map(column => cell(column.label)).join(','), ...rows.map(row => columns.map(column => cell(shown(column, at(row, column.field)))).join(','))].join('\n');
    const link = make('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = (c.view?.nodes.find(other => other.kind === 'frame' || other.intent === 'heading')?.props.title || node.props.title || '记录') + '.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
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
      const day = place === 'row' && node.kind === 'calendar' ? dayField(node) : undefined;
      const fields = row && typeof row === 'object' && !Array.isArray(row) ? Object.entries(row as Record<string, unknown>).filter(([key]) => key !== node.props.idField && key !== day).slice(0, 6) : [];
      if (fields.length) { fallback = make('dl', undefined, 'pc-fields'); for (const [key, value] of fields) fallback.append(make('dt', key), prose('dd', shown(undefined, value))); }
      else fallback = make('p', text(row));
    }
    if (node.props.hintLevelField) { const level = text(at(row, node.props.hintLevelField)); if (level) meta.append(make('span', '提示级别 ' + level, 'pc-meta-item')); }
    const figure = lead ? make('span', undefined, 'pc-record-figure') : undefined;
    if (lead && figure) figure.append(make('span', lead.label + ' ', 'pc-sr'), text(shown(lead, at(row, lead.field))));
    return { title, body, notes, meta: meta.childNodes.length ? meta : undefined, fallback, figure };
  }
  return { describeField, fieldValue, exportRows, recordColumns, dayField, dayOf, recordBody };
}
