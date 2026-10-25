import { el } from "../dom.js";
import { codingRequest, errorMessage, translate as L, type Workspace } from "./page.js";

interface Method { readonly source: string; readonly name: string; readonly version: number; readonly skill_id: string }
interface Candidate { readonly candidate_id: string; readonly name: string; readonly source_label: string; readonly body: string; readonly files: readonly string[] }

/** The part of the section every piece draws into. */
interface Library {
  readonly root: HTMLElement;
  readonly q: <Found extends HTMLElement = HTMLElement>(selector: string) => Found;
  readonly api: <Answer>(path: string, body?: unknown) => Promise<Answer>;
  readonly status: (text: string) => void;
}

const showBody = (target: Element, name: string, body: string, files: readonly string[] = []) => {
  const content = el("pre", body, "coding-method-body");
  target.replaceChildren(el("h3", name), el("p", files.length ? L("coding.library.files", { files: files.join(L("coding.list.joiner")) }) : ""), content);
};

/** One installed method: its name, and its text once the row is opened. */
function installedRow(library: Library, method: Method) {
  const row = el("details"), content = el("div");
  row.append(el("summary", method.name + " · v" + method.version), content);
  row.addEventListener("toggle", async () => {
    if (!row.open || content.dataset.loaded) return;
    content.textContent = L("coding.library.reading");
    try {
      const result = await library.api<{ method: { name: string; body: string } }>("/methods/" + encodeURIComponent(method.skill_id) + "/" + method.version);
      showBody(content, result.method.name, result.method.body);
      content.dataset.loaded = "true";
    } catch (error) {
      content.textContent = errorMessage(error);
    }
  });
  return row;
}

/** Reads the project's directories and installed methods again. */
async function refresh(library: Library) {
  const { q, api, status } = library;
  const state = await api<{ workspaces: Workspace[]; methods: Method[] }>("/state");
  const choice = q<HTMLSelectElement>("[data-method-workspace]"), previous = choice.value;
  choice.replaceChildren();
  for (const workspace of state.workspaces) {
    const option = el("option", workspace.canonical_path);
    option.value = workspace.workspace_id;
    choice.append(option);
  }
  if (state.workspaces.some(item => item.workspace_id === previous)) choice.value = previous;
  q<HTMLButtonElement>("[data-method-discover]").disabled = !state.workspaces.length;
  const list = q("[data-installed-methods]");
  list.replaceChildren();
  for (const method of state.methods.filter(item => item.source === "installed")) list.append(installedRow(library, method));
  if (!list.childElementCount) list.textContent = L("coding.library.none");
  if ("methodLibraryLoading" in q("[data-method-library-status]").dataset) status(L("coding.library.read"));
  if (!state.workspaces.length) status(L("coding.library.no-workspace"));
}

/** One method found in a directory: its text, and the button that installs it. */
function candidateRow(library: Library, candidate: Candidate) {
  const row = el("details"), content = el("div");
  row.append(el("summary", candidate.name + " · " + candidate.source_label));
  showBody(content, candidate.name, candidate.body, candidate.files);
  const install = el("button", L("coding.library.install"), "mw-btn mw-btn--primary"), outcome = el("p");
  install.type = "button";
  install.setAttribute("aria-label", L("coding.library.install-label", { name: candidate.name }));
  outcome.setAttribute("role", "status");
  row.append(content, install, outcome);
  install.addEventListener("click", async () => {
    if (install.disabled) return;
    install.disabled = true;
    outcome.textContent = L("coding.library.installing");
    try {
      const installed = await library.api<{ method: { name: string; version: number } }>("/methods/install", { candidate_id: candidate.candidate_id });
      outcome.textContent = L("coding.library.installed", { name: installed.method.name, version: installed.method.version });
      install.textContent = L("coding.library.installed-button");
      try { await refresh(library); } catch (error) { outcome.textContent += L("coding.library.refresh-failed", { reason: errorMessage(error) }); }
    } catch (error) {
      outcome.textContent = errorMessage(error);
      install.disabled = false;
    }
  });
  return row;
}

/** Looks for methods in the chosen directory and path. */
async function discover(library: Library, event: Event) {
  const { q, api, status } = library;
  event.preventDefault();
  const button = q<HTMLButtonElement>("[data-method-discover]");
  if (button.disabled) return;
  button.disabled = true;
  const list = q("[data-method-candidates]");
  list.replaceChildren();
  status(L("coding.library.discovering"));
  try {
    const result = await api<{ candidates: Candidate[] }>("/methods/discover", { workspace_id: q<HTMLSelectElement>("[data-method-workspace]").value, path: q<HTMLInputElement>("[data-method-path]").value });
    for (const candidate of result.candidates) list.append(candidateRow(library, candidate));
    status(result.candidates.length ? L("coding.library.candidates") : L("coding.library.no-candidates"));
  } catch (error) {
    status(errorMessage(error));
  } finally {
    button.disabled = false;
  }
}

/** Binds the method library of a settings section (standalone or embedded) once. */
export function bindMethods(scope: ParentNode) {
  const root = scope.querySelector<HTMLElement>("[data-coding-method-library]");
  if (!root || root.dataset.bound) return;
  root.dataset.bound = "true";
  const q = <Found extends HTMLElement = HTMLElement>(selector: string) => {
    const found = root.querySelector<Found>(selector);
    if (!found) throw new Error("method library: " + selector);
    return found;
  };
  const status = (text: string) => {
    const node = q("[data-method-library-status]");
    delete node.dataset.methodLibraryLoading;
    node.textContent = text;
  };
  const library: Library = { root, q, status, api: (path, body) => codingRequest(root, path, body, L("coding.library.failed")) };
  for (const field of [q("[data-method-workspace]"), q("[data-method-path]")]) {
    field.addEventListener("input", () => {
      if (q("[data-method-candidates]").childElementCount) {
        q("[data-method-candidates]").replaceChildren();
        status(L("coding.library.source-changed"));
      }
    });
  }
  q("[data-method-discovery-form]").addEventListener("submit", event => void discover(library, event));
  void refresh(library).catch(error => status(L("coding.library.unreadable", { reason: errorMessage(error) })));
}
