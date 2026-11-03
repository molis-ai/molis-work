import { el, messageOf, type ArtifactVersionRef, type CharacterRequest, type ImportSnapshot, type SnapshotFile, type SnapshotSkill } from "./common.js";

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
  const box = detail(file.path + " · " + (file.bytes ?? 0) + " 字节", "展开读取文件");
  let loaded = false;
  box.addEventListener("toggle", async () => {
    const pre = box.querySelector("pre");
    if (!box.open || loaded || !pre) return;
    loaded = true; pre.textContent = "正在读取…";
    try {
      const result = await request<FileResult>("POST", filePath(owner), { ...owner, skill_id: skill.id, path: file.path });
      pre.textContent = result.encoding === "utf8" ? result.content : "二进制附件已完整保存（" + result.bytes + " 字节），原生执行时保留原文件。";
    } catch (error) {
      pre.textContent = messageOf(error); loaded = false;
    }
  });
  return box;
}

/** A snapshot's rules and skills, each readable on its own. */
export function files(request: CharacterRequest, target: HTMLElement, snapshot: ImportSnapshot, owner: FileOwner): void {
  for (const rule of snapshot.rules) target.append(detail((rule.scope === "project" ? "项目" : "全局") + " · " + rule.path + (rule.condition ? " · 条件规则" : ""), rule.content));
  for (const skill of snapshot.skills) {
    const box = el("details");
    box.append(el("summary", skill.name + " · " + skill.files.length + " 个文件 · " + (skill.compatibility === "portable" ? "可供内置引擎使用" : "依赖原生环境")));
    for (const file of skill.files) box.append(filePreview(request, file, skill, owner));
    target.append(box);
  }
}

/** What a newly scanned snapshot changes against the saved one. */
export function diff(before: ImportSnapshot | undefined, after: ImportSnapshot): string {
  if (!before) return "";
  const rows = (snapshot: ImportSnapshot): Map<string, string> => new Map<string, string>([
    ...snapshot.rules.map((rule): [string, string] => ["规则 " + rule.path, rule.content]),
    ...snapshot.skills.map((skill): [string, string] => ["技能 " + skill.path, JSON.stringify(skill.files)]),
  ]);
  const a = rows(before), b = rows(after);
  let added = 0, changed = 0, removed = 0;
  for (const [name, value] of b) {
    if (!a.has(name)) added++;
    else if (a.get(name) !== value) changed++;
  }
  for (const name of a.keys()) if (!b.has(name)) removed++;
  return "来源差异：新增 " + added + "，变更 " + changed + "，移除 " + removed + "。保存的名称和补充指令会保留。";
}
