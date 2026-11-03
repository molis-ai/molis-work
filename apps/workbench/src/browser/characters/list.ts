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
  copy.append(el("strong", record.title || "未命名角色"), el("small", firstLine(record.instructions) || "还没写做事方式"));
  const meta = el("span", undefined, "characters-row-meta");
  const latest = latestActive(view.publications, record.character_id);
  if (record.state === "disabled") meta.append(tag("已停用", "quiet"));
  if (latest) meta.append(tag("已发布 v" + latest.version, "done")); else meta.append(tag("未发布", "quiet"));
  if (record.import_snapshot) meta.append(tag("本机导入"));
  if (view.drafts[record.character_id]) meta.append(tag("有未保存的修改", "attention"));
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
  if (!versions.length) { target.textContent = "尚未发布到当前项目。"; return; }
  for (const record of versions) {
    const details = el("details"), summary = el("summary"), content = el("pre");
    summary.textContent = "v" + record.version + " · " + record.payload.title + " · "
      + (record.lifecycle_state !== "active" || record.availability !== "available" ? "当前不可用" : "已发布") + " · 草稿修订 " + record.payload.source.draft_revision;
    content.textContent = readableContent(record.payload, describeActions);
    details.append(summary, content);
    extend(record, details);
    target.append(details);
  }
}
