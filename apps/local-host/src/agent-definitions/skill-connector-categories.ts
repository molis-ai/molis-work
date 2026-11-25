import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
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

interface WorkConnections {
  chosen(category: string): string | null;
  used(category: string): void;
}
const workConnections = new AsyncLocalStorage<WorkConnections>();
export const withWorkSkillConnections = <T>(work: WorkConnections, read: () => T): T => workConnections.run(work, read);

export async function homeCategoryAccounts(home: string): Promise<CategoryAccounts> {
  const directory = (await homeConnectorDirectory(home)).filter(entry => entry.categories?.length);
  if (!directory.length) return new Map();
  const connections = listConnectorConnectionViews(home).filter(row => row.enabled && row.state === "connected");
  const accounts = new Map<string, CategoryAccount[]>();
  for (const entry of directory) {
    const live = connections.filter(row => row.service_id === entry.connector_id);
    for (const category of entry.categories ?? []) {
      const list = accounts.get(category) ?? [];
      list.push(...live.map(row => ({ service_id: entry.connector_id, service_title: entry.title, connection_id: row.connection_id,
        account_label: row.display_name !== entry.title && row.display_name !== row.service_id ? row.display_name : row.account_label ?? null })));
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

// Prologue's question IDs take at most 32 lowercase letters, digits and underscores.
export const isAccountQuestionId = (id: string | undefined): boolean => id !== undefined && /^connection_[a-f0-9]{20}$/u.test(id);
/** Keep the question tied to the exact live candidates the person is shown, including their labels. */
export function accountQuestion(category: string, accounts: readonly CategoryAccount[]) {
  const ordered = [...accounts].sort((left, right) => left.connection_id.localeCompare(right.connection_id));
  const names = ordered.map(name);
  const choices = ordered.map((row, index) => ({ connection_id: row.connection_id,
    label: names.indexOf(names[index]!) === names.lastIndexOf(names[index]!) ? names[index]! : `${names[index]} · ${index + 1}` }));
  const revision = createHash("sha256").update(JSON.stringify([category, choices])).digest("hex").slice(0, 20);
  return { id: `connection_${revision}`, choices };
}

function placeholder(category: string): RegExp {
  const words = category.split("-").map(word => word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  return new RegExp(`~~${words.join("[ _-]")}(?![A-Za-z0-9])`, "giu");
}

const CATEGORY_NOTE_COPY = {
  zh: {
    sep: "、",
    single: (category: string, account: string, id: string) => `「${category}」用 ${account}（连接 ID：${id}）。`,
    candidateTag: (category: string, choices: string) => `${category}（候选：${choices}）`,
    multiple: (category: string, choices: string) => `「${category}」有几个已连上的账号：${choices}。用到之前问用户一次用哪一个，这次工作只用它，不混用、不合并。`,
    question: (id: string, options: string) => `请在独立的 ask-user 问卷中提交一道必答单选题，id 用 ${id}。以下各选项按顺序使用 label，选择后用对应连接 ID：${options}。原账号失效时重新选择。`,
    readParam: (category: string) => `调用 connectors.records.read 时，connector_category 用 ${category}。`,
    heading: "连接（Molis Work 给出）：",
    close: "结果里写明实际用的服务和账号。",
  },
  en: {
    sep: ", ",
    single: (category: string, account: string, id: string) => `“${category}” uses ${account} (connection ID: ${id}).`,
    candidateTag: (category: string, choices: string) => `${category} (one of: ${choices})`,
    multiple: (category: string, choices: string) => `“${category}” has several connected accounts: ${choices}. Before using one, ask the person once which to use, and use only that one for this work; do not mix or merge them.`,
    question: (id: string, options: string) => `Call ask-user with a questionnaire containing only one required single-choice question with id ${id}. Use these exact labels in order and use the matching connection ID: ${options}. Ask again if their former account is no longer available.`,
    readParam: (category: string) => `On connectors.records.read, set connector_category to ${category}.`,
    heading: "Connections (from Molis Work):",
    close: "Name the service and account actually used in the result.",
  },
  ja: {
    sep: "、",
    single: (category: string, account: string, id: string) => `「${category}」は ${account}（接続 ID：${id}）を使用します。`,
    candidateTag: (category: string, choices: string) => `${category}（候補：${choices}）`,
    multiple: (category: string, choices: string) => `「${category}」には複数の接続済みアカウントがあります：${choices}。使う前にどちらを使うかユーザーに一度確認し、このワークではその1つだけを使い、混用・統合しないでください。`,
    question: (id: string, options: string) => `独立した ask-user アンケートで、id が ${id} の必須単一選択質問を1問だけ送信してください。次の選択肢の label を順番通りに使用し、選ばれた対応する接続 ID を使ってください：${options}。元のアカウントが無効になった場合は再確認してください。`,
    readParam: (category: string) => `connectors.records.read を呼び出す際は、connector_category に ${category} を設定してください。`,
    heading: "接続（Molis Work 提供）：",
    close: "結果には実際に使用したサービスとアカウントを明記してください。",
  },
} as const;

function noteCopyFor(locale: string | undefined) {
  const base = locale?.trim().toLowerCase().split("-")[0];
  if (!base || base === "zh") return CATEGORY_NOTE_COPY.zh;
  if (base === "ja") return CATEGORY_NOTE_COPY.ja;
  return CATEGORY_NOTE_COPY.en;
}

/**
 * The body as the model reads it: each declared category's placeholder filled, and a closing note when a category has several accounts
 * (ask once, keep it for this work, do not mix them) or to say which service and account to name in the result (ASC-40). Categories the
 * skill does not declare are left as written. The note is in the reader's language; the body stays as the author wrote it otherwise.
 */
export function resolveCategoryPlaceholders(body: string, declared: readonly string[], accounts: CategoryAccounts, locale: string | undefined): string {
  if (!declared.length) return body;
  const copy = noteCopyFor(locale);
  const work = workConnections.getStore();
  let text = body;
  const lines: string[] = [];
  // Longer categories first, so `project-tracker` is not read as `project` when both are declared.
  for (const category of [...declared].sort((a, b) => b.length - a.length)) {
    const found = accounts.get(category) ?? [];
    if (!found.length) continue;
    work?.used(category);
    const chosen = work?.chosen(category);
    const selected = chosen ? found.find(account => account.connection_id === chosen) : found.length === 1 ? found[0] : undefined;
    if (selected) {
      text = text.replace(placeholder(category), () => name(selected));
      lines.push(copy.single(category, name(selected), selected.connection_id));
    } else {
      const choices = found.map(name).join(copy.sep);
      text = text.replace(placeholder(category), () => copy.candidateTag(category, choices));
      lines.push(copy.multiple(category, choices));
      if (work) {
        const question = accountQuestion(category, found);
        const options = JSON.stringify(question.choices);
        lines.push(copy.question(question.id, options));
      }
    }
    if (work) lines.push(copy.readParam(category));
  }
  if (!lines.length) return text;
  return `${text}\n\n---\n${copy.heading}\n${lines.map(line => `- ${line}`).join("\n")}\n- ${copy.close}\n`;
}
