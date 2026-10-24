import { required } from "./dom.js";
import { datasetRequest } from "./request.js";
import type { DatasetHost, DatasetPage, DatasetState, Elements } from "./types.js";

const elementsOf = (bench: HTMLElement): Elements => {
  const optional = <T extends Element>(selector: string) => bench.querySelector<T>(selector);
  return {
    bench,
    list: required(bench, "[data-dataset=directory]"),
    rowsEl: required(bench, "[data-dataset-rows]"),
    empty: required(bench, "[data-dataset-empty]"),
    workspace: required(bench, "[data-dataset-stage-workspace]"),
    titleEl: required(bench, "[data-dataset-editor-title]"),
    statusEl: required(bench, "[data-dataset-editor-status]"),
    titleInput: required(bench, "[data-dataset-title]"),
    descInput: required(bench, "[data-dataset-description]"),
    tableEl: required(bench, "[data-dataset-table]"),
    tableEmpty: optional("[data-dataset-table-empty]"),
    filterEmpty: optional("[data-dataset-filter-empty]"),
    filterInput: required(bench, "[data-dataset-filter]"),
    toolbar: optional("[data-dataset-toolbar]"),
    columnName: optional("[data-dataset-column-name]"),
    columnType: optional("[data-dataset-column-type]"),
    aiPrompt: required(bench, "[data-dataset-ai-prompt]"),
    csvInput: required(bench, "[data-dataset-csv]"),
    note: optional("[data-dataset-note]"),
    versionsEl: required(bench, "[data-dataset-versions]"),
    versionNote: required(bench, "[data-dataset-version-note]"),
    confirmBox: optional("[data-dataset-confirm]"),
    pendingNote: required(bench, "[data-dataset-publication-note]"),
    artifactBar: optional("[data-dataset-artifact-bar]"),
    generateAi: required(bench, "[data-dataset-generate-ai]"),
    aiReason: required(bench, "[data-dataset-ai-reason]"),
    importInput: optional("[data-dataset-import-input]"),
  };
};

const initialState = (): DatasetState => ({
  records: [], selected: null, saveTimer: undefined, editRev: 0, savedRev: 0, saveRun: null, saveError: null, busy: false,
  aiAvailable: false, aiUnavailableReason: "", editorSeq: 0, listSeq: 0, filterSeen: "",
});

const notInstalled = (name: string) => () => { throw new Error(`Dataset page: ${name} is not installed`); };

/** The page the parts share: what the server drew, the state, the requests. The parts install their operations on it. */
export function createPage(host: DatasetHost, bench: HTMLElement): DatasetPage {
  const L = host.translate, el = elementsOf(bench);
  const page: DatasetPage = {
    host, L, el, s: initialState(), request: datasetRequest(host, L), api: "/datasets",
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
    ask(message, okLabel) {
      const box = el.confirmBox;
      return new Promise<boolean>((resolve) => {
        if (!box) { resolve(false); return; }
        required(box, "[data-confirm-text]").textContent = message;
        required(box, "[data-confirm-ok]").textContent = okLabel;
        box.returnValue = "cancel";
        const onClose = () => {
          box.removeEventListener("close", onClose);
          resolve(box.returnValue === "ok");
        };
        box.addEventListener("close", onClose);
        box.showModal();
      });
    },
    publishContext: notInstalled("publishContext"), paintStatus: notInstalled("paintStatus"), setBusy: notInstalled("setBusy"),
    columnsFromDom: notInstalled("columnsFromDom"), rowsFromDom: notInstalled("rowsFromDom"), readDraft: notInstalled("readDraft"),
    renderTable: notInstalled("renderTable"), renderVersions: notInstalled("renderVersions"),
    renderList: notInstalled("renderList"), markSelected: notInstalled("markSelected"), remember: notInstalled("remember"),
    loadList: notInstalled("loadList"), listFailed: notInstalled("listFailed"),
    fillEditor: notInstalled("fillEditor"), closeEditor: notInstalled("closeEditor"), save: notInstalled("save"), queueSave: notInstalled("queueSave"),
  };
  return page;
}
