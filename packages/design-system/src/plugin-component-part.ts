/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Ctl, Det, Kit, Out, Part, Qry, Rec, Rel, State, Sub } from './plugin-component-types.js';
import type { SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { pluginFieldWords, pluginMessageNames, usesPluginFieldWords } from './plugin-surface-text.js';
import type { PluginComponentNode } from './plugin-components.js';

export function pcSubmit(c: State & Kit & Rel & Rec & Det & Ctl & Out & Qry) {
  const { options, make, word, typedValue, operation, live, ready, select, syncChoices, output, report, refresh } = c;
  /** The form's submit: the typed values, one call, the result shown, and the form kept or cleared. */
  function onSubmit(part: Part, form: HTMLFormElement, submit: HTMLButtonElement, schema: SandboxSchema) {
    const node = part.node;
    return async (event: SubmitEvent) => {
        event.preventDefault(); if (part.busy || !ready(node.submit?.operationId)) return;
        const generation = c.epoch, submitted = part.draft, querying = operation(node.submit?.operationId)?.kind === 'query';
        try {
          const values: Record<string, unknown> = {};
          for (const input of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]')) {
            const field = input.dataset.field!, spec = schema.properties![field]!;
            if (!input.value && !input.required && !(querying && spec.type === 'string' && schema.required?.includes(field))) continue;
            values[input.name] = spec.type === 'boolean' ? input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.value === 'true' : typedValue(input, spec) ?? input.value;
          }
          // A model call can take tens of seconds; say so rather than "saving".
          const slow = operation(node.submit!.operationId)?.effects.capabilities?.includes('model.generate');
          part.busy = true; submit.disabled = true; submit.dataset.loading = ''; const spinner = make('span', undefined, 'mw-spinner'); spinner.dataset.slot = 'button-loading-indicator'; spinner.setAttribute('aria-hidden', 'true'); submit.prepend(spinner);
          report(part, 'working', slow ? t.text("common.generated.model-working") : t.text("common.generated.saving"));
          const result = await options.call(node.id, 'submit', { form: values, selection: c.selection });
          if (!live(part, generation)) return;
          select(node.id, result);
          // Feedback describes the operation and the unsubmitted draft from state, not the language of the button.
          const flags = result && typeof result === 'object' && !Array.isArray(result) ? Object.values(result as Record<string, unknown>).filter(value => typeof value === 'boolean') : [];
          const undone = /(?:^|[._-])(?:toggle|checkin|complete)(?:$|[._-])/i.test(node.submit!.operationId) && flags.length === 1 && flags[0] === false;
          const pending = part.draft !== submitted;
          report(part, 'success', () => {
            const action = word(node.props.submitLabel);
            return action ? undone ? pending ? t.text("common.generated.action-undone-new-input", { action }) : t.text("common.generated.action-undone", { action })
              : pending ? t.text("common.generated.action-done-new-input", { action }) : t.text("common.generated.action-done", { action })
              : pending ? t.text("common.generated.new-input") : t.text("common.generated.done");
          });
          // Queries show the whole result; commands show only a requested path or a plain value.
          if (!part.node.read && (querying || part.node.submit?.outputPath || ['string', 'number', 'boolean'].includes(typeof result))) output(part, result, 'submit');
          if (!querying && part.draft === submitted) {
            if (!Object.values(part.node.submit?.input ?? {}).some(source => source.source === 'form' && source.prefill)) {
              form.reset(); form.querySelectorAll<HTMLInputElement>('input[data-pc-choice]').forEach(input => { input.value = input.dataset.pcInitial ?? ''; }); syncChoices(form);
              form.querySelectorAll('textarea').forEach(area => { area.style.height = ''; window.molisFit?.(area); }); form.querySelectorAll('select').forEach(choice => choice.dispatchEvent(new Event('change', { bubbles: true })));
            } part.dialog?.close();
            if (form.classList.contains('pc-composer')) form.querySelector<HTMLElement>('input:not([type=hidden]),textarea')?.focus({ preventScroll: true });
          }
          c.fresh = true; try { await refresh(); } finally { c.fresh = false; }
        } catch (error) { if (live(part, generation)) report(part, 'error', error instanceof Error ? error.message : t.text("common.generated.input-preserved")); }
        finally { part.busy = false; delete submit.dataset.loading; submit.querySelector('.mw-spinner')?.remove(); submit.disabled = !ready(node.submit?.operationId); }
    };
  }
  return { onSubmit };
}

