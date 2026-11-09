import type { SandboxVisibleText } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { isRecord } from '@molis-ai/molis-work-plugin-sdk';
import { inspectLocaleSet, parseLocalePack } from '@molis-ai/molis-work-plugin-sdk/ui';
import { UI_FORMAT_VERSIONS, type PluginLocalesDeclaration, type TextRef, type UiLocalePack } from '@molis-ai/molis-work-contracts/platform/ui';
import { literalPluginWord, PLUGIN_COMPONENT_WORD_KEYS, pluginFieldWords, pluginTemplateName, pluginTemplatePaths, pluginTemplateBindings, pluginMessageNames, pluginSchemaAt, pluginTextSlot, pluginTextSlotKey, sandboxUiTextRefs } from '@molis-ai/molis-work-design-system';
import type { AgentDesign } from './agent-model.js';

export interface StudioDesignLanguages {
  readonly current: string;
  readonly available: readonly { readonly tag: string; readonly name: string }[];
}

interface Slot { readonly name: string; readonly fields: readonly string[]; use(ref: TextRef): void }

/** Enumerates what the normalized design actually displays. Binding and stored data never become slots. */
function studioSlots(design: AgentDesign): Slot[] {
  const slots = new Map<string, Slot>(), add = (path: string[], fallback: SandboxVisibleText, use: Slot['use'] = () => {}) => {
    const name = pluginTextSlot(...path);
    if (slots.has(name)) throw new Error(`UI slot is duplicated: ${name}`);
    const fields = pluginTemplatePaths(literalPluginWord(fallback));
    if (new Set(fields.map(pluginTemplateName)).size !== fields.length) throw new Error(`UI slot has ambiguous message parameters: ${name}`);
    slots.set(name, { name, fields, use });
  };
  add(['plugin', 'name'], { literal: design.title });
  for (const page of design.contract.pages) {
    add(['page', page.id, 'title'], page.title, ref => { page.title = ref; });
    for (const region of page.regions) add(['region', page.id, region.id, 'title'], region.title, ref => { region.title = ref; });
  }
  for (const part of design.parts) {
    for (const key of PLUGIN_COMPONENT_WORD_KEYS) {
      const words = part.props[key];
      if (!words) continue;
      const paths = pluginTemplatePaths(literalPluginWord(words));
      if (paths.length) {
        const operation = design.contract.operations.find(row => row.id === part.read?.operationId);
        const schema = operation && pluginSchemaAt(operation.output, part.read?.outputPath);
        if (!schema || pluginTemplateBindings(schema, paths.map(pluginTemplateName)).size !== paths.length) throw new Error(`UI slot ${part.id}/${key} has unbound parameters.`);
      }
      add(['part', part.id, key], words, ref => { part.props[key] = ref; });
    }
    for (const column of part.props.columns ?? []) {
      add(['column', part.id, column.field, 'label'], column.label, ref => { column.label = ref; });
      for (const [value, words] of Object.entries(column.values ?? {})) add(['column', part.id, column.field, 'value', value], words, ref => { column.values![value] = ref; });
    }
    for (const binding of [part.read, part.submit]) for (const [field, input] of Object.entries(binding?.input ?? {})) {
      if (input.source !== 'form') continue;
      const operation = design.contract.operations.find(row => row.id === binding!.operationId)!;
      const words = pluginFieldWords(design.contract, operation.id, field, operation.input.properties![field]!);
      for (const [kind, ref] of Object.entries(words)) {
        const path = ['field', operation.id, field, kind];
        if (!slots.has(pluginTextSlot(...path))) add(path, ref);
      }
    }
  }
  return [...slots.values()];
}

export const studioUiAnswer = (languages: StudioDesignLanguages, existing?: PluginLocalesDeclaration) => ({
  default: existing?.default ?? languages.current,
  available: existing ? languages.available.filter(row => existing.available.includes(row.tag)) : languages.available,
  format: 'Add design.uiText: {default,locales:{[languageTag]:{[visibleSlot]:"complete words"}}}. Give every requested language the same complete slots, no markup. The language requested by the user takes precedence for new work; on revision preserve default and available. Slots: plugin/name; page/<id>/title; region/<page>/<region>/title (main unless given another region); part/<id>/{title,description,submitLabel,requiredText,emptyText} for each prop written; column/<part>/<field>/label; column/<part>/<field>/value/<value> for each named enum value; field/<operation>/<field>/label for every form-bound field, plus /hint if its schema description has a label and hint. URL-encode each id or value in a path. Keep all original machine values, field names and operations. In words only, convert {{nested.field}} to {nested_field}; keep the same parameters in every language. Preserve any variant that the user did not ask to change. To assert a visible label, use {action:"expectWord",componentId,word:"title"} (or description, submitLabel, emptyText, requiredText); use expect/text only for exact record or business output.',
});

