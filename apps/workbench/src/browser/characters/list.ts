import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import {
  chevron, el, firstLine, latestActive, readableContent, tag, versionsOf,
  type ActionRef, type CharacterPublication, type CharacterRecord, type StoredDraft,
} from "./common.js";

/** What the list of personal Characters shows: the rows, where it is drawn, and what opening a row does. */
export interface ListView {
  list: HTMLElement;
  empty: HTMLElement;
  records: CharacterRecord[];
  publications: CharacterPublication[];
  drafts: Record<string, StoredDraft>;
  selected: string | null;
  open: (id: string) => void;
}

function listRow(view: ListView, record: CharacterRecord): HTMLElement {
  const item = el("div");
  item.setAttribute("role", "listitem");
  const button = el("button", undefined, "characters-row");
  button.type = "button"; button.dataset.characterId = record.character_id;
  button.setAttribute("aria-current", record.character_id === view.selected ? "page" : "false");
  const copy = el("span", undefined, "characters-row-copy");
  const title = el("strong", record.title || uiText.text("workbench.characters.untitled")), instructions = firstLine(record.instructions);
  const description = el("small", instructions || uiText.text("workbench.characters.no-instructions"));
  if (record.title) title.translate = false;
  if (instructions) description.translate = false;
  copy.append(title, description);
  const meta = el("span", undefined, "characters-row-meta");
  const latest = latestActive(view.publications, record.character_id);
  if (record.state === "disabled") meta.append(tag(uiText.text("workbench.characters.disabled"), "quiet"));
  if (latest) meta.append(tag(uiText.text("workbench.characters.published", { version: latest.version }), "done")); else meta.append(tag(uiText.text("workbench.characters.not-published"), "quiet"));
  if (record.import_snapshot) meta.append(tag(uiText.text("workbench.characters.local-import")));
  if (view.drafts[record.character_id]) meta.append(tag(uiText.text("workbench.characters.draft-dirty"), "attention"));
  button.append(copy, meta, chevron());
  button.addEventListener("click", () => view.open(record.character_id));
  item.append(button);
  return item;
}

/** One row per Character: its name, the first line of how it works, and where it stands (state, what is published, unsaved edits). */
export function renderList(view: ListView): void {
  view.list.replaceChildren();
  const visible = view.records.filter(record => record.state !== "tombstoned");
  view.empty.hidden = visible.length > 0;
  for (const record of visible) view.list.append(listRow(view, record));
}

/** The published versions of one Character, newest first, each with its fixed text. */
export function renderVersions(
  target: HTMLElement, publications: CharacterPublication[], selected: string | null,
  describeActions: (tools: ActionRef[] | null | undefined) => string, extend: (record: CharacterPublication, details: HTMLElement) => void,
): void {
  target.replaceChildren();
  const versions = versionsOf(publications, selected);
  if (!versions.length) { target.textContent = uiText.text("workbench.characters.no-project-publication"); return; }
  for (const record of versions) {
    const details = el("details"), summary = el("summary"), content = el("pre");
    const name = el("span", record.payload.title); name.translate = false;
    summary.append("v" + record.version + " · ", name, " · ", el("span",
      uiText.text(record.lifecycle_state !== "active" || record.availability !== "available" ? "workbench.characters.unavailable-revision" : "workbench.characters.published-revision", { revision: record.payload.source.draft_revision })));
    content.append(...readableContent(record.payload, describeActions));
    details.append(summary, content);
    extend(record, details);
    target.append(details);
  }
}
