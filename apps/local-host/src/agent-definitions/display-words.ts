import type { AgentDefinitionRegistration, AgentDefinitionSource, AgentPromptView, AgentRoleView } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { PluginTextReader } from "@molis-ai/molis-work-ui-host";
import { createTextReader, localeMessageArguments, textArgs, textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";
import { workbenchPlatformText, type AgentDisplayModel as DisplayModel } from "../ui-text-provider.js";

interface DisplaySource { reader: PluginTextReader; namespace: string; source: AgentDefinitionSource }

// Only the current trusted construction binds these objects. JSON declarations, signatures and user edits carry no marker.
const sources = new WeakMap<object, DisplaySource>();
const compositions = new WeakMap<object, readonly string[]>();

export function rememberComposedRoles(prompt: object, roleIds: readonly string[]): void {
  compositions.set(prompt, roleIds);
}

export function bindAgentDisplayWords(registration: AgentDefinitionRegistration, reader: PluginTextReader, namespace = ""): AgentDefinitionRegistration {
  const source = { reader, namespace, source: registration.source };
  for (const row of [...registration.roles, ...registration.prompts]) sources.set(row, source);
  return registration;
}

/** Keep the provenance of each selected object across the register's normal copies, without adding serialized fields. */
export function cloneAgentRegistration(registration: AgentDefinitionRegistration): AgentDefinitionRegistration {
  const clone = structuredClone(registration);
  for (const field of ["roles", "prompts"] as const) registration[field].forEach((row, index) => {
    const source = sources.get(row);
    if (source) sources.set(clone[field][index]!, source);
    const composition = compositions.get(row);
    if (composition) compositions.set(clone[field][index]!, composition);
  });
  return clone;
}

function sameSource(a: AgentDefinitionSource, b: AgentDefinitionSource): boolean {
  if (a.kind === "system") return b.kind === "system" && a.module === b.module;
  return b.kind === "plugin" && a.plugin_id === b.plugin_id && a.plugin_version === b.plugin_version
    && a.publisher_signature === b.publisher_signature && a.origin === b.origin;
}

function words(source: DisplaySource, kind: "role" | "prompt", id: string, original: Record<string, string>, locale?: string): Record<string, string> {
  const { reader, namespace } = source, selected = locale ? reader.pack(locale) : null, fallback = reader.pack(reader.default);
  const prefix = textKeyPrefix(reader.owner), group = namespace ? `agent-${namespace}-${kind}` : `agent-${kind}`;
  const result = { ...original };
  for (const field of Object.keys(original)) {
    const key = `${prefix}.${group}.${id.replaceAll(".", "-")}.${field}`;
    const message = selected?.messages[key] ?? fallback?.messages[key];
    if (typeof message === "string" && localeMessageArguments(message).length === 0) result[field] = message;
  }
  return result;
}

function roleComposition(locale = workbenchPlatformText.default) {
  const { owner, default: fallback } = workbenchPlatformText;
  const packs = [...new Set([locale, fallback])].flatMap(tag => workbenchPlatformText.pack(tag) ?? []);
  const reader = createTextReader({ locale, packs });
  const separator = reader.text({ owner, key: "common.list.separator" });
  return (roles: readonly string[]) => reader.text({ owner,
    key: roles.length === 1 ? "workbench.settings-prompts.composes-role" : "workbench.settings-prompts.composes-roles",
    args: textArgs({ roles: roles.join(separator) }) });
}

/** Only display fields, grouped by their actual current source; no prompt body or edited content leaves this projection. */
export function agentDisplayModel(registrations: readonly AgentDefinitionRegistration[], locale?: string, kind?: "role" | "prompt"): DisplayModel {
  const result: DisplayModel = {};
  let compose: ReturnType<typeof roleComposition> | undefined;
  for (const owner of registrations) {
    const roles: DisplayModel[string]["roles"] = {}, prompts: DisplayModel[string]["prompts"] = {};
    for (const role of owner.roles) {
      const source = sources.get(role);
      if (!source || !sameSource(source.source, owner.source)) continue;
      const shown = words(source, "role", role.role_id, { name: role.name, purpose: role.purpose }, locale);
      roles[role.role_id] = { version: role.version, name: shown.name!, purpose: shown.purpose! };
    }
    if (kind !== "role") for (const prompt of owner.prompts) {
      const source = sources.get(prompt);
      if (!source || !sameSource(source.source, owner.source)) continue;
      const names = compositions.get(prompt)?.map(id => roles[id]?.name);
      const purpose = names?.every((name): name is string => name !== undefined) ? (compose ??= roleComposition(locale))(names) : undefined;
      const shown = words(source, "prompt", prompt.prompt_id, { title: prompt.title, ...(purpose === undefined ? { purpose: prompt.purpose } : {}) }, locale);
      prompts[prompt.prompt_id] = { version: prompt.version, title: shown.title!, purpose: purpose ?? shown.purpose! };
    }
    if ((kind !== "prompt" && Object.keys(roles).length) || Object.keys(prompts).length) result[owner.owner_id] = {
      source: structuredClone(owner.source), roles: kind === "prompt" ? {} : roles, prompts,
    };
  }
  return result;
}

export function displayAgentRole(role: AgentRoleView, model: DisplayModel): AgentRoleView {
  const owner = model[role.owner_id], words = owner?.roles[role.role_id];
  return owner && words?.version === role.version && sameSource(owner.source, role.source) ? { ...role, name: words.name, purpose: words.purpose } : role;
}

export function displayAgentPrompt(prompt: AgentPromptView, model: DisplayModel): AgentPromptView {
  const owner = model[prompt.owner_id], words = owner?.prompts[prompt.prompt_id];
  return owner && words?.version === prompt.default_version && sameSource(owner.source, prompt.source) ? { ...prompt, title: words.title, purpose: words.purpose } : prompt;
}
