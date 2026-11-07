import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { TEXT_REF_LIMITS } from "@molis-ai/molis-work-contracts/platform/ui";

// Checks of `ui.messages` and `ui.translations` (PG-071). The Host and the author's tooling share this one list, so a word
// a Plugin declares is accepted or refused by the same rule in both. The keys of every installed Plugin meet in one page,
// so a Plugin's keys start with its own name (the last segment of its plugin_id), which keeps them out of another Plugin's
// and the Host's; that no two installed Plugins declare one key is still the Host's, when it reads the Manifests.

/** `owner.area.name`: lower-case segments, 2 to 5 of them. */
export const STABLE_KEY = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9_-]*){1,4}$/u;
const PLACEHOLDER = /\{([A-Za-z_]\w*)\}/gu;
const HAN = /\p{Script=Han}/u;
/** The owner segment shared words use (`common.save`); no Plugin takes it. */
export const SHARED_OWNER = "common";

/** The name a Plugin's keys start with: the last segment of its plugin_id (`io.molis.work.text-stats` -> `text-stats`). */
export const messageOwnerOf = (pluginId: string): string => pluginId.slice(pluginId.lastIndexOf(".") + 1);

export const PLUGIN_MESSAGE_LIMITS = { entries: 5000, keyLength: TEXT_REF_LIMITS.key, textLength: TEXT_REF_LIMITS.literal } as const;

/** The platform's own owner of words: `common.*` is bound to it, so a shared word has one owner and a reference to it says so. */
export const PLATFORM_TEXT_OWNER = "workbench";
/** A key is at least `<name>.x`, and has to fit `TEXT_REF_LIMITS.key`. */
const LONGEST_KEY_OWNER = TEXT_REF_LIMITS.key - 2;

/**
 * Why no key can ever be written for this owner, or `null` when one can. A Manifest only promises that the last segment of a plugin_id can start
 * a key, not that it leaves room for the rest of it, so a language pack and a binding both say so here rather than refusing every key one by one.
 */
export function keyOwnerProblem(owner: string): string | null {
  const name = messageOwnerOf(owner);
  if (name === SHARED_OWNER) return `主人 ${owner.slice(0, 80)} 的键要以 ${SHARED_OWNER} 开头，${SHARED_OWNER} 留给通用词；把 plugin_id 最后一段换一个名字`;
  if (name.length > LONGEST_KEY_OWNER) return `plugin_id 最后一段长 ${name.length} 个字符，超过 ${LONGEST_KEY_OWNER}：键最长 ${TEXT_REF_LIMITS.key} 个字符，写不下；把最后一段改短`;
  if (!STABLE_KEY.test(`${name}.x`)) return `主人 ${owner.slice(0, 80)} 的最后一段 ${name.slice(0, 40)} 不能当键的第一段：要以小写字母开头，只含小写字母、数字和连字符`;
  return null;
}

const placeholdersOf = (text: string): string => [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort().join(",");

function messageProblems(messages: unknown, owner: string): string[] {
  if (messages === null || typeof messages !== "object" || Array.isArray(messages)) return ["ui.messages 必须为对象"];
  const entries = Object.entries(messages);
  const problems: string[] = [];
  if (entries.length > PLUGIN_MESSAGE_LIMITS.entries) problems.push(`ui.messages 最多 ${PLUGIN_MESSAGE_LIMITS.entries} 条`);
  for (const [key, value] of entries.slice(0, PLUGIN_MESSAGE_LIMITS.entries)) {
    if (key.length > PLUGIN_MESSAGE_LIMITS.keyLength || !STABLE_KEY.test(key)) {
      problems.push(`ui.messages 的键 ${key.slice(0, 40)} 必须是 <主人>.<区域>.<名称>（小写，2～5 段）`);
      continue;
    }
    if (owner === SHARED_OWNER || !key.startsWith(`${owner}.`)) {
      problems.push(`ui.messages 的键 ${key} 必须以插件自己的名字「${owner}」开头${owner === SHARED_OWNER ? `（${SHARED_OWNER} 留给通用词）` : ""}`);
      continue;
    }
    const body = value as { zh?: unknown; en?: unknown } | null;
    const { zh, en } = body !== null && typeof body === "object" ? body : {};
    if (typeof zh !== "string" || typeof en !== "string" || zh === "" || en === "") problems.push(`ui.messages.${key} 需要非空的 zh 与 en`);
    else if (zh.length > PLUGIN_MESSAGE_LIMITS.textLength || en.length > PLUGIN_MESSAGE_LIMITS.textLength) problems.push(`ui.messages.${key} 的文字最长 ${PLUGIN_MESSAGE_LIMITS.textLength} 字`);
    else if (placeholdersOf(zh) !== placeholdersOf(en)) problems.push(`ui.messages.${key} 的 zh 与 en 用了不同的 {占位符}`);
    else if (HAN.test(en)) problems.push(`ui.messages.${key} 的 en 里还有中文`);
  }
  return problems;
}

function translationProblems(translations: unknown): string[] {
  if (translations === null || typeof translations !== "object" || Array.isArray(translations)) return ["ui.translations 必须为对象"];
  const entries = Object.entries(translations);
  const problems: string[] = [];
  if (entries.length > PLUGIN_MESSAGE_LIMITS.entries) problems.push(`ui.translations 最多 ${PLUGIN_MESSAGE_LIMITS.entries} 条`);
  for (const [source, english] of entries.slice(0, PLUGIN_MESSAGE_LIMITS.entries)) {
    if (source === "" || source.length > PLUGIN_MESSAGE_LIMITS.textLength) problems.push(`ui.translations 的原文 ${source.slice(0, 40)} 不能为空或超过 ${PLUGIN_MESSAGE_LIMITS.textLength} 字`);
    else if (typeof english !== "string" || english === "" || english.length > PLUGIN_MESSAGE_LIMITS.textLength) problems.push(`ui.translations.${source.slice(0, 40)} 需要非空的英文`);
  }
  return problems;
}

/** What is wrong with the words a Manifest's `ui` brings; empty when it brings none or they are sound. */
export function messageDeclarationProblems(parsed: Pick<PluginManifest, "plugin_id" | "ui">): string[] {
  return [
    ...(parsed.ui.messages === undefined ? [] : messageProblems(parsed.ui.messages, messageOwnerOf(parsed.plugin_id))),
    ...(parsed.ui.translations === undefined ? [] : translationProblems(parsed.ui.translations)),
  ];
}
