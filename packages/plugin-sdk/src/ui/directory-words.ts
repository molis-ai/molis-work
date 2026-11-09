import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { TextRef, UiLocalePack, UiMessage } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PluginConnectionServiceDeclaration, PluginConnectionWord } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { localeMessageArguments, type LocaleSetProblem } from "./locale-pack.js";
import { tryOwnedTextRef } from "./text-ref.js";

type NameFields = Pick<PluginManifest, "plugin_id" | "name_text" | "summary_text" | "connection_services">;
export type DirectoryWordManifest = NameFields & { readonly ui?: Pick<PluginManifest["ui"], "locales" | "views"> };

const fields = (manifest: DirectoryWordManifest) => [
  ["name_text", manifest.name_text, 80],
  ["summary_text", manifest.summary_text, 120],
  ...(manifest.ui?.views ?? []).flatMap(view => {
    const place = "视图 " + view.view_id + " 的 ";
    return [
      [place + "title_text", view.title_text, 80],
      [place + "creates.title_text", view.creates?.title_text, 40],
      [place + "start.title_text", view.start?.title_text, 80],
      [place + "start.hint_text", view.start?.hint_text, 200],
    ] as const;
  }),
] satisfies ReadonlyArray<readonly [string, TextRef | undefined, number]>;

const oneLine = (value: string, limit: number) => value.trim() !== "" && value === value.trim()
  && !/[\u0000-\u001f\u007f]/u.test(value) && [...value].length <= limit;

export function directoryWordProblems(manifest: PluginManifest): string[] {
  const problems: string[] = [];
  if (manifest.summary_text !== undefined && manifest.summary === undefined) problems.push("summary_text 须同时保留 summary 原文");
  for (const [field, input, limit] of fields(manifest)) {
    if (input === undefined) continue;
    const ref = tryOwnedTextRef(input, manifest.plugin_id);
    if (!ref) problems.push(`${field} 必须是本插件的键、通用键或原文`);
    else if ("literal" in ref) {
      if (!oneLine(ref.literal, limit)) problems.push(`${field} 必须为一行，不超过 ${limit} 字`);
    } else if (ref.args !== undefined || ref.fallback !== undefined) problems.push(`${field} 不接收参数或另一份后备文字`);
    else if (!ref.key.startsWith("common.") && !manifest.ui.locales) problems.push(`${field} 引用本插件的词须声明 ui.locales`);
  }
  return problems;
}

/** Directory labels are fixed lines: they have no values to format, even when a pack supplied a valid plural. */
export function staticUiMessage(value: UiMessage | undefined): string | null {
  return typeof value === "string" && localeMessageArguments(value).length === 0 ? value : null;
}

export function directoryPackProblems(manifest: DirectoryWordManifest, pack: UiLocalePack, file: string, sharedDefault?: string): readonly LocaleSetProblem[] {
  const ordinary = fields(manifest).flatMap(([field, ref, limit]) => {
    if (ref === undefined || !("key" in ref) || !Object.hasOwn(pack.messages, ref.key)) return [];
    const value = staticUiMessage(pack.messages[ref.key]);
    return value !== null && oneLine(value, limit) ? [] : [{
      file, locale: pack.locale, key: ref.key, code: "ui.locale_directory_word", reason: `${field} 只能取一行不超过 ${limit} 字的无参短句`,
      fix: "在语言文件里给它写完整短句，不含参数或复数", blocking: true,
    }];
  });
  const connector = (manifest.connection_services ?? []).flatMap(connectionFields).flatMap(([field, ref]) => {
    if (!ref || typeof ref !== "object" || !("key" in ref)) return [];
    const shared = ref.key.startsWith("common.");
    if (shared ? sharedDefault === undefined : pack.owner !== manifest.plugin_id) return [];
    const own = Object.hasOwn(pack.messages, ref.key);
    if (!own && pack.locale !== (shared ? sharedDefault : manifest.ui?.locales?.default)) return [];
    if (own && staticUiMessage(pack.messages[ref.key]) !== null) return [];
    return [{ file, locale: pack.locale, key: ref.key, code: "ui.locale_connector_word",
      reason: `${field} 要取本插件无参短句，默认语言不能缺词`, fix: "在默认语言文件里声明这条短句；不写参数或复数", blocking: true }];
  });
  return [...ordinary, ...connector];
}

function connectionFields(service: PluginConnectionServiceDeclaration): readonly (readonly [string, PluginConnectionWord | undefined])[] {
  const at = `连接服务 ${service.service_id} 的 `;
  return [
    [at + "title", service.title], [at + "summary", service.summary], [at + "auth_help", service.auth_help],
    [at + "outbound_note", service.outbound_note], ...service.capabilities.map(item => [at + "capability label", item.label] as const),
    ...(service.setup_links ?? []).map(link => [at + "link label", link.label] as const),
    ...service.auth.methods.flatMap(method => method.kind === "token"
      ? [[at + "token label", method.label] as const, [at + "token placeholder", method.placeholder] as const]
      : method.kind === "oauth" ? [[at + "oauth note", method.note] as const, ...(method.settings ?? []).flatMap(setting =>
        [[at + setting.key + " label", setting.label] as const, [at + setting.key + " placeholder", setting.placeholder] as const])] : []),
  ];
}
