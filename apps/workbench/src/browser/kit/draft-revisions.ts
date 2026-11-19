import type { SkillDraft } from "@molis-ai/molis-work-contracts/services/skills";
import { fieldsOf, sentFields, type Fields } from "./drafts.js";

type Content = { fields: Fields; replacements: Record<string, string> };
export type DraftChoice = "mine" | "saved";

const ordinary = ["name", "applies_to", "argument_hint"] as const;
const wording = ["description", "when_not_to_use", "body"] as const;
const sameReplacements = (left: Content["replacements"], right: Content["replacements"]) =>
  Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([key, value]) => Object.hasOwn(right, key) && right[key] === value);

export function isDraftDirty(draft: SkillDraft, local: Content): boolean {
  const base = fieldsOf(draft.fields), typed = fieldsOf(sentFields(local.fields));
  return [...ordinary, ...wording].some(key => base[key] !== typed[key]) || !sameReplacements(draft.replacements, local.replacements);
}

/** A placeholder and the wording it changed form one edit. Combining their halves could save a false replacement. */
export function mergeDraftRevision(base: SkillDraft, local: Content, latest: SkillDraft, choice?: DraftChoice): Content & { conflict: boolean } {
  const original = fieldsOf(base.fields), saved = fieldsOf(latest.fields), typed = fieldsOf(sentFields(local.fields));
  const fields = { ...local.fields };
  let conflict = false, replacements = local.replacements;
  const useSaved = (mineChanged: boolean, savedChanged: boolean, same: boolean): boolean => {
    if (!savedChanged || same) return false;
    if (!mineChanged) return true;
    conflict = true;
    return choice === "saved";
  };
  const mergeField = <Key extends keyof Fields>(key: Key) => {
    if (useSaved(typed[key] !== original[key], saved[key] !== original[key], typed[key] === saved[key])) fields[key] = saved[key];
  };
  ordinary.forEach(mergeField);
  const mineReplaced = !sameReplacements(local.replacements, base.replacements);
  const savedReplaced = !sameReplacements(latest.replacements, base.replacements);
  if (mineReplaced || savedReplaced) {
    const same = sameReplacements(local.replacements, latest.replacements) && wording.every(key => typed[key] === saved[key]);
    if (useSaved(mineReplaced || wording.some(key => typed[key] !== original[key]),
      savedReplaced || wording.some(key => saved[key] !== original[key]), same)) {
      for (const key of wording) fields[key] = saved[key];
      replacements = latest.replacements;
    }
  } else wording.forEach(mergeField);
  return { fields, replacements, conflict };
}
