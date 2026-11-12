import { el, messageOf, type ArtifactVersionRef, type CharacterRequest, type ImportSnapshot, type SnapshotFile, type SnapshotSkill } from "./common.js";

const uiText = globalThis.t;

/** Whose files are read: a scanned candidate, a published version, or a saved draft. */
export type FileOwner = { candidate_id: string } | { reference: ArtifactVersionRef } | { character_id: string };

interface FileResult { encoding: string; content: string; bytes: number }

/** A collapsed block that shows `content` once opened. */
export function detail(title: string, content: string): HTMLDetailsElement {
  const box = el("details"), summary = el("summary", title), pre = el("pre", content);
  box.append(summary, pre);
  return box;
}

function filePath(owner: FileOwner): string {
  if ("candidate_id" in owner) return "/imports/file";
  if ("reference" in owner) return "/publication/file";
  return "/drafts/" + encodeURIComponent(owner.character_id) + "/file";
}

/** One skill file: read from the Host when the person opens it, once. */
export function filePreview(request: CharacterRequest, file: SnapshotFile, skill: SnapshotSkill, owner: FileOwner): HTMLDetailsElement {
  const box = detail(uiText.text("workbench.characters.attachment-size", { path: file.path, bytes: file.bytes ?? 0 }), uiText.text("workbench.characters.read-file"));
  let loaded = false;
  box.addEventListener("toggle", async () => {
    const pre = box.querySelector("pre");
    if (!box.open || loaded || !pre) return;
    loaded = true; pre.textContent = uiText.text("workbench.characters.loading");
    try {
      const result = await request<FileResult>("POST", filePath(owner), { ...owner, skill_id: skill.id, path: file.path });
      pre.translate = result.encoding !== "utf8";
      pre.textContent = result.encoding === "utf8" ? result.content : uiText.text("workbench.characters.binary-kept", { bytes: result.bytes });
    } catch (error) {
      pre.textContent = messageOf(error); loaded = false;
    }
  });
  return box;
}

/** A snapshot's rules and skills, each readable on its own. */
export function files(request: CharacterRequest, target: HTMLElement, snapshot: ImportSnapshot, owner: FileOwner): void {
  for (const rule of snapshot.rules) target.append(detail(uiText.text(rule.scope === "project" ? (rule.condition ? "workbench.characters.conditional-project" : "workbench.characters.project-path") : (rule.condition ? "workbench.characters.conditional-global" : "workbench.characters.global-path"), { path: rule.path }), rule.content));
  for (const skill of snapshot.skills) {
    const box = el("details");
    box.append(el("summary", uiText.text(skill.compatibility === "portable" ? "workbench.characters.portable-file-count" : "workbench.characters.native-file-count", { name: skill.name, count: skill.files.length })));
    for (const file of skill.files) box.append(filePreview(request, file, skill, owner));
    target.append(box);
  }
}

/** What a newly scanned snapshot changes against the saved one. */
export function diff(before: ImportSnapshot | undefined, after: ImportSnapshot): string {
  if (!before) return "";
  const rows = (snapshot: ImportSnapshot): Map<string, string> => new Map<string, string>([
    ...snapshot.rules.map((rule): [string, string] => ["rule:" + rule.path, rule.content]),
    ...snapshot.skills.map((skill): [string, string] => ["skill:" + skill.path, JSON.stringify(skill.files)]),
  ]);
  const a = rows(before), b = rows(after);
  let added = 0, changed = 0, removed = 0;
  for (const [name, value] of b) {
    if (!a.has(name)) added++;
    else if (a.get(name) !== value) changed++;
  }
  for (const name of a.keys()) if (!b.has(name)) removed++;
  return uiText.text("workbench.characters.source-changes", { added, changed, removed });
}
