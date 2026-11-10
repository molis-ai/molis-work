import type { PluginMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { PluginTextReader } from "@molis-ai/molis-work-app-workbench";
import { localeMessageArguments, textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";

const FIELDS = ["name", "description", "when_to_use", "when_not_to_use"] as const;
export type SkillDisplayWords = Pick<PluginMethodDeclaration, (typeof FIELDS)[number]>;

/** The caller supplies the reader for this exact registration or verified package. Optional keys only project fields it declares. */
export function skillDisplayWords(declaration: PluginMethodDeclaration, reader: PluginTextReader | null, locale: string | null): SkillDisplayWords {
  if (!reader) return declaration;
  const selected = locale === null ? null : reader.pack(locale);
  const fallback = reader.pack(reader.default);
  const projected: SkillDisplayWords = { ...declaration };
  for (const field of FIELDS) {
    if (declaration[field] === undefined) continue;
    const key = `${textKeyPrefix(reader.owner)}.skill.${declaration.skill_id}.${field.replaceAll("_", "-")}`;
    const message = selected?.messages[key] ?? fallback?.messages[key];
    if (typeof message === "string" && localeMessageArguments(message).length === 0) projected[field] = message;
  }
  return projected;
}
