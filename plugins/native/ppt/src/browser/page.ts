import { required } from "./dom.js";
import { pptRequest } from "./request.js";
import type { Elements, Ppt, PptHost, PptPage, PptState } from "./types.js";

const elementsOf = (bench: HTMLElement): Elements => {
  const optional = <T extends Element>(selector: string) => bench.querySelector<T>(selector);
  return {
    bench,
    list: required(bench, "[data-ppt=directory]"),
    rowsEl: required(bench, "[data-ppt-rows]"),
    empty: required(bench, "[data-ppt-empty]"),
    workspace: required(bench, "[data-ppt-stage-workspace]"),
    titleEl: required(bench, "[data-ppt-editor-title]"),
    statusEl: required(bench, "[data-ppt-editor-status]"),
    titleInput: required(bench, "[data-ppt-title]"),
    descriptionInput: required(bench, "[data-ppt-description]"),
    colorPrimary: required(bench, "[data-ppt-color-primary]"),
    colorBackground: required(bench, "[data-ppt-color-background]"),
    colorText: required(bench, "[data-ppt-color-text]"),
    slideList: required(bench, "[data-ppt-slide-list]"),
    slideTitle: required(bench, "[data-ppt-slide-title]"),
    slideBullets: required(bench, "[data-ppt-slide-bullets]"),
    slideNotes: required(bench, "[data-ppt-slide-notes]"),
    previewEl: required(bench, "[data-ppt-preview]"),
    note: optional("[data-ppt-note]"),
    confirmDialog: optional("[data-ppt-confirm]"),
    pendingNote: required(bench, "[data-ppt-publication-note]"),
    artifactBar: optional("[data-ppt-artifact-bar]"),
    outBox: optional("[data-ppt-outline-dialog]"),
    outlineForm: optional("[data-ppt-outline-form]"),
  };
};

const initialState = (): PptState => ({
  records: [], selected: null, slideKey: "", saveTimer: undefined, editRev: 0, savedRev: 0, saveRun: null, saveError: null, busy: false,
  aiAvailable: false, aiUnavailableReason: "", listSeq: 0, outlineMode: "local", outlineKind: "text", outline: null,
});

const notInstalled = (name: string) => () => { throw new Error(`PPT page: ${name} is not installed`); };

/** The page the parts share: what the server drew, the state, the requests. The parts install their operations on it. */
export function createPage(host: PptHost, bench: HTMLElement): PptPage {
  const L = host.translate, el = elementsOf(bench), s = initialState();
  const page: PptPage = {
    host, L, el, s, request: pptRequest(host, L), api: "/ppt",
    showNote(text, isError) {
      const { note } = el;
      if (!note) return;
      note.hidden = !text;
      note.textContent = text || "";
      note.classList.toggle("is-error", Boolean(isError && text));
      if (isError && text) note.scrollIntoView({ block: "nearest" });
    },
    arrive(node) {
      if (!node) return node;
      node.classList.remove("is-arriving");
      void node.offsetWidth;
      node.classList.add("is-arriving");
      return node;
    },
    placed(detail) { window.dispatchEvent(new CustomEvent("molis:placement-result", { detail })); },
    ask(message, okLabel, run) {
      const dialog = el.confirmDialog;
      if (!dialog) return Promise.resolve(false);
      const ok = required<HTMLElement>(dialog, "[data-confirm-ok]");
      required(dialog, "[data-confirm-text]").textContent = message;
      ok.textContent = okLabel;
      return host.confirmBox(dialog, ok, run);
    },
    open(): Ppt {
      if (!s.selected) throw new Error("PPT page: no deck is open");
      return s.selected;
    },
    publishContext: notInstalled("publishContext"), paintStatus: notInstalled("paintStatus"), setBusy: notInstalled("setBusy"),
    currentSlide: notInstalled("currentSlide"), slidesFromEditor: notInstalled("slidesFromEditor"), setColor: notInstalled("setColor"),
    liveRecord: notInstalled("liveRecord"), draftFromDom: notInstalled("draftFromDom"), paintView: notInstalled("paintView"),
    renderSlideList: notInstalled("renderSlideList"), syncSlideLabel: notInstalled("syncSlideLabel"), fillSlideFields: notInstalled("fillSlideFields"),
    renderList: notInstalled("renderList"), markSelected: notInstalled("markSelected"), remember: notInstalled("remember"),
    loadList: notInstalled("loadList"), listFailed: notInstalled("listFailed"),
    fillEditor: notInstalled("fillEditor"), closeEditor: notInstalled("closeEditor"), save: notInstalled("save"), queueSave: notInstalled("queueSave"),
    openOutline: notInstalled("openOutline"), paintOutlineModes: notInstalled("paintOutlineModes"),
    present: notInstalled("present"), printDeck: notInstalled("printDeck"),
  };
  return page;
}
