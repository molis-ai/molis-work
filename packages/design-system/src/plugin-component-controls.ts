/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type { Kit, Part, Rel, State } from './plugin-component-types.js';
import type { SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

export function pcDetail(c: State & Kit & Rel) {
  const { selectionVersions, parts, details, make, button, text, shown, prose, at, detailEnabled } = c;
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
    const row = c.selection[id], node = part.node;
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
  function select(id: string, value: unknown) { c.selection[id] = value; selectionVersions.set(id, (selectionVersions.get(id) ?? 0) + 1); const part = parts.get(id); if (part) showDetail(part, true); }
  return { showDetail, select };
}

export function pcControls(c: State & Kit & Rel) {
  const { make, button, text, naming, picker, chipsFit, typedValue, operation } = c;
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
    const column = c.view?.nodes.filter(other => other.pageId === pageId).flatMap(other => other.props.columns ?? []).find(item => item.field === field);
    return { label: column?.label, values: column?.values };
  };
  function filterValues(part: Part): Record<string, unknown> | null {
    const binding = part.node.read!, schema = operation(binding.operationId)!.input, values: Record<string, unknown> = {};
    for (const input of part.filter?.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]') ?? []) {
      const value = typedValue(input, schema.properties![input.dataset.field!]!);
      if (value !== undefined) values[input.name] = value;
      else if (schema.required?.includes(input.dataset.field!)) return null;
    }
    return values;
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
      input = make('textarea', undefined, 'mw-textarea'); input.dataset.slot = 'textarea'; input.rows = 3; input.dataset.fit = ''; input.style.setProperty('--fit-max', '320px');
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
  return { syncChoices, choices, vocabulary, filterValues, control, overlay };
}
