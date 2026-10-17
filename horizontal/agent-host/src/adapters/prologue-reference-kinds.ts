import { QUESTIONNAIRE_LIMITS } from "@prologue/sdk";

/**
 * Which kinds of object a round's reference questions may ask for (BL-152, S-32). The Host lists what the round's project has
 * installed and shows; what of it reaches the model's tool schema is decided here. A kind and its display name are a plugin
 * author's text, so each entry is held to the SDK's own bounds before the SDK sees it. The SDK refuses a whole list for one
 * bad entry, which would stop every round in the project; here that entry alone is left out and named as a problem for its
 * plugin's diagnostics, never for the model.
 */
export interface ReferenceKindCandidate { readonly plugin_id: string; readonly builtin: boolean; readonly kind: string; readonly title: string }
export type ReferenceKindProblemReason = "kind" | "title" | "limit";
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
 * The kinds in a fixed order: built-in plugins first, then by plugin id and kind, so two rounds in one project see the same
 * schema (and keep the prompt cache). A kind two plugins list keeps the first one's name. At most the SDK's
 * `maxAppRefKinds`; the rest are problems.
 */
export function boundReferenceKinds(candidates: readonly ReferenceKindCandidate[]): { kinds: Array<{ kind: string; title: string }>; problems: ReferenceKindProblem[] } {
  const ordered = [...candidates].sort((a, b) => Number(b.builtin) - Number(a.builtin) || byCodePoint(a.plugin_id, b.plugin_id) || byCodePoint(a.kind, b.kind));
  const kinds = new Map<string, string>(), problems = new Map<string, { plugin_id: string; reason: ReferenceKindProblemReason; limit: number; kinds: string[] }>();
  const note = (entry: ReferenceKindCandidate, reason: ReferenceKindProblemReason) => {
    const key = `${entry.plugin_id}\n${reason}`;
    if (!problems.has(key)) problems.set(key, { plugin_id: entry.plugin_id, reason, limit: LIMITS[reason], kinds: [] });
    problems.get(key)!.kinds.push(String(entry.kind));
  };
  for (const entry of ordered) {
    if (!oneLine(entry.kind, LIMITS.kind) || !KIND.test(entry.kind)) note(entry, "kind");
    else if (!oneLine(entry.title, LIMITS.title)) note(entry, "title");
    else if (kinds.has(entry.kind)) { /* named already, by a plugin earlier in the order */ }
    else if (kinds.size >= LIMITS.limit) note(entry, "limit");
    else kinds.set(entry.kind, entry.title);
  }
  return { kinds: [...kinds].map(([kind, title]) => ({ kind, title })), problems: [...problems.values()] };
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
