import { TEXT_REF_LIMITS } from "@molis-ai/molis-work-contracts/platform/ui";

/** `owner.area.name`: lower-case segments, 2 to 5 of them. */
export const STABLE_KEY = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9_-]*){1,4}$/u;
/** The owner segment shared words use (`common.save`); no Plugin takes it. */
export const SHARED_OWNER = "common";

/** The name a Plugin's keys start with: the last segment of its plugin_id (`io.molis.work.text-stats` -> `text-stats`). */
export const messageOwnerOf = (pluginId: string): string => pluginId.slice(pluginId.lastIndexOf(".") + 1);

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
  if (name === SHARED_OWNER) return `plugin_id ${owner.slice(0, 80)} 最后一段是 ${SHARED_OWNER}，键会以 ${SHARED_OWNER} 开头，而 ${SHARED_OWNER} 留给通用词；把最后一段换一个名字`;
  if (name.length > LONGEST_KEY_OWNER) return `plugin_id 最后一段长 ${name.length} 个字符，超过 ${LONGEST_KEY_OWNER}：键最长 ${TEXT_REF_LIMITS.key} 个字符，写不下；把最后一段改短`;
  if (!STABLE_KEY.test(`${name}.x`)) return `主人 ${owner.slice(0, 80)} 的最后一段 ${name.slice(0, 40)} 不能当键的第一段：要以小写字母开头，只含小写字母、数字和连字符`;
  return null;
}
