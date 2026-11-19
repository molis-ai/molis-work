import type { SkillAvailability } from "@molis-ai/molis-work-contracts/services/skills";
import { homeConnectorDirectory } from "../connector-directory.js";
import { listConnectorConnectionViews } from "../connector-connection-views.js";

/**
 * A skill's connector categories against the person's connections (specs/assistant-service-connections §13.7, ASC-38～40). A service
 * says which kinds of work it stands in for (`categories` on its declaration, the same words a skill's `connector_categories` takes);
 * a skill is usable when every category it declares has a connected, enabled account. Its body names a category as a placeholder,
 * `~~project tracker` for `project-tracker` (case aside, a space or `_` for a hyphen); before the body reaches a model each declared
 * placeholder becomes the account it will use, or — with several — the candidates, and the model is asked to ask the person once and
 * keep that one for this work. Nothing names a vendor here, and a category with no account is never filled with another kind.
 */
export interface CategoryAccount {
  readonly service_id: string;
  readonly service_title: string;
  readonly connection_id: string;
  readonly account_label: string | null;
}

/** Every declared category with the accounts that can stand in for it now, in the directory's order. */
export type CategoryAccounts = ReadonlyMap<string, readonly CategoryAccount[]>;

export async function homeCategoryAccounts(home: string): Promise<CategoryAccounts> {
  const directory = (await homeConnectorDirectory(home)).filter(entry => entry.categories?.length);
  if (!directory.length) return new Map();
  const connections = listConnectorConnectionViews(home).filter(row => row.enabled && row.state === "connected");
  const accounts = new Map<string, CategoryAccount[]>();
  for (const entry of directory) {
    const live = connections.filter(row => row.service_id === entry.connector_id);
    for (const category of entry.categories ?? []) {
      const list = accounts.get(category) ?? [];
      list.push(...live.map(row => ({ service_id: entry.connector_id, service_title: entry.title, connection_id: row.connection_id, account_label: row.account_label ?? null })));
      accounts.set(category, list);
    }
  }
  return accounts;
}

/** Unavailable with the categories that have no account (ASC-38), or null when every declared category has one. */
export function categoryAvailability(declared: readonly string[], accounts: CategoryAccounts): Extract<SkillAvailability, { available: false }> | null {
  const missing = declared.filter(category => !accounts.get(category)?.length);
  return missing.length ? { available: false, reason: "connection_missing", detail: missing.join(", ") } : null;
}

const name = (account: CategoryAccount) => account.account_label ? `${account.service_title} · ${account.account_label}` : account.service_title;

function placeholder(category: string): RegExp {
  const words = category.split("-").map(word => word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  return new RegExp(`~~${words.join("[ _-]")}(?![A-Za-z0-9])`, "giu");
}

/**
 * The body as the model reads it: each declared category's placeholder filled, and a closing note when a category has several accounts
 * (ask once, keep it for this work, do not mix them) or to say which service and account to name in the result (ASC-40). Categories the
 * skill does not declare are left as written. The note is in the reader's language; the body stays as the author wrote it otherwise.
 */
export function resolveCategoryPlaceholders(body: string, declared: readonly string[], accounts: CategoryAccounts, locale: string | undefined): string {
  if (!declared.length) return body;
  const zh = !locale || locale.toLowerCase().startsWith("zh");
  const sep = zh ? "、" : ", ";
  let text = body;
  const lines: string[] = [];
  // Longer categories first, so `project-tracker` is not read as `project` when both are declared.
  for (const category of [...declared].sort((a, b) => b.length - a.length)) {
    const found = accounts.get(category) ?? [];
    if (!found.length) continue;
    if (found.length === 1) {
      text = text.replace(placeholder(category), name(found[0]!));
      lines.push(zh ? `「${category}」用 ${name(found[0]!)}。` : `“${category}” uses ${name(found[0]!)}.`);
    } else {
      const choices = found.map(name).join(sep);
      text = text.replace(placeholder(category), zh ? `${category}（候选：${choices}）` : `${category} (one of: ${choices})`);
      lines.push(zh
        ? `「${category}」有几个已连上的账号：${choices}。用到之前问用户一次用哪一个，这次工作只用它，不混用、不合并。`
        : `“${category}” has several connected accounts: ${choices}. Before using one, ask the person once which to use, and use only that one for this work; do not mix or merge them.`);
    }
  }
  if (!lines.length) return text;
  const close = zh ? "结果里写明实际用的服务和账号。" : "Name the service and account actually used in the result.";
  return `${text}\n\n---\n${zh ? "连接（Molis Work 给出）：" : "Connections (from Molis Work):"}\n${lines.map(line => `- ${line}`).join("\n")}\n- ${close}\n`;
}
