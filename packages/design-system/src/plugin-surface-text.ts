import type { SandboxPluginContract, SandboxSchema, SandboxVisibleText } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { TextArgs, TextRef } from '@molis-ai/molis-work-contracts/platform/ui';
import { ownedTextRef, say, textArgs, textKeyPrefix } from '@molis-ai/molis-work-plugin-sdk/ui';

/** Paths are language independent; an id containing a separator must still identify exactly one slot. */
export const pluginTextSlot = (...path: readonly string[]): string => path.map(value => encodeURIComponent(value)).join('/');

/** A short stable key over the same slot in Node and the browser, independent of order and wording. */
export function pluginTextSlotKey(owner: string, slot: string): string {
  let identity = 0xcbf29ce484222325n;
  for (let index = 0; index < slot.length; index++) identity = BigInt.asUintN(64, (identity ^ BigInt(slot.charCodeAt(index))) * 0x100000001b3n);
  return textKeyPrefix(owner) + '.studio.k' + identity.toString(16);
}

/** Source wording before the designer's locale files are frozen. */
export const literalPluginWord = (word: SandboxVisibleText | undefined): string => typeof word === "string" ? word : word && 'literal' in word ? word.literal ?? '' : '';
export const pluginSurfaceWord = (owner: string, word?: SandboxVisibleText, args?: TextArgs): string => typeof word === 'string' ? word : word
  ? say.text(ownedTextRef(word, owner), args ? { extra: textArgs(args) } : undefined) : '';

/** A signed interface only takes the derived field names when it actually declared its page in this slot scheme. */
export const usesPluginFieldWords = (contract: SandboxPluginContract): boolean => !!contract.ui?.locales && contract.pages.some(page =>
  typeof page.title !== 'string' && 'key' in page.title && page.title.key === pluginTextSlotKey(contract.pluginId, pluginTextSlot('page', page.id, 'title')));

export function pluginFieldWords(contract: SandboxPluginContract, operation: string, field: string, schema: SandboxSchema) {
  const [name, ...rest] = (schema.description || field).split('，');
  const label = name!.trim() || field, hint = rest.join('，').trim();
  const ref = (kind: 'label' | 'hint', fallback: string): TextRef => usesPluginFieldWords(contract)
    ? { key: pluginTextSlotKey(contract.pluginId, pluginTextSlot('field', operation, field, kind)) } : { literal: fallback };
  return { label: ref('label', label), ...(hint ? { hint: ref('hint', hint) } : {}) };
}

export const pluginTemplatePaths = (text: string): string[] => [...new Set([...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/gu)].map(([, field]) => field!))];
export const pluginTemplateName = (path: string): string => path.replaceAll('.', '_');

/** Keys that a sandbox's visible interface promises to draw. The package reader checks them against its actual default file. */
export function sandboxUiTextRefs(contract: SandboxPluginContract, parts: readonly Pick<import('./plugin-components.js').PluginComponentPlan, 'props' | 'read' | 'submit'>[]): SandboxVisibleText[] {
  const refs = contract.pages.flatMap(page => [page.title, ...page.regions.map(region => region.title)]);
  for (const { props, read, submit } of parts) {
    for (const text of [props.title, props.description, props.submitLabel, props.emptyText, props.requiredText]) if (text) refs.push(text);
    for (const column of props.columns ?? []) refs.push(column.label, ...Object.values(column.values ?? {}));
    if (usesPluginFieldWords(contract)) for (const binding of [read, submit]) for (const [field, input] of Object.entries(binding?.input ?? {})) {
      if (input.source !== 'form') continue;
      const operation = contract.operations.find(row => row.id === binding!.operationId)!;
      refs.push(...Object.values(pluginFieldWords(contract, operation.id, field, operation.input.properties![field]!)));
    }
  }
  return refs;
}

/** A destructive command is identified by its frozen operation, regardless of the words on its button. */
export function isDestructivePluginOperation(id?: string): boolean {
  return /(?:^|[._-])(?:delete|remove|clear|discard|undo|revoke|erase|purge)(?:$|[._-])/iu.test(id?.replace(/([a-z])([A-Z])/g, '$1-$2') ?? '');
}

/** Exact operation output paths for parameter names. A collision with another schema field is refused too. */
export function pluginTemplateBindings(schema: SandboxSchema, names: readonly string[]): ReadonlyMap<string, string> {
  const wanted = new Set(names), bindings = new Map<string, string>();
  const walk = (current: SandboxSchema, parent: string) => {
    for (const [key, child] of Object.entries(current.properties ?? {})) {
      const path = parent ? parent + '.' + key : key, arg = pluginTemplateName(path);
      if (wanted.has(arg)) {
        if (bindings.has(arg)) throw new Error('Ambiguous generated UI parameter: ' + arg);
        bindings.set(arg, path);
      }
      if (child.type === 'object') walk(child, path);
    }
  };
  walk(schema, '');
  return bindings;
}
export const pluginMessageNames = (text: string): string[] => [...new Set([...text.matchAll(/\{([A-Za-z_]\w*)\}/gu)].map(([, name]) => name!))];
