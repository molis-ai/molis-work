import { required } from "./dom.js";
import { lingguangRequest } from "./request.js";
import type { Elements, LingguangHost, LingguangPage, LingguangState, Scope } from "./types.js";

function elementsOf(workbench: HTMLElement): Elements {
  const $ = <T extends Element = HTMLElement>(selector: string): T => required<T>(workbench, selector);
  return {
    workbench, list: $("[data-lingguang=directory]"), rowsEl: $("[data-lingguang-rows]"), empty: $("[data-lingguang-empty]"),
    workspace: $("[data-lingguang-stage-workspace]"), titleEl: $("[data-lingguang-editor-title]"), titleInput: $("[data-lingguang-title]"),
    bodyInput: $("[data-lingguang-body]"), editorPane: $("[data-lingguang-pane=editor]"), chatPane: $("[data-lingguang-pane=chat]"),
    selectionBar: $("[data-lingguang-selection]"), selectedCountEl: $("[data-lingguang-selected-count]"), note: $("[data-lingguang-note]"),
    confirmDialog: $("[data-lingguang-confirm]"), saveStatus: $("[data-lingguang-save-status]"), saveRetry: $("[data-lingguang-save-retry]"),
    todoButton: $("[data-lingguang-todo]"), contextEl: $("[data-lingguang-context]"), messagesEl: $("[data-lingguang-messages]"),
    chatForm: $("[data-lingguang-chat]"), chatInput: $("[data-lingguang-chat-input]"), readingDialog: $("[data-lingguang-reading]"),
    linkDialog: $("[data-lingguang-link]"), fileInput: $("[data-lingguang-file]"), askForm: $("[data-lingguang-ask]"),
    askInput: $("[data-lingguang-ask-input]"),
  };
}

const freshState = (): LingguangState => ({
  records: [], picks: new Set(), selected: null, editorBase: null, conversation: null, saveTimer: undefined, listSeq: 0,
  saveQueue: Promise.resolve(), sending: false, fresh: new Map(), fates: new Map(), shownMessages: [], loadingFor: null,
  wantedId: null, wantedByLink: false,
});

/** The page the parts share. The parts that draw and load install their operations on it before the page is used. */
export function createPage(host: LingguangHost, life: Scope, workbench: HTMLElement): LingguangPage {
  const L = host.translate;
  const el = elementsOf(workbench);
  const page = {
    host, L, life, el, s: freshState(), request: lingguangRequest(host, life, L), api: "/sparks",
    showNote(text: string, isError?: boolean) {
      el.note.hidden = !text;
      el.note.textContent = text || "";
      el.note.classList.toggle("is-error", Boolean(isError && text));
    },
    showChat(on: boolean) {
      el.editorPane.hidden = on;
      el.chatPane.hidden = !on;
    },
    ask: (message: string, okLabel: string) => new Promise<boolean>((resolve) => {
      const dialog = el.confirmDialog;
      required(dialog, "[data-confirm-text]").textContent = message;
      required(dialog, "[data-confirm-ok]").textContent = okLabel;
      dialog.returnValue = "cancel";
      const onClose = () => {
        dialog.removeEventListener("close", onClose);
        resolve(dialog.returnValue === "ok");
      };
      dialog.addEventListener("close", onClose);
      dialog.showModal();
    }),
    placed(detail: { verb: string; title: string; object: { kind: string; id: string } }) {
      window.dispatchEvent(new CustomEvent("molis:placement-result", { detail }));
    },
  } as LingguangPage;
  return page;
}
