import type { HomePageDraft, HomePageFile, HomePageFilesResult } from "@molis-ai/molis-work-contracts/services/home";
import { t } from "./mainline-ui.js";

/** The person's files are the starting point. Each replacement or deletion stays editable until Save. */
export function mountMergeEditor(
  container: HTMLElement,
  mine: HomePageFilesResult,
  proposed: HomePageFilesResult,
  save: (draft: HomePageDraft) => Promise<void>,
  failed: (error: unknown) => void,
) {
  const section = document.createElement("section");
  section.dataset.hpMerge = "";
  const heading = document.createElement("h3");
  heading.textContent = t.text("workbench.home-pages.merge-edit");
  section.append(heading);
  const byPath = new Map(proposed.files.map((file) => [file.path, file]));
  const original = new Map(mine.files.map((file) => [file.path, file]));
  const edited: Array<() => HomePageFile | undefined> = [];
  for (const path of new Set([...original.keys(), ...byPath.keys()])) {
    const before = original.get(path),
      after = byPath.get(path);
    const label = document.createElement("label"),
      keep = document.createElement("input");
    keep.type = "checkbox";
    keep.checked = Boolean(before);
    label.append(keep, " ", path);
    const editor = document.createElement("textarea");
    editor.className = "mw-input";
    editor.rows = 6;
    editor.setAttribute("aria-label", path);
    editor.value = before?.text ?? after!.text;
    editor.disabled = !keep.checked;
    keep.onchange = () => {
      editor.disabled = !keep.checked;
    };
    section.append(label);
    if (before?.text !== after?.text) {
      const take = document.createElement("button");
      take.type = "button";
      take.className = "mw-btn mw-btn--secondary";
      take.textContent = t.text("workbench.home-pages.conflict-use-new");
      take.onclick = () => {
        keep.checked = Boolean(after);
        editor.disabled = !after;
        editor.value = after?.text ?? "";
      };
      const details = document.createElement("details"),
        summary = document.createElement("summary"),
        text = document.createElement("pre");
      summary.textContent = t.text("workbench.home-pages.draft");
      text.textContent = after?.text ?? "";
      details.append(summary, text, take);
      section.append(details);
    }
    section.append(editor);
    edited.push(() =>
      keep.checked ? { path, media_type: (after ?? before)!.media_type, text: editor.value } : undefined,
    );
  }
  const version = document.createElement("select"),
    metadata = document.createElement("label");
  metadata.textContent = t.text("workbench.home-pages.merge-details");
  for (const page of [mine, proposed])
    version.add(new Option(page.version.title + " · v" + page.version.version, String(page.version.version)));
  const select = document.createElement("span");
  select.className = "mw-select";
  select.append(version);
  metadata.append(select);
  const submit = document.createElement("button");
  submit.type = "button";
  submit.className = "mw-btn mw-btn--secondary";
  submit.textContent = t.text("workbench.home-pages.merge-save");
  submit.dataset.hpMergeSave = "";
  submit.onclick = async () => {
    if (submit.disabled) return;
    submit.disabled = true;
    const { title, entry, actions } = version.selectedIndex === 1 ? proposed.version : mine.version;
    try {
      await save({ title, entry, actions, files: edited.flatMap((read) => read() ?? []) });
    } catch (error) {
      failed(error);
    } finally {
      submit.disabled = false;
    }
  };
  section.append(metadata, submit);
  container.append(section);
  section.querySelector("textarea")?.focus();
}
