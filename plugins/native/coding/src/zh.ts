import { CODING_MESSAGES } from "./messages.js";

/**
 * A key's Chinese wording with its `{name}` values filled in: the translator for words that stay Chinese data — the
 * run report and the Agent's context — where a page would pass its own `L`.
 */
export const codingZh = (key: string, values: Record<string, string | number> = {}): string =>
  ((CODING_MESSAGES as Record<string, { zh: string }>)[key]?.zh ?? key).replace(/\{(\w+)\}/g, (all, name: string) => name in values ? String(values[name]) : all);
