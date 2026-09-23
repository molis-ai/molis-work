import { createHash } from "node:crypto";
import type { CharacterContent, CharacterDraft, CharacterImportSnapshot } from "@molis-ai/molis-work-contracts/modules/characters";

/** File bodies stay in the Host until a person opens that exact preview. */
export function characterSnapshotPreview(snapshot: CharacterImportSnapshot) {
  return { ...snapshot, skills: snapshot.skills.map(skill => ({ ...skill, files: skill.files.map(file => ({ path: file.path, encoding: file.encoding,
    bytes: Buffer.byteLength(file.content, file.encoding === "base64" ? "base64" : "utf8"),
    content_digest: createHash("sha256").update(file.content).digest("hex") })) })) };
}
export function characterBrowserPreview<T extends CharacterContent | CharacterDraft>(value: T) {
  return value.import_snapshot ? { ...value, import_snapshot: characterSnapshotPreview(value.import_snapshot) } : value;
}
export function characterFilePreview(snapshot: CharacterImportSnapshot | undefined, input: Record<string, unknown>) {
  const file = snapshot?.skills.find(skill => skill.id === input.skill_id)?.files.find(file => file.path === input.path);
  if (!file) throw new Error("该技能文件不在所选快照中");
  return file.encoding === "utf8" ? file : { path: file.path, encoding: file.encoding, bytes: Buffer.byteLength(file.content, "base64") };
}