export function freezeStudioUi(design: AgentDesign, supplied: unknown, languages: StudioDesignLanguages, existing?: PluginLocalesDeclaration): AgentDesign {
  if (!isRecord(supplied) || typeof supplied.default !== 'string' || !isRecord(supplied.locales) || Object.keys(supplied).some(name => !['default', 'locales'].includes(name)))
    throw new Error('The full design must supply uiText with a default and one complete locale map per language.');
  const available = existing?.available ?? languages.available.map(row => row.tag), fallback = existing?.default ?? supplied.default;
  if (fallback !== supplied.default || !available.includes(fallback) || Object.keys(supplied.locales).length !== available.length || !available.every(tag => Object.hasOwn(supplied.locales!, tag)))
    throw new Error(`UI languages must be ${available.join(', ')} and use an allowed default${existing ? ` (${existing.default})` : ''}.`);
  const owner = design.contract.pluginId, slots = studioSlots(design), expected = new Map(slots.map(slot => [slot.name, pluginTextSlotKey(owner, slot.name)]));
  if (new Set(expected.values()).size !== expected.size) throw new Error('Stable UI keys collide; rename one of the component or field ids.');
  const packs = available.map(locale => {
    const words = (supplied.locales as Record<string, unknown>)[locale];
    if (!isRecord(words)) throw new Error(`UI language ${locale} must have one complete slot map.`);
    const missing = slots.filter(slot => !Object.hasOwn(words, slot.name)), extra = Object.keys(words).filter(name => !expected.has(name));
    if (missing.length || extra.length) throw new Error(`UI language ${locale}: missing ${missing.map(slot => slot.name).join(', ') || 'none'}; extra ${extra.join(', ') || 'none'}.`);
    const messages = Object.fromEntries(slots.map(slot => {
      const value = words[slot.name];
      if (typeof value !== 'string' || !value.trim()) throw new Error(`UI language ${locale}: ${slot.name} needs text.`);
      const params = new Set(pluginMessageNames(value));
      if (params.size !== slot.fields.length || slot.fields.some(field => !params.has(pluginTemplateName(field))))
        throw new Error(`UI language ${locale}: ${slot.name} must use these parameters: ${slot.fields.map(pluginTemplateName).join(', ') || 'none'}.`);
      return [expected.get(slot.name)!, value];
    }));
    const parsed = parseLocalePack(JSON.stringify({ format_version: UI_FORMAT_VERSIONS.locale, owner, locale, messages }), { file: `locales/${locale}.json` });
    if (!parsed.ok) throw new Error(parsed.problems.map(problem => `${problem.file} ${problem.path}: ${problem.reason}`).join('\n'));
    return parsed.value;
  });

  for (const slot of slots) slot.use({ key: expected.get(slot.name)! });
  design.contract.ui = { locales: { default: fallback, available } };
  design.localePacks = packs;
  // The Manifest's required name is the default spelling; it is not an independent source of translated UI.
  design.title = String(packs.find(pack => pack.locale === fallback)!.messages[expected.get(pluginTextSlot('plugin', 'name'))!]);
  validateFrozenStudioWords(design);
  return design;
}

/** Drafts and unsigned local releases use these bytes; signed installs use the bytes verified from their own package. */
export const studioLocaleFiles = (packs: readonly UiLocalePack[] = []): Record<string, string> =>
  Object.fromEntries(packs.map(pack => [`locales/${pack.locale}.json`, JSON.stringify(pack)]));

/** Synced/local records carry the same bound words as a freshly accepted answer. Do not repair a partial persisted design. */
export function validateFrozenStudioWords(design: AgentDesign): void {
  const declared = design.contract.ui?.locales, raw = design.localePacks;
  if (design.contract?.ui === undefined && raw === undefined) return;
  if (!declared || Object.keys(design.contract.ui!).length !== 1 || !Array.isArray(raw) || raw.length !== declared.available.length) throw new Error('The frozen Studio language files do not match the declaration.');
  const packs = raw.map(pack => {
    const checked = parseLocalePack(JSON.stringify(pack));
    if (!checked.ok || checked.value.owner !== design.contract.pluginId || !declared.available.includes(checked.value.locale)) throw new Error('Invalid frozen Studio locale file.');
    return checked.value;
  });
  if (new Set(packs.map(pack => pack.locale)).size !== declared.available.length) throw new Error('Frozen Studio language files repeat a language.');
  const problems = inspectLocaleSet(packs, { default: declared.default });
  if (problems.length) throw new Error(problems.map(problem => `${problem.file} ${problem.key ?? ''}: ${problem.reason}`).join('\n'));
  const fallback = packs.find(pack => pack.locale === declared.default)!;
  const name = fallback.messages[pluginTextSlotKey(design.contract.pluginId, pluginTextSlot('plugin', 'name'))];
  if (typeof name !== 'string' || name !== design.title || pluginMessageNames(name).length > 0)
    throw new Error('The frozen Studio name must match the default language file.');
  for (const ref of sandboxUiTextRefs(design.contract, design.parts)) if (typeof ref !== 'string' && 'key' in ref && ref.key && !ref.key.startsWith('common.') && !Object.hasOwn(fallback.messages, ref.key))
    throw new Error(`The frozen Studio default pack is missing ${ref.key}.`);
}