export function pcPart(c: State & Kit & Rel & Rec & Det & Ctl & Out & Qry & Sub) {
  const { options, make, word, bindWord, glyph, button, MARKS, TEMPLATE, headingOf, operation, collections, rowLabel, composer, signature, exportRows, vocabulary, control, overlay, query, report, onSubmit } = c;
  function createPart(node: PluginComponentNode): Part {
    const kind = node.kind, element = make('section', undefined, 'pc-node pc-kind-' + kind); element.dataset.componentId = node.id; element.setAttribute('aria-label', word(node.props.title) || node.purpose);
    const descriptionText = word(node.props.description);
    const template = (value: string) => TEMPLATE.test(value) || !!node.read && pluginMessageNames(value).length > 0;
    const description = make('p', template(descriptionText) ? '' : descriptionText, 'pc-part-description');
    const title = make(node.intent === 'heading' ? 'h1' : 'h2', node.intent === 'heading' ? headingOf(node) : word(node.props.title), node.intent === 'heading' ? undefined : 'pc-part-title'); title.dataset.pcTitle = ''; title.hidden = !title.textContent;
    description.dataset.pcDescription = ''; description.hidden = !description.textContent;
    if (template(title.textContent ?? '')) { title.textContent = ''; title.hidden = true; }
    if (node.intent === 'heading' && kind === 'frame') {
      // The plugin's own header, as the catalog's frame header: a mark that says what it is about, its name, one line on
      // what it is for, and on the right, where the page's "new" buttons go.
      const header = make('header', undefined, 'mw-frame__header pc-app-head'), copy = make('div', undefined, 'mw-frame__heading'), mark = make('span', undefined, 'pc-mark'), actions = make('div', undefined, 'mw-frame__action pc-app-actions');
      mark.append(glyph(MARKS.find(([pattern]) => pattern.test(node.purpose))?.[1] ?? 'sparkles'));
      header.dataset.slot = 'frame'; description.className = 'pc-app-description'; copy.append(title, description); header.append(mark, copy, actions); element.append(header);
    } else if (node.intent === 'heading') {
      const card = make('article', undefined, 'mw-card pc-app-card'), header = make('header', undefined, 'mw-card__header'), copy = make('div'); card.dataset.slot = 'card';
      title.className = 'mw-card__title'; description.className = 'mw-card__description'; copy.append(title, description); header.append(copy); card.append(header); element.append(card);
    } else { const header = make('header', undefined, 'pc-part-head'); header.append(title); header.hidden = title.hidden; element.append(header, description); }
    if (options.inspect) { const inspect = make('button', options.inspectLabel || t.text("common.generated.inspect"), 'pc-inspect'); inspect.type = 'button'; inspect.addEventListener('click', () => options.inspect?.(node.id)); element.append(inspect); }
    const content = make('div', undefined, 'pc-output'), feedback = make('div'); feedback.dataset.pcFeedback = node.id; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
    const part: Part = { node, root: element, output: content, feedback, busy: false, query: 0, draft: 0, signature: signature(node), prefilled: new Map() };
    const filtered = node.read && Object.entries(node.read.input).filter(([, source]) => source.source === 'form');
    // The collection's toolbar: its filters, how many records show, and a way to take them out as a spreadsheet.
    const toolbar = make('div', undefined, 'mw-toolbar pc-toolbar'); toolbar.dataset.slot = 'toolbar';
    if (filtered?.length) {
      const schema = operation(node.read!.operationId)!.input, filter = make('div', undefined, 'pc-filter'); filter.setAttribute('role', 'search');
      for (const [field, source] of filtered) {
        const spec = schema.properties![field]!, required = schema.required?.includes(field) ?? false, words = vocabulary(node.pageId, field);
        const labels = pluginFieldWords(c.view!.contract, node.read!.operationId, field, spec), labelRef = spec.description || usesPluginFieldWords(c.view!.contract) ? labels.label : words.label ?? labels.label, label = word(labelRef);
        const made = control(spec, (source as { field: string }).field, field, label, required, true, words.values);
        if ('group' in made && made.group) { const box = make('div', undefined, 'pc-filter-item'); box.append(make('span', label, 'pc-filter-label'), made.group); filter.append(box); made.input.addEventListener('change', () => { void query(part); }); continue; }
        const input = made.input!, wrap = make('label', undefined, 'pc-filter-item');
        if (input instanceof HTMLInputElement && input.type === 'search') {
          // Search is the catalog's input group: the magnifier and the field as one control.
          const group = make('span', undefined, 'mw-input-group pc-search'); group.dataset.slot = 'input-group'; group.append(glyph('search'), input);
          wrap.append(make('span', label, 'pc-sr'), group); bindWord(input, 'placeholder', () => t.text("common.generated.search-field", { label: word(labelRef) }));
        } else wrap.append(make('span', label, 'pc-filter-label'), input);
        input.addEventListener('change', () => { clearTimeout(part.waiting); delete element.dataset.pcPending; void query(part); });
        if (input instanceof HTMLInputElement) input.addEventListener('input', () => { clearTimeout(part.waiting); element.dataset.pcPending = ''; part.waiting = setTimeout(() => { delete element.dataset.pcPending; void query(part); }, 300); });
        filter.append(wrap);
      }
      part.filter = filter; toolbar.append(filter);
    }
    if (node.read && collections.has(kind)) {
      const tools = make('div', undefined, 'pc-tools'), count = make('span', undefined, 'pc-count'), save = button(t.text("common.generated.export"), 'ghost', 'sm', 'download');
      save.dataset.pcExport = ''; save.title = t.text("common.generated.export-csv"); save.addEventListener('click', () => exportRows(part));
      tools.append(count, save); tools.hidden = true; part.tools = tools; toolbar.append(tools);
    }
    if (toolbar.childNodes.length) element.append(toolbar);
    if (node.read) element.append(content);
    if (node.submit) {
      const schema = operation(node.submit!.operationId)!.input, fields = make('div', undefined, 'pc-form-fields');
      const fieldWords = new WeakMap<HTMLElement, { label: import('@molis-ai/molis-work-contracts/platform/plugin-sandbox').SandboxVisibleText; hint?: import('@molis-ai/molis-work-contracts/platform/ui').TextRef }>();
      const typed = Object.values(node.submit.input).filter(source => source.source === 'form').length;
      for (const [field, source] of Object.entries(node.submit.input)) if (source.source === 'form') {
        const spec = schema.properties![field]!, words = vocabulary(node.pageId, field);
        const labels = pluginFieldWords(c.view!.contract, node.submit.operationId, field, spec), label = word(spec.description || usesPluginFieldWords(c.view!.contract) ? labels.label : words.label ?? labels.label);
        const made = control(spec, source.field, field, label, schema.required?.includes(field) ?? false, false, words.values, typed === 1 && composer(node) && kind === 'form', operation(node.submit.operationId)?.kind === 'query');
        if ('group' in made && made.group) { const box = make('div', undefined, 'mw-field pc-field-choice'); box.append(make('span', label, 'mw-field__label'), made.group); if ((spec.enum?.length ?? 0) > 5) box.classList.add('pc-field-wide'); fields.append(box); continue; }
        const input = made.input!;
        fieldWords.set(input, { ...labels, label: spec.description || usesPluginFieldWords(c.view!.contract) ? labels.label : words.label ?? labels.label });
        if (labels.hint && 'placeholder' in input) input.placeholder = word(labels.hint);
        if (input instanceof HTMLInputElement && input.type === 'checkbox') { const row = make('label', undefined, 'mw-check-row pc-field-check'); row.append(input, make('span', label)); fields.append(row); continue; }
        const wrap = make('label', undefined, 'mw-field'); wrap.dataset.slot = 'field'; wrap.append(make('span', label, 'mw-field__label'), input);
        if (input instanceof HTMLTextAreaElement) {
          wrap.classList.add('pc-field-wide');
          // A long answer grows with what is written (data-fit, the shared intrinsic sizing); ⌘/Ctrl+Enter sends it.
          input.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); part.form?.requestSubmit(); } });
        }
        fields.append(wrap);
      }
      const submit = make('button', word(node.props.submitLabel) || t.text("common.generated.submit"), 'mw-btn mw-btn--primary mw-btn--md pc-submit'); submit.type = 'submit'; submit.dataset.slot = 'button';
      const visible = [...fields.children];
      let form: HTMLFormElement;
      if (kind === 'sheet' || kind === 'dialog') {
        // Filled in the catalog's sheet or dialog: a button opens it, and it closes once saved.
        const shell = overlay(kind, word(node.props.title) || word(node.props.submitLabel) || t.text("common.generated.new"), word(node.props.description), node.id);
        const cancel = button(t.text("common.generated.cancel"), 'secondary', 'md'); cancel.addEventListener('click', () => shell.dialog.close());
        const error = make('p', '', 'pc-dialog-error mw-field__error'); error.hidden = true;
        shell.body.append(fields); shell.footer.append(error, cancel, submit); form = shell.form; part.dialog = shell.dialog;
        const opener = button(word(node.props.title) || word(node.props.submitLabel) || t.text("common.generated.new"), 'primary', 'md', 'plus'); opener.dataset.pcOpen = node.id; opener.classList.add('pc-open');
        opener.addEventListener('click', () => { shell.dialog.showModal(); shell.form.querySelector<HTMLElement>('input:not([type=hidden]),textarea,select')?.focus(); });
        part.opener = opener; element.append(opener, shell.dialog);
      } else if (kind === 'alert-dialog') {
        // A step that cannot be undone asks first, in the catalog's alert dialog.
        const shell = overlay('confirm', t.text("common.generated.confirm", { action: rowLabel(node) }), t.text("common.generated.irreversible"), node.id);
        bindWord(shell.dialog.querySelector('h2')!, '', () => t.text("common.generated.confirm", { action: rowLabel(part.node) }));
        const cancel = button(t.text("common.generated.cancel"), 'secondary', 'md'), yes = button(rowLabel(node), 'danger', 'md'); yes.dataset.pcConfirmYes = '';
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
          form.classList.add('pc-inline'); visible[0]!.querySelector('span')!.className = 'pc-sr';
          const labels = fieldWords.get(only);
          bindWord(only, 'placeholder', () => {
            const label = word(labels?.label), hint = word(labels?.hint);
            return label && hint ? t.text("common.generated.input-hint", { label, hint }) : label || hint || t.text("common.generated.write-something");
          });
          const group = make('div', undefined, 'mw-input-group pc-inline-group'); group.dataset.slot = 'input-group'; group.append(visible[0]!, submit); panel.append(group);
        } else {
          if (visible.length && visible.length <= 4 && !fields.querySelector('.pc-field-wide')) form.classList.add('pc-compact');
          const foot = make('div', undefined, 'pc-form-actions'); foot.append(submit); panel.append(fields, foot);
        }
        form.append(panel);
        if (composer(node)) form.classList.add('pc-composer');
      }
      const edited = () => { part.draft++; if (part.feedback.dataset.pcInvalid !== undefined && form.checkValidity()) { report(part, '', ''); delete part.feedback.dataset.pcInvalid; } };
      form.addEventListener('input', edited); form.addEventListener('change', edited);
      form.addEventListener('invalid', event => {
        const field = event.target;
        if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return;
        report(part, 'error', field.validity.valueMissing ? word(part.node.props.requiredText) || t.text("common.generated.required-field") : field.validationMessage);
        part.feedback.dataset.pcInvalid = '';
      }, true);
      form.addEventListener('submit', onSubmit(part, form, submit, schema));
      part.form = form; if (!part.dialog) element.append(form);
    }
    if (!node.read) element.append(content);
    element.append(feedback); return part;
  }
  return { createPart };
}
