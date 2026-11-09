/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { dateArg, numberArg, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { isDestructivePluginOperation, pluginMessageNames, pluginTemplateBindings } from './plugin-surface-text.js';
import type { Column, Ctl, Det, Kit, Out, Part, Rec, Rel, State } from './plugin-component-types.js';

export function pcOutput(c: State & Kit & Rel & Rec & Det) {
  const { parts, make, words: wordElement, word, bindWord, raw: rawText, glyph, button, text, shown, prose, at, TEMPLATE, DAY, badge, figures, pluginSchemaOf, detailEnabled, ready, rowHost, rowLabel, reading, selectable, selectPage, composerFor, describeField, fieldValue, recordColumns, dayOf, recordBody, showDetail, select } = c;
  function agendaDay(date: string) {
    const label = make('header', undefined, 'pc-agenda-date'), day = DAY.test(date) ? new Date(date + 'T00:00:00Z') : undefined;
    if (!day || Number.isNaN(day.getTime())) {
      label.append(make('strong', '·'), wordElement('span', () => t.text("common.generated.undated")));
      return label;
    }
    const now = new Date(), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const offset = (day.getTime() - today) / 86_400_000, value = dateArg(date, "weekday-month-day");
    const caption = () => offset === 0 ? t.text("common.generated.today-date", { date: value })
      : offset === -1 ? t.text("common.generated.yesterday-date", { date: value })
      : offset === 1 ? t.text("common.generated.tomorrow-date", { date: value })
      : t.text("common.generated.formatted", { value });
    label.append(wordElement('strong', () => t.text("common.generated.formatted", { value: numberArg(day.getUTCDate()) })), wordElement('span', caption));
    return label;
  }
  function output(part: Part, raw: unknown, binding: 'read' | 'submit') {
    const node = part.node, kind = node.kind, value = at(raw, node[binding]?.outputPath), fragment = document.createDocumentFragment();
    const listing = binding === 'read' && Array.isArray(value);
    if (part.tools) { part.tools.hidden = !listing || !(value as unknown[]).length; part.tools.querySelector<HTMLElement>('.pc-count')!.dataset.count = listing ? String((value as unknown[]).length) : ''; }
    // A sentence the design wrote around the result ("今天已经喝了 {{count}} 杯") is filled from it and shown instead of figures.
    const template = [node.props.description, node.props.title].find((item): item is string => typeof item === 'string' && TEMPLATE.test(item));
    const generated = binding === 'read' && [node.props.description, node.props.title].find(ref => ref && typeof ref !== 'string' && 'key' in ref && pluginMessageNames(word(ref)).length > 0);
    const schema = generated ? pluginSchemaOf(node.read?.operationId, node.read?.outputPath) : undefined;
    if (generated && schema && value && typeof value === 'object' && !Array.isArray(value)) {
      const bindings = pluginTemplateBindings(schema, pluginMessageNames(word(generated)));
      const args = Object.fromEntries([...bindings].map(([name, path]) => {
        const field = at(value, path);
        return [name, typeof field === 'number' ? field : text(field)];
      }));
      fragment.append(wordElement('p', () => word(generated, args), 'pc-answer pc-filled'));
    }
    else if (template && binding === 'read' && value && typeof value === 'object' && !Array.isArray(value)) {
      const sentence = make('p', undefined, 'pc-answer pc-filled');
      for (const [index, piece] of template.split(/\{\{\s*([\w.]+)\s*\}\}/u).entries()) sentence.append(index % 2 ? rawText('strong', text(shown(undefined, at(value, piece)))) : document.createTextNode(piece));
      fragment.append(sentence);
    }
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (node.props.titleField || node.props.textField) {
        const article = make('article', undefined, 'pc-single-record'), record = recordBody(node, value, 'card');
        if (record.title) article.append(rawText('h2', record.title));
        if (record.body) { record.body.classList.add('pc-detail-copy'); article.append(record.body); }
        article.append(...record.notes); if (record.meta) article.append(record.meta); fragment.append(article);
      } else fragment.append(figures(value as Record<string, unknown>, pluginSchemaOf(node[binding]?.operationId, node[binding]?.outputPath), 0, node.props.columns));
    }
    else if (!Array.isArray(value)) {
      // A single value: an alert, a badge, or a card holding the text, as the part was given.
      if (kind === 'alert') { const alert = make('div', undefined, 'mw-alert mw-alert--info pc-answer'); alert.dataset.slot = 'alert'; alert.setAttribute('role', 'status'); if (node.props.title) alert.append(wordElement('strong', () => word(part.node.props.title))); alert.append(prose('p', value)); fragment.append(alert); }
      else if (kind === 'badge') fragment.append(badge(text(shown(undefined, value)), 'neutral'));
      else { const card = make('article', undefined, 'mw-card pc-answer-card'), panel = make('div', undefined, 'mw-card__panel'); card.dataset.slot = 'card'; panel.append(prose('p', value, 'pc-answer')); card.append(panel); fragment.append(card); }
    }
    else if (!value.length) { const empty = make('div', undefined, 'mw-empty pc-empty'), mark = make('span', undefined, 'mw-empty__mark'); empty.dataset.slot = 'empty'; mark.append(glyph('inbox')); empty.append(mark, wordElement('p', () => word(part.node.props.emptyText) || t.text("common.generated.empty"))); fragment.append(empty); }
    else {
      const first = value[0], table = kind === 'table';
      // Without configured columns a table shows the record's own fields rather than an empty grid.
      const configured = node.props.columns?.length ? node.props.columns : first && typeof first === 'object' && !Array.isArray(first)
        ? Object.keys(first as Record<string, unknown>).filter(key => key !== node.props.idField).slice(0, 8).map(field => ({ field, label: { literal: field } })) : [];
      const columns: Column[] = table && node.props.columns?.length ? recordColumns(node, first) : configured;
      const actionable = c.view?.nodes.some(other => rowHost(other) === node.id) || reading(node) || selectable(node.id);
      const chosen = node.props.idField ? text(at(c.selection[node.id], node.props.idField)) : '', seen = new Set<string>();
      let container: HTMLElement, body: HTMLElement;
      if (table) {
        container = make('table', undefined, 'mw-table pc-table'); body = make('tbody');
        const head = make('thead'), tr = make('tr'); for (const column of columns) tr.append(wordElement('th', () => word(column.label))); if (actionable) tr.append(make('th', reading(node) || selectable(node.id) ? t.text("common.generated.choose") : '')); head.append(tr); container.append(head, body);
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
        // A record that was not here before carries the shared landing wash, so the person sees what their action added.
        if (c.fresh && node.props.idField && part.seen && !part.seen.has(item.dataset.recordId)) item.dataset.craftNew = '';
        if (node.props.roleField) item.dataset.role = text(at(row, node.props.roleField));
        const actions: HTMLButtonElement[] = [];
        const citations = node.props.citationsField ? at(row, node.props.citationsField) : undefined;
        if (Array.isArray(citations)) for (const citation of citations) {
          const componentId = at(citation, 'componentId'), recordId = at(citation, 'recordId');
          if (typeof componentId !== 'string' || typeof recordId !== 'string' || !c.view?.nodes.some(other => other.id === componentId && reading(other))) continue;
          const caption = text(at(citation, 'label')), link = button(caption || t.text("common.generated.read-original"), 'ghost', 'sm', 'book');
          if (caption) link.querySelector<HTMLElement>('[data-slot=button-label]')!.translate = false;
          link.classList.add('pc-row-action');
          link.addEventListener('click', async () => { const reader = parts.get(componentId); if (!reader) return; selectPage(reader.node.pageId); await c.refresh(); const target = document.getElementById('pc-' + componentId + '-' + encodeURIComponent(recordId)); if (target instanceof HTMLDetailsElement) target.open = true; target?.scrollIntoView({ block: 'center' }); }); actions.push(link);
        }
        const choose = () => { select(node.id, row); part.output.querySelectorAll('[aria-current]').forEach(el => el.removeAttribute('aria-current')); item.setAttribute('aria-current', 'true'); };
        if (chosen && chosen === item.dataset.recordId) item.setAttribute('aria-current', 'true');
        // "Choose" only where another part actually consumes this component's selection.
        if (reading(node) || selectable(node.id)) {
          const pick = button(detailEnabled(node.id) ? t.text("common.generated.read") : reading(node) ? t.text("common.generated.quote") : t.text("common.generated.choose"), 'secondary', 'sm'); pick.classList.add('pc-row-action'); pick.dataset.pcSelect = '';
          // Each row's button says which record it acts on, for anyone who hears rather than sees the list.
          if (record.title) pick.setAttribute('aria-label', reading(node) ? t.text("common.generated.quote-record", { title: record.title }) : t.text("common.generated.choose-named-record", { title: record.title }));
          pick.addEventListener('click', event => { event.preventDefault(); choose(); void c.refresh(); }); actions.push(pick);
          // The whole record is a place to choose it, not only its button.
          item.dataset.selectable = ''; item.addEventListener('click', event => { if ((event.target as Element).closest('button,a,input,select,textarea,summary')) return; choose(); void c.refresh(); });
        }
        // An action on one record sits on that record.
        for (const action of c.view?.nodes.filter(other => rowHost(other) === node.id) ?? []) {
          const danger = action.kind === 'alert-dialog' || isDestructivePluginOperation(action.submit?.operationId), act = button(rowLabel(action), danger ? 'ghost' : 'secondary', 'sm');
          act.classList.add('pc-row-action');
          bindWord(act.querySelector<HTMLElement>('[data-slot=button-label]')!, '', () => rowLabel(parts.get(action.id)?.node ?? action));
          if (record.title) bindWord(act, 'aria-label', () => t.text("common.generated.row-action", { action: rowLabel(action), title: record.title })); act.dataset.pcAction = action.id; act.disabled = !ready(action.submit!.operationId); if (danger) act.dataset.danger = '';
          act.addEventListener('click', event => { event.preventDefault(); choose(); const target = parts.get(action.id); if (target?.confirm) { target.confirm.dataset.pcRecord = item.dataset.recordId!; target.confirm.showModal(); } else target?.form?.requestSubmit(); }); actions.push(act);
        }
        const bar = make('div', undefined, 'pc-row-actions'); bar.append(...actions);
        if (table) {
          for (const column of columns) {
            const cell = make('td'), raw = at(row, column.field), described = describeField(node, column, raw);
            if (described.kind === 'number') cell.dataset.number = '';
            cell.append(described.kind === 'tag' || described.kind === 'time' ? fieldValue(node, column, raw, false) : rawText('span', text(shown(column, raw))));
            item.append(cell);
          }
          if (actionable) { const td = make('td'); td.append(bar); item.append(td); }
        } else if (kind === 'card') {
          // A card: title and text in its header, notes and badges in its panel, actions in its footer.
          item.classList.add('mw-card'); item.dataset.slot = 'card';
          const head = make('header', undefined, 'mw-card__header'), copy = make('div'); if (record.title) copy.append(rawText('h3', record.title, 'mw-card__title'));
          if (record.body) { record.body.classList.add('mw-card__description'); copy.append(record.body); } head.append(copy); item.append(head);
          const panel = make('div', undefined, 'mw-card__panel'); panel.append(...record.notes); if (record.meta) panel.append(record.meta); if (record.fallback) panel.append(record.fallback); if (panel.childNodes.length) item.append(panel);
          if (actions.length) { const foot = make('footer', undefined, 'mw-card__footer'); foot.append(bar); item.append(foot); }
        } else if (kind === 'accordion') {
          // A fold: the title and its badges are the summary; the text, notes and actions open below it.
          item.classList.add('mw-collapsible'); item.dataset.slot = 'collapsible';
          const summary = make('summary'), recordTitle = record.title || text(at(row, node.props.textField)).slice(0, 60);
          summary.append(recordTitle ? rawText('span', recordTitle, 'pc-fold-title') : make('span', t.text("common.generated.numbered-record", { index: index + 1 }), 'pc-fold-title')); if (record.meta) summary.append(record.meta);
          const inside = make('div', undefined, 'mw-collapsible__body'); if (record.body) inside.append(record.body); inside.append(...record.notes); if (record.fallback) inside.append(record.fallback); if (actions.length) inside.append(bar);
          item.append(summary, inside);
        } else {
          // A directory row: the catalog's row, copy on the left, the main figure and the actions at the end.
          const rowEl = make('div', undefined, 'mw-dir-row mw-dir-row--meta pc-row'), copy = make('span', undefined, 'mw-dir-row__copy'), headline = make('span', undefined, 'mw-dir-row__headline');
          rowEl.dataset.slot = 'directory-row'; if (record.title) headline.append(rawText('strong', record.title)); copy.append(headline);
          if (record.body) copy.append(record.body); copy.append(...record.notes); if (record.meta) copy.append(record.meta); if (record.fallback) copy.append(record.fallback);
          rowEl.append(copy); if (record.figure) rowEl.append(record.figure);
          item.classList.add('mw-dir-row-wrap'); item.append(rowEl); if (actions.length) { bar.classList.add('mw-dir-row__ops'); item.append(bar); }
          if (kind === 'calendar') {
            // The calendar lays records out by their day, earliest first as they came.
            const date = dayOf(node, row);
            if (!dayList || date !== day) {
              day = date; const block = make('section', undefined, 'pc-agenda-day');
              dayList = make('div', undefined, 'pc-agenda-items'); block.append(agendaDay(date), dayList); body.append(block);
            }
            dayList.append(item); continue;
          }
        }
        body.append(item);
      }
      if (binding === 'read' && node.props.idField) part.seen = seen;
      // Cards end with a tile that leads to the page's own "add" form.
      const adder = kind === 'card' && composerFor(node);
      if (adder) { const tile = make('button', undefined, 'pc-add-tile'); tile.type = 'button'; tile.append(glyph('plus'), make('span', word(adder.props.title) || t.text("common.generated.new-record"))); tile.addEventListener('click', () => { const target = parts.get(adder.id); if (target?.opener) { target.opener.click(); return; } target?.root.scrollIntoView({ block: 'center', behavior: 'smooth' }); target?.form?.querySelector<HTMLElement>('input:not([type=hidden]),textarea,select')?.focus({ preventScroll: true }); }); container.append(tile); }
      if (table) { const wrap = make('div', undefined, 'mw-table-wrap pc-table-wrap'); wrap.dataset.slot = 'table'; wrap.append(container); fragment.append(wrap); }
      else { const wrap = make('div', undefined, 'pc-records'); wrap.append(container); fragment.append(wrap); }
    }
    if (listing) { part.rows = value as unknown[]; if (!(value as unknown[]).length && node.props.idField) part.seen = new Set(); }
    part.output.replaceChildren(fragment);
    if (binding === 'read' && Array.isArray(value) && node.props.idField && c.selection[node.id]) {
      const selectedId = at(c.selection[node.id], node.props.idField);
      c.selection[node.id] = value.find(row => at(row, node.props.idField) === selectedId);
    }
    showDetail(part);
  }
  return { output };
}

