import type { UiPageInteraction } from "@molis-ai/molis-work-contracts/platform/ui";
import { errorMessage } from "./dom.js";
import type { PagePorts } from "./types.js";

/** An action a round is offered, named by reference only: the Host rechecks authority and Character scope before dispatch. */
export interface ActionRef { readonly capability_id: string; readonly version: number; readonly provider_id: string }

interface ActionView {
  readonly capability_id: string;
  readonly version: number;
  readonly provider: { readonly provider_id: string; readonly title: string };
  readonly operation: string;
  readonly action: { readonly title: string; readonly description: string; readonly audiences: readonly string[] };
  readonly availability: { readonly available: boolean; readonly reason?: string };
}

interface ActionRow { readonly ref: ActionRef; readonly title: string; readonly source: string; readonly available: boolean; readonly reason: string }

/** A card a run suggests, as the Host drew it. */
export interface RunCard { readonly card_id: string; readonly revision: number; readonly html: string }

/** A run's cards, as the page draws them under its block. */
export interface CardRun { readonly cards?: readonly RunCard[] }

/** What the page keeps on a card it drew: the interaction bound to it and what it showed (FLOW-03). */
export interface CardNode extends HTMLElement { ix?: UiPageInteraction; ixBase?: string }

export interface ActionPorts extends PagePorts {
  /** The actions each session's next run is given. */
  readonly selections: Map<string, ActionRef[]>;
  readonly save: (id: string) => Promise<unknown>;
  readonly controls: () => void;
  readonly interaction: (node: HTMLElement, options: { onAction: (action: string) => Promise<void> }) => UiPageInteraction;
  readonly make: <Tag extends keyof HTMLElementTagNameMap>(tag: Tag) => HTMLElementTagNameMap[Tag];
  readonly sessionPath: (id: string, runId?: string) => string;
  readonly readCurrent: () => Promise<void>;
}

/**
 * The round's actions in the page: which the next run is given (references only; the Host rechecks authority and Character
 * scope before dispatch), and what a run suggests, as the operation cards the Host draws (specs/ai-interaction-experience
 * D25), returned as `renderCards`. The page binds a card's buttons and sends what it holds; a step beside the composer
 * presses a card's run only while it holds no edits the person has not sent (FLOW-03), so `ixBase` keeps what it showed.
 */
