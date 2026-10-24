import { esc, isAbort, messageOf, required } from "./dom.js";
import { issuesRequest } from "./request.js";
import type { Current, EditorData, Issue, IssuesHost, IssuesPage, IssuesState, Pending, Translate } from "./types.js";

/** The style sheet, minified: the package's build script defines it (`--define:ISSUES_CSS`, from src/styles.ts). */
declare const ISSUES_CSS: string;

export const isPending = (current: Current | null): current is Pending => current !== null && !("version" in current);

function initialState(): IssuesState {
  return {
    rows: [], next: null, pending: [], current: null, editing: false, saving: false, images: [], edits: [], fresh: null, listEpoch: 0, readEpoch: 0,
    toastTimer: undefined, toastRun: null, reported: "", importing: 0, restoring: true, pictureWrites: 0, pictureFault: false,
    pictureQueue: Promise.resolve(), review: null, held: new Set(),
  };
}

/** The page the parts share, mounted on the root the server drew; null when this view is not on the page. */
export function issuesPage(host: IssuesHost): IssuesPage | null {
  const root = host.root || document.querySelector<HTMLElement>('[data-issues="workbench"]');
  if (!root) return null;
  const scope = host.mountPluginClient(root);
  if (!scope) return null;
  root.dataset.ready = "true";
  const style = document.createElement("style");
  style.textContent = ISSUES_CSS;
  root.appendChild(style);
  scope.own(() => { style.remove(); delete root.dataset.ready; });
  const L: Translate = host.translate ?? ((key) => key);
  const $ = <T extends HTMLElement = HTMLElement>(key: string): T => required<T>(root, `[data-issue-${key}]`);
  const composer = $<HTMLFormElement>("composer");
  const editor = $<HTMLFormElement>("editor");
  const el = {
    root, home: $("home"), detail: $("detail"), composer, editor, list: $("list"), toastBox: $("toast"), gone: $("gone"),
    desc: required<HTMLTextAreaElement>(composer, 'textarea[name="description"]'),
    titleInput: required<HTMLInputElement>(editor, 'input[name="title"]'),
    detailInput: required<HTMLTextAreaElement>(editor, 'textarea[name="description"]'),
  };
  const state = initialState();
  const api = issuesRequest(host, scope, L);

  const toast = (text: string, action = "", then: (() => Promise<void>) | null = null, failed = false) => {
    scope.clearTimeout(state.toastTimer);
    state.toastRun = then;
    required<HTMLElement>(el.toastBox, ":scope > span").textContent = text;
    required<HTMLElement>(el.toastBox, "[data-issue-toast-action]").textContent = action;
    el.toastBox.classList.toggle("is-error", failed);
    // The one toast (.mw-toast): a failure carries the failed mark and nudges once; anything else has no mark.
    if (failed) el.toastBox.dataset.mwState = "failed";
    else { delete el.toastBox.dataset.mwState; delete el.toastBox.dataset.ringMounted; el.toastBox.querySelector(":scope > .mw-state-ring")?.remove(); }
    el.toastBox.hidden = false;
    state.toastTimer = scope.timeout(() => { el.toastBox.hidden = true; state.toastRun = null; }, action ? 7000 : 3500);
  };
  const values = (): EditorData => ({ title: el.titleInput.value.trim(), type: editor.dataset.type ?? "", description: el.detailInput.value, images: state.edits });
  const changed = () => {
    const now = values();
    const base: Record<string, unknown> = { ...state.current };
    return Object.fromEntries(Object.entries(now).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(base[key]))) as Partial<EditorData>;
  };

  const page = {
    host, scope, L, el, state, $, api, mac: /Mac|iP/.test(navigator.platform), storageKey: "molis:issue-draft", toast, values, changed,
    read: (id: string) => api<Issue>("read?id=" + encodeURIComponent(id)),
    run: (work: () => Promise<unknown>) => { void Promise.resolve().then(work).catch((error: unknown) => { if (!isAbort(error)) toast(messageOf(error), "", null, true); }); },
    primary: (key: string, yes = true) => { $(key).className = "mw-btn mw-btn--sm mw-btn--" + (yes ? "primary" : "secondary"); },
    // The shared box (host.confirmBox): with a run function the request goes out inside it and a refusal is said there.
    confirm: (title: string, text: string, label: string, run?: () => Promise<unknown>) => {
      const dialog = $<HTMLDialogElement>("dialog");
      const ok = required<HTMLElement>(dialog, "[value=confirm]");
      required<HTMLElement>(dialog, "h2").textContent = title;
      required<HTMLElement>(dialog, "p").textContent = text;
      ok.textContent = label;
      return host.confirmBox(dialog, ok, run);
    },
    flag: (text = "") => {
      const box = $("flag");
      box.hidden = !text;
      box.textContent = text;
      if (/模型|model/i.test(text)) box.insertAdjacentHTML("beforeend", ` <a href="/settings/models">${esc(L("issues.models-link"))}</a>`);
    },
    pick: (type = "") => {
      editor.dataset.type = type;
      for (const button of editor.querySelectorAll<HTMLElement>("[data-type]")) button.setAttribute("aria-pressed", String(button.dataset.type === type));
    },
    // A description grows with the page (data-fit with no max); a value set here sends no input event.
    fit: (area: HTMLElement) => globalThis.molisFit?.(area),
    draft: () => isPending(state.current),
    ready: () => {
      $<HTMLButtonElement>("submit").disabled = Boolean(state.importing || state.restoring || state.pictureWrites) || (!el.desc.value.trim() && !state.images.length);
    },
  } as IssuesPage;
  return page;
}
