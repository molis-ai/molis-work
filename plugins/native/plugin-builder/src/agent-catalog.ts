/**
 * What the designer sees of the capability catalog. The project's directory holds hundreds of actions; the designer
 * gets the ones that bear on this request in full (schemas included), the ones the design already uses always, and
 * a line per remaining source with example ids, so it knows what else exists without drowning in it.
 */
import type { ActionExecutionPolicy } from '@molis-ai/molis-work-contracts/platform/actions';

export interface CatalogEntry { execution?: ActionExecutionPolicy; id: string; description: string; title?: string; source?: string; effect?: string; input?: unknown; output?: unknown }

/** Words for matching: Latin words whole, Chinese as overlapping character pairs. */
function grams(value: string): Set<string> {
  const found = new Set<string>();
  for (const word of value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(Boolean)) {
    if (/^[a-z0-9]+$/.test(word)) { if (word.length > 2) found.add(word); continue; }
    for (let index = 0; index + 1 < word.length; index++) found.add(word.slice(index, index + 2));
  }
  return found;
}
/** Always shown: the studio's own capabilities, which fit most requests. */
const ESSENTIAL = new Set(['model.generate', 'reminders.add', 'reminders.cancel', 'schedules.add', 'schedules.cancel']);

/** How well each entry matches a text: shared words weighted by how rare they are in the catalog, title matches double. */
function scorer(catalog: readonly CatalogEntry[]) {
  // A match on a word that appears in many entries ("记录") says little; a rare one ("目标", "单词") says a lot.
  const words = new Map(catalog.map(entry => [entry, { title: grams([entry.title, entry.source].filter(Boolean).join(' ')), all: grams([entry.title, entry.source, entry.description, entry.id.replace(/[._-]+/g, ' ')].filter(Boolean).join(' ')) }]));
  const seen = new Map<string, number>(); for (const item of words.values()) for (const gram of item.all) seen.set(gram, (seen.get(gram) ?? 0) + 1);
  const weight = (gram: string) => Math.log((catalog.length + 1) / ((seen.get(gram) ?? 0) + 1));
  return (entry: CatalogEntry, text: string) => { const item = words.get(entry)!; let total = 0; for (const gram of grams(text)) if (item.all.has(gram)) total += weight(gram) * (item.title.has(gram) ? 2 : 1); return total; };
}

export function focusCatalog(catalog: readonly CatalogEntry[], text: string, keep: readonly string[] = [], limit = 24) {
  const score = scorer(catalog);
  const ranked = catalog.map(entry => ({ entry, score: keep.includes(entry.id) ? Number.MAX_SAFE_INTEGER : ESSENTIAL.has(entry.id) ? 100 : score(entry, text) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked.find(item => !ESSENTIAL.has(item.entry.id) && !keep.includes(item.entry.id))?.score ?? 0;
  // Beyond the essentials and what is kept, only matches that are both meaningful and close to the best one.
  const shown = ranked.filter((item, index) => keep.includes(item.entry.id) || ESSENTIAL.has(item.entry.id) || index < limit && item.score >= 3 && item.score >= top * 0.35).map(item => item.entry);
  const bySource = new Map<string, CatalogEntry[]>();
  for (const entry of catalog) if (!shown.includes(entry)) bySource.set(entry.source ?? '平台', [...bySource.get(entry.source ?? '平台') ?? [], entry]);
  const more = [...bySource].map(([source, entries]) => ({ source, count: entries.length, examples: entries.slice(0, 8).map(entry => entry.id + ' — ' + (entry.title ?? entry.description.slice(0, 30))) }));
  return { capabilities: shown, moreCapabilities: more };
}

/** The capability ids a design or a proposal already uses: the designer always sees them in full. */
export function usedCapabilities(operations: ReadonlyArray<{ effects?: { capabilities?: readonly string[] } }> | undefined): string[] {
  return [...new Set((operations ?? []).flatMap(operation => operation.effects?.capabilities ?? []))];
}

/**
 * The legal alternatives to a capability the designer named for one operation: offered entries from the same provider,
 * of the same kind (reading stays reading, changing stays changing), that meet the operation's purpose nearly as well as
 * the provider's best match. The named one comes first; alone, no one needs to choose.
 */
export function capabilityCandidates(catalog: readonly CatalogEntry[], named: string, purpose: string, limit = 4): CatalogEntry[] {
  const chosen = catalog.find(entry => entry.id === named);
  if (!chosen) return [];
  if (ESSENTIAL.has(named)) return [chosen];
  const score = scorer(catalog), kin = catalog.filter(entry => entry.source === chosen.source && (entry.effect === 'read') === (chosen.effect === 'read') && !ESSENTIAL.has(entry.id));
  const scored = kin.map(entry => ({ entry, score: score(entry, purpose) })), bar = Math.max(3, 0.8 * Math.max(...scored.map(item => item.score)));
  const others = scored.filter(item => item.entry !== chosen && item.score >= bar).sort((a, b) => b.score - a.score).slice(0, limit - 1).map(item => item.entry);
  return [chosen, ...others];
}

/** Characters of full schemas the designer is given; beyond it, entries are named with their fields only. */
export const CATALOG_SCHEMA_BUDGET = 60_000;
/**
 * Keeps the designer's catalog within budget: the entries already in use and the most relevant ones keep their full
 * schemas; the rest keep their id, title, purpose and the names of their input fields, which is enough to choose them
 * (a chosen capability comes back in full when the design is written against it).
 */
export function withinBudget(entries: readonly CatalogEntry[], keep: readonly string[] = [], budget = CATALOG_SCHEMA_BUDGET): CatalogEntry[] {
  let used = 0;
  const fields = (schema: unknown) => schema && typeof schema === 'object' && 'properties' in schema && schema.properties && typeof schema.properties === 'object' ? Object.keys(schema.properties) : [];
  return entries.map(entry => {
    const size = JSON.stringify(entry).length;
    if (keep.includes(entry.id) || used + size <= budget) { used += size; return entry; }
    const { input, output: _output, ...rest } = entry;
    return { ...rest, input: { fields: fields(input) }, description: entry.description + '（完整输入输出从略，选用后细化时会给出）' };
  });
}
