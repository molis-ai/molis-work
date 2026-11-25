import { projectDeletionLine } from "../project-rows-declarations.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { TextRef, UiLocalePack, UiMessage } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PluginConnectionServiceDeclaration, PluginConnectionWord } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { localeMessageArguments, type LocaleSetProblem } from "./locale-pack.js";
import { tryOwnedTextRef } from "./text-ref.js";

type NameFields = Pick<PluginManifest, "plugin_id" | "name_text" | "summary_text" | "connection_services" | "databases"> & {
  readonly permissions?: PluginManifest["permissions"];
  readonly read_groups?: PluginManifest["read_groups"];
  readonly actions?: PluginManifest["actions"];
  readonly overview_projection?: PluginManifest["overview_projection"];
};
export type DirectoryWordManifest = NameFields & {
  readonly ui?: Pick<PluginManifest["ui"], "locales" | "views">;
  readonly artifacts?: Pick<PluginManifest["artifacts"], "produces">;
};

export const DIRECTORY_WORD_LIMITS = {
  permissionReason: 200,
  readGroupTitle: 80,
  readGroupDescription: 200,
  actionTitle: 80,
  actionDescription: 400,
} as const;

const fields = (manifest: DirectoryWordManifest) => [
  ["name_text", manifest.name_text, 80],
  ["summary_text", manifest.summary_text, 120],
  ...(manifest.ui?.views ?? []).flatMap(view => {
    const place = "视图 " + view.view_id + " 的 ";
    return [
      [place + "title_text", view.title_text, 80],
    ] as const;
  }),
  ...(manifest.actions ?? []).flatMap(({ action, capability_id }) => {
    const intake = action.intake as { title_text?: TextRef; start?: { title_text?: TextRef; hint_text?: TextRef } } | undefined;
    const place = "动作 " + capability_id + " 的 intake.";
    return intake ? [[place + "title_text", intake.title_text, 40], [place + "start.title_text", intake.start?.title_text, 80], [place + "start.hint_text", intake.start?.hint_text, 200]] as const : [];
  }),
  ...(manifest.actions ?? []).flatMap(({ action, capability_id }) => action.composer_source?.title_text === undefined ? []
    : [["动作 " + capability_id + " 的 composer_source.title_text", action.composer_source.title_text, 80] as const]),
] satisfies ReadonlyArray<readonly [string, TextRef | undefined, number]>;

const localizedDeclarationFields = (manifest: DirectoryWordManifest) => [
  ...(manifest.permissions ?? []).flatMap(({ permission, reason_text }) =>
    reason_text === undefined ? [] : [[`权限 ${permission} 的 reason_text`, reason_text, DIRECTORY_WORD_LIMITS.permissionReason] as const]),
  ...(manifest.read_groups ?? []).flatMap(({ group_id, title_text, description_text }) => [
    ...(title_text === undefined ? [] : [[`读取分组 ${group_id} 的 title_text`, title_text, DIRECTORY_WORD_LIMITS.readGroupTitle] as const]),
    ...(description_text === undefined ? [] : [[`读取分组 ${group_id} 的 description_text`, description_text, DIRECTORY_WORD_LIMITS.readGroupDescription] as const]),
  ]),
  ...(manifest.actions ?? []).flatMap(({ capability_id, action }) => [
    ...(action.title_text === undefined ? [] : [[`动作 ${capability_id} 的 title_text`, action.title_text, DIRECTORY_WORD_LIMITS.actionTitle] as const]),
    ...(action.description_text === undefined ? [] : [[`动作 ${capability_id} 的 description_text`, action.description_text, DIRECTORY_WORD_LIMITS.actionDescription] as const]),
  ]),
  ...(typeof manifest.overview_projection === "object" && manifest.overview_projection !== null && manifest.overview_projection.title_text !== undefined
    ? [["overview_projection.title_text", manifest.overview_projection.title_text, DIRECTORY_WORD_LIMITS.actionTitle] as const] : []),
] satisfies ReadonlyArray<readonly [string, TextRef | undefined, number]>;

const deletionField = "databases.home.project_rows.label";
function deletionRef(manifest: DirectoryWordManifest): TextRef | undefined {
  const label = manifest.databases?.home?.project_rows?.label;
  return typeof label === "object" ? label : undefined;
}

const oneLine = (value: string, limit: number) => value.trim() !== "" && value === value.trim()
  && !/[\u0000-\u001f\u007f]/u.test(value) && [...value].length <= limit;

/** Shared static-line TextRef check for Manifest and sandbox contract localized declaration fields. */
export function staticDirectoryTextRefProblem(field: string, input: unknown, owner: string, limit: number, hasLocales: boolean): string | null {
  const ref = tryOwnedTextRef(input, owner);
  if (!ref) return `${field} 必须是本插件的键、通用键或原文`;
  if ("literal" in ref) return oneLine(ref.literal, limit) ? null : `${field} 必须为一行，不超过 ${limit} 字`;
  if (ref.args !== undefined || ref.fallback !== undefined) return `${field} 不接收参数或另一份后备文字`;
  if (!ref.key.startsWith("common.") && !hasLocales) return `${field} 引用本插件的词须声明 ui.locales`;
  return null;
}

