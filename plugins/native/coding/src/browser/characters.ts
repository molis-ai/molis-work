import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { errorMessage } from "./dom.js";
import type { PagePorts } from "./types.js";

/** A role as a session keeps it: one of the person's originals or a member of this project (never a version: the Host pins it). */
export type CharacterRef = { readonly kind: "personal"; readonly character_id: string } | { readonly kind: "project"; readonly member_id: string };

interface ImportedSkill { readonly id: string; readonly name: string; readonly compatibility: string }

/** One role the person can pick, as `GET /sessions/<id>/characters` lists it. */
interface CharacterRow {
  readonly ref: CharacterRef | null;
  readonly title: string;
  readonly available: boolean;
  readonly reason?: string;
  readonly note?: string;
  readonly host_tools?: readonly string[] | null;
  readonly imported_skills?: readonly ImportedSkill[];
}

type DefaultRef = CharacterRef | { readonly kind: "assistant" } | null;
interface CharactersRead {
  readonly characters: readonly CharacterRow[];
  readonly limits_verified: boolean;
  readonly defaults: { readonly personal: DefaultRef; readonly project: DefaultRef };
}

/** Why a role cannot be picked, in the person's words; Characters gives the reason as a code (none: the row says it is unavailable). */
const reasonText = (reason: string | undefined) => reason === "disabled" ? uiText.text('coding.character.reason-disabled')
  : reason === "original_disabled" ? uiText.text('coding.character.reason-original_disabled')
  : reason === "unsaved" ? uiText.text('coding.character.reason-unsaved') : reason;

export interface CharacterPorts extends PagePorts {
  /** The Character each session's next round names, and the title it was picked under. */
  readonly selections: Map<string, CharacterRef | null>;
  readonly titles: Map<string, string>;
  readonly skillSelections: Map<string, readonly string[]>;
  /** Saves the session's choices for its next round. */
  readonly save: (id: string) => Promise<unknown>;
  /** Redraws the composer's controls after a choice changed. */
  readonly controls: () => void;
}

