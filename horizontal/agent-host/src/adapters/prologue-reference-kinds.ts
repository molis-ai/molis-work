import { QUESTIONNAIRE_LIMITS } from "@prologue/sdk";

/**
 * Which kinds of object a round's reference questions may ask for (BL-152, S-32). The Host lists what the round's project has
 * installed and shows; what of it reaches the model's tool schema is decided here. A kind and its display name are a plugin
 * author's text, so each entry is held to the SDK's own bounds before the SDK sees it. The SDK refuses a whole list for one
 * bad entry, which would stop every round in the project; here that entry alone is left out and named as a problem for its
 * plugin's diagnostics, never for the model.
 */
/** `installation` is the Host's key for the plugin installation the kind comes from: each has its own share of the limit. */
export interface ReferenceKindCandidate { readonly plugin_id: string; readonly installation: string; readonly kind: string; readonly title: string }
type ReferenceKindProblemReason = "kind" | "title" | "limit";
/** One per plugin and reason, with the kinds it covers and the SDK's bound it broke (characters, or kinds for `limit`). */
export interface ReferenceKindProblem { readonly plugin_id: string; readonly reason: ReferenceKindProblemReason; readonly limit: number; readonly kinds: readonly string[] }
/** The candidates the round's project offers, asked as the round's owner: the Host's session record, never the round's request. */
export type ReferenceKindsFor = (owner: { project_id: string; actor_id: string }) => Promise<readonly ReferenceKindCandidate[]>;

// The SDK bounds a kind only to one line; a kind is a name the model copies into `refKinds`, so it is written as an identifier.
// Neither the SDK nor the contracts check that shape, which is why the check is here, beside the SDK's limits.
const KIND = /^[a-z][a-z0-9_.-]*$/u;
// The SDK's one line counts only CR and LF; a control character or a Unicode line break would start another line too.
const oneLine = (text: unknown, max: number): text is string =>
  typeof text === "string" && text.trim().length > 0 && text.length <= max && !/[\p{Cc}\u2028\u2029]/u.test(text);
const byCodePoint = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const LIMITS: Record<ReferenceKindProblemReason, number> = {
  kind: QUESTIONNAIRE_LIMITS.maxRefKindChars, title: QUESTIONNAIRE_LIMITS.maxRefKindTitleChars, limit: QUESTIONNAIRE_LIMITS.maxAppRefKinds };

/**
 * The kinds in a fixed order, by plugin id and kind, so two rounds in one project see the same schema (and keep the prompt
 * cache); two installations that name one plugin id go by installation. A kind two plugins list keeps the name of the one first
 * in that order. Every installation, built in or not, has the same share of the SDK's `maxAppRefKinds` (PG-015): past the
 * limit, kinds are taken one per installation in turn, so one that lists many cannot push out another's, and a share one does
 * not use goes to the others. What is left out is a problem for its plugin.
 */
export function boundReferenceKinds(candidates: readonly ReferenceKindCandidate[]): { kinds: Array<{ kind: string; title: string }>; problems: ReferenceKindProblem[] } {
  const ordered = [...candidates].sort((a, b) => byCodePoint(a.plugin_id, b.plugin_id) || byCodePoint(a.installation, b.installation) || byCodePoint(a.kind, b.kind));
  const named = new Set<string>(), offered = new Map<string, ReferenceKindCandidate[]>();
  const problems = new Map<string, { plugin_id: string; reason: ReferenceKindProblemReason; limit: number; kinds: string[] }>();
  const note = (entry: ReferenceKindCandidate, reason: ReferenceKindProblemReason) => {
    const key = `${entry.plugin_id}\n${reason}`;
    if (!problems.has(key)) problems.set(key, { plugin_id: entry.plugin_id, reason, limit: LIMITS[reason], kinds: [] });
    problems.get(key)!.kinds.push(String(entry.kind));
  };
  for (const entry of ordered) {
    if (!oneLine(entry.kind, LIMITS.kind) || !KIND.test(entry.kind)) note(entry, "kind");
    else if (!oneLine(entry.title, LIMITS.title)) note(entry, "title");
    else if (named.has(entry.kind)) { /* named already, by a plugin earlier in the order */ }
    else { named.add(entry.kind); offered.set(entry.installation, [...offered.get(entry.installation) ?? [], entry]); }
  }
  const taken = new Set<ReferenceKindCandidate>(), queues = [...offered.values()];
  for (let turn = 0; taken.size < LIMITS.limit && queues.some(queue => queue.length > turn); turn++)
    for (const queue of queues) if (queue.length > turn && taken.size < LIMITS.limit) taken.add(queue[turn]!);
  const kinds: Array<{ kind: string; title: string }> = [];
  for (const entry of queues.flat()) taken.has(entry) ? kinds.push({ kind: entry.kind, title: entry.title }) : note(entry, "limit");
  return { kinds, problems: [...problems.values()] };
}

/**
 * This round's own list, or undefined to keep the Runtime's (the built-in plugins'): without the Host's port, without the
 * reference type, for an owner with no person, or when nothing is left. A Host that cannot list them does not stop the round.
 */
export async function roundReferenceKinds(options: { referenceKindsFor?: ReferenceKindsFor; questionTypes?: readonly string[] },
  owner: { project_id: string; actor_id?: string }): Promise<Array<{ kind: string; title: string }> | undefined> {
  if (!options.referenceKindsFor || !options.questionTypes?.includes("reference") || !owner.actor_id) return undefined;
  const candidates = await options.referenceKindsFor({ project_id: owner.project_id, actor_id: owner.actor_id }).catch(() => []);
  const { kinds } = boundReferenceKinds(candidates);
  return kinds.length ? kinds : undefined;
}