const artifactTitleFields = (manifest: DirectoryWordManifest) => (manifest.artifacts?.produces ?? []).flatMap((type, index) =>
  type.title_text === undefined ? [] : [{ field: `artifacts.produces[${index}].title_text`, input: type.title_text }]);

function artifactTitleProblems(manifest: PluginManifest): string[] {
  return artifactTitleFields(manifest).flatMap(({ field, input }) => {
    const ref = tryOwnedTextRef(input, manifest.plugin_id);
    return ref && "key" in ref && !ref.key.startsWith("common.") && Object.hasOwn(input, "key") && Object.keys(input).length === 1 && manifest.ui.locales
      ? [] : [`${field} 只能写本插件在 ui.locales 声明的无参 { key }`];
  });
}

export function directoryWordProblems(manifest: PluginManifest): string[] {
  const problems = artifactTitleProblems(manifest);
  if (manifest.summary_text !== undefined && manifest.summary === undefined) problems.push("summary_text 须同时保留 summary 原文");
  const hasLocales = Boolean(manifest.ui.locales);
  for (const [field, input, limit] of [...fields(manifest), ...localizedDeclarationFields(manifest)]) {
    if (input === undefined) continue;
    const problem = staticDirectoryTextRefProblem(field, input, manifest.plugin_id, limit, hasLocales);
    if (problem !== null) problems.push(problem);
  }
  const deletion = deletionRef(manifest);
  if (deletion && "key" in deletion && (!tryOwnedTextRef(deletion, manifest.plugin_id) || deletion.key.startsWith("common.") || !manifest.ui.locales)) {
    problems.push(`${deletionField} 须引用本插件在 ui.locales 声明的无参词`);
  }
  return problems;
}

/** Directory labels are fixed lines: they have no values to format, even when a pack supplied a valid plural. */
export function staticUiMessage(value: UiMessage | undefined): string | null {
  return typeof value === "string" && localeMessageArguments(value).length === 0 ? value : null;
}

function artifactTitlePackProblems(manifest: DirectoryWordManifest, pack: UiLocalePack, file: string): LocaleSetProblem[] {
  if (pack.owner !== manifest.plugin_id) return [];
  return artifactTitleFields(manifest).flatMap(({ field, input: { key } }) => {
    const present = Object.hasOwn(pack.messages, key);
    if (!present && pack.locale !== manifest.ui?.locales?.default) return [];
    const value = staticUiMessage(present ? pack.messages[key] : undefined);
    return value !== null && oneLine(value, 80) ? [] : [{
      file, locale: pack.locale, key, code: "ui.locale_directory_word",
      reason: `${field} 要取一行不超过 80 字的无参短句，默认语言不能缺词`,
      fix: "在默认语言文件里声明这条短句；不写参数或复数", blocking: true,
    }];
  });
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
  const declared = localizedDeclarationFields(manifest).flatMap(([field, ref, limit]) => {
    if (ref === undefined || !("key" in ref)) return [];
    const shared = ref.key.startsWith("common.");
    if (shared ? sharedDefault === undefined : pack.owner !== manifest.plugin_id) return [];
    const present = Object.hasOwn(pack.messages, ref.key);
    if (!present && pack.locale !== (shared ? sharedDefault : manifest.ui?.locales?.default)) return [];
    const value = staticUiMessage(present ? pack.messages[ref.key] : undefined);
    return value !== null && oneLine(value, limit) ? [] : [{
      file, locale: pack.locale, key: ref.key, code: "ui.locale_directory_word",
      reason: `${field} 要取一行不超过 ${limit} 字的无参短句，默认语言不能缺词`,
      fix: "在默认语言文件里声明这条短句；不写参数或复数", blocking: true,
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
  const words = [...ordinary, ...declared, ...connector, ...artifactTitlePackProblems(manifest, pack, file)];
  const label = deletionRef(manifest);
  if (label && "key" in label && pack.owner === manifest.plugin_id) {
    const present = Object.hasOwn(pack.messages, label.key), message = staticUiMessage(pack.messages[label.key]);
    if ((present || pack.locale === manifest.ui?.locales?.default) && (message === null || !projectDeletionLine(message))) {
      return [...words, { file, locale: pack.locale, key: label.key, code: "ui.locale_directory_word",
        reason: `${deletionField} 要取一行不超过 200 字的无参短句，默认语言不能缺词`,
        fix: "在默认语言文件里声明这条短句；不写参数或复数", blocking: true }];
    }
  }
  return words;
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
