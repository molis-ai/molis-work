import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";

export type CliLocale = "zh" | "en" | "ja";
export type CliTextFn = (key: string, values?: Readonly<Record<string, string | number>>) => string;

const CLI_LOCALES: readonly CliLocale[] = ["zh", "en", "ja"];
const cliTextStore = new AsyncLocalStorage<CliTextFn>();

/** Minimal standalone fallback for the 9 keys used directly by `@molis-ai/molis-work-app-cli` when invoked without Local Host. */
const CLI_CORE_TEXT: Readonly<Record<CliLocale, Readonly<Record<string, string>>>> = {
  zh: {
    "workbench.cli.help-commands": "Molis Work 命令：{commands}",
    "workbench.cli.unknown-command": "未知命令：{command}。可用：{commands}。",
    "workbench.cli.error-prefix": "错误: {message}",
    "workbench.cli.v1-summary": "已注册插件的项目审批管理入口。",
    "workbench.cli.v1-operations": "可用操作：",
    "workbench.cli.v1-db-note": "复杂输入可用 --file payload.json 代替 --json。必须传入 --db PATH 指定已有项目库；没有默认路径，不传不打开。",
    "workbench.cli.v1-install-hint": "安装 Molis Work 本体：{command}",
    "workbench.cli.v1-scope-mismatch": "请求不属于当前项目",
    "workbench.cli.v1-unknown-op": "未知 V1 operation: {operation}",
  },
  en: {
    "workbench.cli.help-commands": "Molis Work commands: {commands}",
    "workbench.cli.unknown-command": "Unknown command: {command}. Available: {commands}.",
    "workbench.cli.error-prefix": "Error: {message}",
    "workbench.cli.v1-summary": "Management entry for project approvals from registered plugins.",
    "workbench.cli.v1-operations": "Operations:",
    "workbench.cli.v1-db-note": "Use --file payload.json instead of --json for complex payloads. --db PATH is required for an existing project SQLite file; there is no default path.",
    "workbench.cli.v1-install-hint": "Install Molis Work itself: {command}",
    "workbench.cli.v1-scope-mismatch": "Request does not belong to the current project.",
    "workbench.cli.v1-unknown-op": "Unknown V1 operation: {operation}",
  },
  ja: {
    "workbench.cli.help-commands": "Molis Work コマンド：{commands}",
    "workbench.cli.unknown-command": "不明なコマンドです：{command}。利用可能：{commands}。",
    "workbench.cli.error-prefix": "エラー: {message}",
    "workbench.cli.v1-summary": "登録済みプラグインのプロジェクト承認管理エントリーです。",
    "workbench.cli.v1-operations": "利用可能な操作：",
    "workbench.cli.v1-db-note": "複雑な入力は --json の代わりに --file payload.json を使えます。既存プロジェクト SQLite を示す --db PATH が必須で、既定パスはありません。",
    "workbench.cli.v1-install-hint": "Molis Work 本体のインストール：{command}",
    "workbench.cli.v1-scope-mismatch": "リクエストは現在のプロジェクトに属していません。",
    "workbench.cli.v1-unknown-op": "不明な V1 操作です：{operation}",
  },
};

export function parseCliLocale(raw: string | undefined | null): CliLocale | null {
  if (!raw) return null;
  const normalized = raw.trim().split(/[.@]/u)[0]?.replaceAll("_", "-").toLowerCase() ?? "";
  if (!normalized || normalized === "c" || normalized === "posix") return null;
  const base = normalized.split("-")[0];
  return CLI_LOCALES.find(tag => tag === base) ?? null;
}

export function resolveEnvCliLocale(env: Readonly<Record<string, string | undefined>> = process.env): CliLocale | null {
  return parseCliLocale(env.MOLIS_WORK_LOCALE) ?? parseCliLocale(env.LC_ALL) ?? parseCliLocale(env.LANG);
}

export function withCliText<T>(say: CliTextFn, run: () => T): T {
  return cliTextStore.run(say, run);
}

export function hasCliText(): boolean {
  return cliTextStore.getStore() !== undefined;
}

function formatFallback(template: string, values?: Readonly<Record<string, string | number>>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/gu, (whole, name: string) => Object.hasOwn(values, name) ? String(values[name]) : whole);
}

export function cliText(key: string, values?: Readonly<Record<string, string | number>>): string {
  const active = cliTextStore.getStore();
  if (active) return active(key, values);
  const locale = resolveEnvCliLocale() ?? "zh";
  const template = CLI_CORE_TEXT[locale][key] ?? CLI_CORE_TEXT.zh[key] ?? key;
  return formatFallback(template, values);
}

export function cliFlagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/** CLI input is decoded once here; application owners validate business payloads. */
export function readCliJsonPayload(args: string[]): Record<string, unknown> {
  const inline = cliFlagValue(args, "--json");
  const file = cliFlagValue(args, "--file");
  if (inline) return JSON.parse(inline) as Record<string, unknown>;
  if (file) return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  return {};
}

export function printCliJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/** One line of a command's text output, for the commands other packages run (`molis-work install`, `demo`, `uninstall`, …). */
export function printCliLine(text: string): void {
  console.log(text);
}

export function printV1Help(): void {
  console.log(`molis-work v1 <operation> --db PATH --json '{...}'

${cliText("workbench.cli.v1-summary")}

${cliText("workbench.cli.v1-operations")}
  review-request | review-decide

${cliText("workbench.cli.v1-db-note")}`);
  console.log(`\n${cliText("workbench.cli.v1-install-hint", { command: "molis-work install [--home PATH]" })}`);
}