export function actionsClient(ports: ActionPorts) {
  const L = ports.translate;
  const { lifetime, q, api, current, selections, save, controls, status, make, sessionPath, readCurrent, interaction } = ports;
  const dialog = q<HTMLDialogElement>('[data-coding-actions-dialog]'), list = q('[data-coding-actions-list]'), error = q('[data-coding-actions-error]'), submit = q<HTMLButtonElement>('[data-coding-actions-save]');
  const key = (ref: ActionRef) => JSON.stringify([ref.capability_id, ref.version, ref.provider_id]);
  let session = '', ticket = 0, busy = false;
  let chosen: ActionRef[] = [];
  const close = () => { if (busy)
    return; ticket++; dialog.close(); };
  const open = async () => {
    if (!current() || busy)
      return;
    const id = current(), request = ++ticket;
    session = id;
    chosen = structuredClone(selections.get(id) || []);
    list.textContent = L('coding.actions.reading');
    error.textContent = '';
    submit.disabled = true;
    dialog.showModal();
    try {
      await save(id);
      const data = await api<{ actions: ActionView[] }>('/sessions/' + encodeURIComponent(id) + '/actions');
      if (request !== ticket || current() !== id || !dialog.open)
        return;
      const canWrite = q<HTMLSelectElement>('[data-coding-intent]').value === 'execute';
      const rows: ActionRow[] = data.actions.filter(view => view.action.audiences.includes('agent')).map(view => ({ ref: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id },
        title: view.action.title, source: view.provider.title,
        available: view.availability.available && (canWrite || view.operation === 'query'),
        reason: !view.availability.available ? view.availability.reason ?? '' : !canWrite && view.operation !== 'query' ? L('coding.actions.query-only') : view.action.description }));
      for (const ref of chosen)
        if (!rows.some(row => key(row.ref) === key(ref)))
          rows.push({ ref, title: ref.capability_id, source: ref.provider_id, available: false, reason: L('coding.actions.gone') });
      list.replaceChildren();
      for (const row of rows) {
        const label = document.createElement('label'), check = document.createElement('input'), copy = document.createElement('span'), title = document.createElement('strong'), description = document.createElement('span');
        label.className = 'mw-check-row coding-material';
        check.type = 'checkbox';
        check.className = 'mw-check';
        check.checked = chosen.some(ref => key(ref) === key(row.ref));
        check.disabled = !row.available && !check.checked;
        title.textContent = row.title + ' · v' + row.ref.version;
        description.textContent = row.source + ' · ' + row.reason;
        copy.append(title, document.createElement('br'), description);
        check.onchange = () => { chosen = chosen.filter(ref => key(ref) !== key(row.ref)); if (check.checked)
          chosen.push(row.ref); };
        label.append(check, copy);
        list.append(label);
      }
      if (!rows.length)
        list.textContent = L('coding.actions.none');
      submit.disabled = false;
    }
    catch (failure) {
      if (request === ticket && current() === id)
        error.textContent = L('coding.actions.read-failed', { reason: errorMessage(failure) });
    }
  };
  q('[data-coding-actions-open]').onclick = () => void open();
  q('[data-coding-actions-close]').onclick = close;
  lifetime.listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
  q('[data-coding-actions-form]').onsubmit = async (event) => {
    event.preventDefault();
    if (busy || submit.disabled)
      return;
    if (current() !== session) {
      error.textContent = L('coding.actions.session-changed');
      return;
    }
    const id = session;
    selections.set(id, structuredClone(chosen));
    controls();
    busy = true;
    submit.disabled = true;
    const enabled = [...list.querySelectorAll<HTMLInputElement>('input:not(:disabled)')];
    enabled.forEach(input => input.disabled = true);
    try {
      await save(id);
      dialog.close();
      ticket++;
      status(L('coding.actions.saved'));
    }
    catch (failure) {
      error.textContent = L('coding.choice.save-failed', { reason: errorMessage(failure) });
    }
    finally {
      busy = false;
      submit.disabled = false;
      enabled.forEach(input => input.disabled = false);
    }
  };
  const renderCards = (block: Element, run: CardRun) => {
    let box = block.querySelector<HTMLElement>(':scope > [data-coding-cards]');
    if (!run.cards?.length) {
      box?.remove();
      return null;
    }
    if (!box) {
      box = make('div');
      box.className = 'coding-cards';
      box.dataset.codingCards = '';
    }
    for (const card of run.cards) {
      let node = box.querySelector<CardNode>('[data-card="' + CSS.escape(card.card_id) + '"]');
      if (node?.dataset.html === card.html) {
        box.append(node);
        continue;
      }
      node?.ix?.destroy();
      node?.remove();
      const template = make('template');
      template.innerHTML = card.html;
      const first = template.content.firstElementChild;
      if (!(first instanceof HTMLElement))
        continue;
      node = first as CardNode;
      node.dataset.card = card.card_id;
      node.dataset.html = card.html;
      box.append(node);
      const id = current(), held = node, buttons = (on: boolean) => held.querySelectorAll('button').forEach(button => { button.disabled = !on; });
      const client = held.ix = interaction(held, { onAction: async (action) => {
          if (held.dataset.busy || !['run', 'dismiss'].includes(action))
            return;
          held.dataset.busy = '1';
          buttons(false);
          held.querySelector('[data-coding-card-error]')?.remove();
          try {
            await api(sessionPath(id) + '/cards/' + encodeURIComponent(card.card_id) + '/' + action, 'POST', { revision: card.revision, values: client.read(), time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone });
          }
          catch (error) {
            if (!lifetime.alive)
              return;
            const note = make('p');
            note.setAttribute('role', 'alert');
            note.dataset.codingCardError = '';
            note.textContent = errorMessage(error);
            held.append(note);
            buttons(true);
          }
          finally {
            delete held.dataset.busy;
            if (current() === id)
              void readCurrent();
          }
        } });
      held.ixBase = JSON.stringify(client.read());
    }
    for (const node of Array.from(box.children) as CardNode[])
      if (!run.cards.some(card => card.card_id === node.dataset.card)) {
        node.ix?.destroy();
        node.remove();
      }
    return box;
  };
  return { renderCards };
}
