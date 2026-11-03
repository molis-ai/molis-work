import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

// Checks of `ui.messages` and `ui.translations` (PG-071). The Host and the author's tooling share this one list, so a word
// a Plugin declares is accepted or refused by the same rule in both. The keys of every installed Plugin meet in one page,
// so a Plugin's keys start with its own name (the last segment of its plugin_id), which keeps them out of another Plugin's
// and the Host's; that no two installed Plugins declare one key is still the Host's, when it reads the Manifests.

/** `owner.area.name`: lower-case segments, 2 to 5 of them. */
const STABLE_KEY = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9_-]*){1,4}$/u;
const PLACEHOLDER = /\{([A-Za-z_]\w*)\}/gu;
const HAN = /\p{Script=Han}/u;
/** The owner segment shared words use (`common.save`); no Plugin takes it. */
const SHARED_OWNER = "common";

/** The name a Plugin's keys start with: the last segment of its plugin_id (`io.molis.work.text-stats` -> `text-stats`). */
const messageOwnerOf = (pluginId: string): string => pluginId.slice(pluginId.lastIndexOf(".") + 1);

export const PLUGIN_MESSAGE_LIMITS = { entries: 5000, keyLength: 120, textLength: 2000 } as const;

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