/** The role for the session's next round, as a stable choice; history shows the version each round froze, never this. */
export function characterChoice(ports: CharacterPorts) {
  const { lifetime, q, api, current, selections, titles, skillSelections, save, controls, status } = ports;
  const dialog = q<HTMLDialogElement>('[data-coding-character-dialog]'), list = q('[data-coding-character-list]'), error = q('[data-coding-character-error]'), submit = q<HTMLButtonElement>('[data-coding-character-save]');
  const closeButton = q<HTMLButtonElement>('[data-coding-character-close]');
  const key = (ref: DefaultRef | undefined) => !ref || ref.kind === 'assistant' ? '' : ref.kind + (ref.kind === 'personal' ? ref.character_id : ref.member_id);
  let ticket = 0, session = '', busy = false;
  let rows: CharacterRow[] = [], candidate: CharacterRef | null = null, selectedSkills: string[] = [];
  const close = () => { if (busy)
    return; ticket++; dialog.close(); };
  const open = async () => {
    if (!current() || busy)
      return;
    session = current();
    const id = session, request = ++ticket;
    candidate = structuredClone(selections.get(id) ?? null);
    selectedSkills = [...(skillSelections.get(id) || [])];
    rows = [];
    list.textContent = uiText.text('coding.character.reading');
    error.textContent = '';
    submit.disabled = true;
    dialog.showModal();
    try {
      const data = await api<CharactersRead>('/sessions/' + encodeURIComponent(id) + '/characters');
      if (request !== ticket || current() !== id || !dialog.open)
        return;
      // Where each role stands for a new session: the project's default, else the person's (the same words as the Assistant's picker).
      const tag = (ref: CharacterRef) => key(ref) === key(data.defaults.project) ? ' · ' + uiText.text('coding.character.project-default')
        : !data.defaults.project && key(ref) === key(data.defaults.personal) ? ' · ' + uiText.text('coding.character.my-default') : '';
      rows = data.characters.map(item => ({ ...item, title: item.title + (item.ref ? tag(item.ref) : ''),
        available: item.available && data.limits_verified, reason: data.limits_verified ? reasonText(item.reason) : uiText.text('coding.character.runtime') }));
      if (candidate && !rows.some(item => key(item.ref) === key(candidate)))
        rows.unshift({ ref: candidate, title: titles.get(id) || uiText.text('coding.character.gone-title'), available: false, reason: uiText.text('coding.character.gone') });
      list.replaceChildren();
      const options: CharacterRow[] = [{ ref: null, title: uiText.text('coding.character.no-character'), available: true, note: uiText.text('coding.character.no-character-note') }, ...rows];
      for (const [index, item] of options.entries()) {
        const row = document.createElement('section'), label = document.createElement('label'), radio = document.createElement('input'), name = document.createElement('span');
        // Whether this row is the one chosen when the list is drawn; a later change redraws the skills from the radios.
        const mine = key(candidate) === key(item.ref);
        row.className = 'coding-material';
        label.className = 'mw-check-row';
        radio.className = 'mw-radio';
        radio.type = 'radio';
        radio.name = 'coding-character-choice';
        radio.value = String(index);
        radio.checked = mine;
        radio.disabled = !item.available;
        name.textContent = item.title;
        label.append(radio, name);
        row.append(label);
        lifetime.listen(radio, 'change', () => { if (busy)
          return; candidate = structuredClone(item.ref); selectedSkills = []; list.querySelectorAll<HTMLInputElement>('[data-character-skill]').forEach(input => { input.checked = false; input.disabled = input.dataset.owner !== key(candidate) || input.dataset.compatible !== 'true'; }); submit.disabled = false; error.textContent = ''; });
        // The row's lines under its name: why it cannot be picked, what choosing no role means, and the role's tools.
        const say = (text: string) => { const line = document.createElement('p'); line.textContent = text; row.append(line); };
        if (!item.available)
          say(item.reason || uiText.text('coding.character.unavailable'));
        if (!item.ref && item.note)
          say(item.note);
        if (item.ref) {
          const hostTools = item.host_tools ?? null;
          say(uiText.text('coding.character.tools', { tools: hostTools === null ? uiText.text('coding.character.tools-inherit') : hostTools.length ? hostTools.join(uiText.text('coding.list.joiner')) : uiText.text('coding.character.tools-none') }));
        }
        if (item.imported_skills?.length) {
          const skills = document.createElement('details'), summary = document.createElement('summary');
          summary.textContent = uiText.text('coding.character.skills');
          skills.append(summary);
          for (const skill of item.imported_skills) {
            const label = document.createElement('label'), check = document.createElement('input'), title = document.createElement('span'), portable = skill.compatibility === 'portable';
            label.className = 'mw-check-row';
            check.type = 'checkbox';
            check.className = 'mw-check';
            check.dataset.characterSkill = skill.id;
            check.dataset.owner = key(item.ref);
            check.dataset.compatible = String(portable);
            check.disabled = !mine || !portable;
            check.checked = mine && selectedSkills.includes(skill.id);
            title.textContent = skill.name + (portable ? '' : uiText.text('coding.character.native'));
            label.append(check, title);
            skills.append(label);
            check.onchange = () => { selectedSkills = check.checked ? [...selectedSkills, skill.id] : selectedSkills.filter(id => id !== skill.id); };
          }
          row.append(skills);
        }
        list.append(row);
      }
      if (!rows.length) {
        const note = document.createElement('p');
        note.textContent = uiText.text('coding.character.none');
        list.append(note);
      }
      submit.disabled = Boolean(candidate && !rows.some(item => key(item.ref) === key(candidate) && item.available));
    }
    catch (failure) {
      if (request === ticket && current() === id)
        error.textContent = errorMessage(failure);
    }
  };
  lifetime.listen(closeButton, 'click', close);
  lifetime.listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
  lifetime.listen(q('[data-coding-character-form]'), 'submit', async (event) => {
    event.preventDefault();
    if (busy || submit.disabled)
      return;
    if (current() !== session) {
      error.textContent = uiText.text('coding.character.session-changed');
      return;
    }
    const id = session, selected = rows.find(item => key(item.ref) === key(candidate));
    if (candidate && !selected?.available)
      return;
    selections.set(id, structuredClone(candidate));
    skillSelections.set(id, candidate ? selectedSkills : []);
    titles.set(id, selected?.title || '');
    controls();
    busy = true;
    submit.disabled = true;
    closeButton.disabled = true;
    const enabled = [...list.querySelectorAll<HTMLInputElement>('input:not(:disabled)')];
    enabled.forEach(radio => radio.disabled = true);
    try {
      await save(id);
      dialog.close();
      ticket++;
      status(uiText.text('coding.character.saved'));
    }
    catch (failure) {
      error.textContent = uiText.text('coding.choice.save-failed', { reason: errorMessage(failure) });
    }
    finally {
      busy = false;
      submit.disabled = false;
      closeButton.disabled = false;
      enabled.forEach(radio => radio.disabled = false);
    }
  });
  /** Opens the choice for the session on show (the composer's ＋ and `/character`). */
  return { open: () => void open() };
}