export function pcQuery(c: State & Kit & Rel & Rec & Det & Ctl & Out) {
  const { options, selectionVersions, parts, make, glyph, text, at, skeleton, live, ready, syncChoices, filterValues, output } = c;
  async function query(part: Part) {
    const binding = part.node.read;
    // A read that is not connected yet shows where its content will be, still.
    if (binding && !ready(binding.operationId) && !part.output.childNodes.length) part.output.append(skeleton(true));
    if (part.node.pageId !== c.currentPage || !binding || !ready(binding.operationId) || Object.values(binding.input).some(source => source.source === 'selection' && at(c.selection[source.componentId], source.field) === undefined)) return;
    const form = filterValues(part);
    // A required filter left empty: nothing to show yet, and no read.
    if (!form) { part.query++; const empty = make('div', undefined, 'mw-empty pc-empty'), mark = make('span', undefined, 'mw-empty__mark'); mark.append(glyph('filter')); empty.append(mark, make('p', t.text("common.generated.pick-filter"))); part.output.replaceChildren(empty); return; }
    const ticket = ++part.query, generation = c.epoch;
    // Until the first read answers, the shape of what is coming, not a blank.
    if (!part.output.childNodes.length || part.output.querySelector('[data-idle]')) part.output.replaceChildren(skeleton(false));
    try {
      const result = await options.call(part.node.id, 'read', { selection: c.selection, form });
      if (live(part, generation) && ticket === part.query) {
        output(part, result, 'read');
        options.onRead?.(part.node.id, { value: result });
        // An error a read left goes once a read succeeds; a failed save's message stays with the person's input.
        if (part.feedback.dataset.pcRead !== undefined) { part.feedback.className = ''; part.feedback.textContent = ''; delete part.feedback.dataset.pcRead; }
      }
    }
    catch (error) { if (live(part, generation) && ticket === part.query) {
      const message = error instanceof Error ? error.message : 'Unknown read error';
      part.output.replaceChildren();
      report(part, 'error', t.text("common.generated.read-failed", { message })); part.feedback.dataset.pcRead = '';
      const retry = make('button', t.text("common.generated.retry"), 'mw-btn mw-btn--secondary mw-btn--sm'); retry.type = 'button'; retry.dataset.pcRetry = part.node.id;
      retry.addEventListener('click', () => { void query(part); }); part.feedback.append(retry);
      options.onRead?.(part.node.id, { error: message });
    } }
  }
  /** What a part reports: an error as the catalog's alert, a success as a short badge that fades, work in progress as plain words. */
  function report(part: Part, tone: 'error' | 'success' | 'working' | '', message: string | (() => string)) {
    clearTimeout(part.feedbackTimer);
    part.feedback.className = tone === 'error' ? 'pc-error mw-alert mw-alert--danger' : tone === 'success' ? 'pc-success mw-badge mw-badge--success' : tone === 'working' ? 'pc-working' : '';
    if (typeof message === 'function') c.bindWord(part.feedback, '', message);
    else { c.clearBoundWord(part.feedback, ''); part.feedback.textContent = message; }
    // Clear the status itself, including when reduced motion disables the CSS fade.
    if (tone === 'success') part.feedbackTimer = setTimeout(() => { part.feedback.classList.add('is-leaving'); part.feedbackTimer = setTimeout(() => report(part, '', ''), 250); }, 3150);
    const mirror = part.dialog?.querySelector<HTMLElement>('.pc-dialog-error'); if (mirror) { mirror.hidden = tone !== 'error'; mirror.textContent = tone === 'error' ? part.feedback.textContent : ''; }
  }
  function refresh(componentId?: string) {
    if (componentId !== undefined) {
      const part = parts.get(componentId);
      if (!part?.node.read) throw new Error('组件没有可刷新的读取：' + componentId);
      return Promise.all([query(part)]);
    }
    for (const part of parts.values()) for (const source of Object.values(part.node.submit?.input ?? {})) if (source.source === 'form' && source.prefill) {
      const version = selectionVersions.get(source.prefill.componentId); if (version === undefined || part.prefilled.get(source.field) === version) continue;
      const value = at(c.selection[source.prefill.componentId], source.prefill.field);
      const input = [...part.form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]') ?? []].find(field => field.name === source.field);
      if (input && value !== undefined) { if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(value); else input.value = text(value); part.prefilled.set(source.field, version); syncChoices(part.form!); input.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    return Promise.all([...parts.values()].map(query));
  }
  return { query, report, refresh };
}
