import { QUESTIONNAIRE_LIMITS } from "@prologue/sdk";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * Which kinds of object a round's reference questions may ask for (BL-152, S-32). The Host lists what the round's project has
 * installed and shows; what of it reaches the model's tool schema is decided here. A kind and its display name are a plugin
 * author's text, so each entry is held to the SDK's own bounds before the SDK sees it. The SDK refuses a whole list for one
 * bad entry, which would stop every round in the project; here that entry alone is left out and named as a problem for its
 * plugin's diagnostics, never for the model.
 */
/** `installation` is the Host's key for the plugin installation the kind comes from: each has its own share of the limit. */
export interface ReferenceKindCandidate { readonly plugin_id: string; readonly installation: string; readonly kind: string; readonly title: string }
type ReferenceKindProblemReason = "kind" | "title" | "limit" | "duplicate";
/** One per installation and reason; a collision is one per kind, with every installation that declares it. */
export interface ReferenceKindProblem { readonly plugin_id: string; readonly installation: string; readonly reason: ReferenceKindProblemReason; readonly limit: number; readonly kinds: readonly string[]; readonly conflicting_installations?: readonly string[] }
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
  kind: QUESTIONNAIRE_LIMITS.maxRefKindChars, title: QUESTIONNAIRE_LIMITS.maxRefKindTitleChars, limit: QUESTIONNAIRE_LIMITS.maxAppRefKinds, duplicate: 1 };

/**
 * The kinds in a fixed order, by plugin id and kind, so two rounds in one project see the same schema (and keep the prompt
 * cache); two installations that name one plugin id go by installation. A kind two installations list is ambiguous: none
 * offers it, and each gets a diagnostic naming the conflict (PG-015). Every installation, built in or not, has the same share
 * of the SDK's `maxAppRefKinds`: past the
 * limit, kinds are taken one per installation in turn, so one that lists many cannot push out another's, and a share one does
 * not use goes to the others. What is left out is a problem for its plugin.
 */
export function boundReferenceKinds(candidates: readonly ReferenceKindCandidate[]): { kinds: Array<{ kind: string; title: string }>; problems: ReferenceKindProblem[] } {
  const ordered = [...candidates].sort((a, b) => byCodePoint(a.plugin_id, b.plugin_id) || byCodePoint(a.installation, b.installation) || byCodePoint(a.kind, b.kind) || byCodePoint(a.title, b.title));
  const offered = new Map<string, ReferenceKindCandidate[]>(), valid: ReferenceKindCandidate[] = [];
  const problems = new Map<string, ReferenceKindProblem & { kinds: string[] }>();
  const note = (entry: ReferenceKindCandidate, reason: ReferenceKindProblemReason, conflicting_installations?: readonly string[]) => {
    const key = `${entry.installation}\n${reason}${reason === "duplicate" ? `\n${entry.kind}` : ""}`;
    if (!problems.has(key)) problems.set(key, { plugin_id: entry.plugin_id, installation: entry.installation, reason, limit: LIMITS[reason], kinds: [], ...(conflicting_installations ? { conflicting_installations } : {}) });
    const kinds = problems.get(key)!.kinds;
    if (!kinds.includes(String(entry.kind))) kinds.push(String(entry.kind));
  };
  const owners = new Map<string, Map<string, ReferenceKindCandidate>>();
  for (const entry of ordered) {
    if (!oneLine(entry.kind, LIMITS.kind) || !KIND.test(entry.kind)) note(entry, "kind");
    else {
      if (!owners.has(entry.kind)) owners.set(entry.kind, new Map());
      const installations = owners.get(entry.kind)!;
      if (!installations.has(entry.installation)) installations.set(entry.installation, entry);
      if (!oneLine(entry.title, LIMITS.title)) note(entry, "title");
      else valid.push(entry);
    }
  }
  for (const installations of owners.values()) if (installations.size > 1)
    for (const entry of installations.values()) note(entry, "duplicate", [...installations.keys()].sort(byCodePoint));
  const named = new Set<string>();
  for (const entry of valid) if (owners.get(entry.kind)!.size === 1 && !named.has(entry.kind)) {
    named.add(entry.kind); offered.set(entry.installation, [...offered.get(entry.installation) ?? [], entry]);
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
export async function roundReferenceKinds(options: { referenceKindsFor?: ReferenceKindsFor; questionTypes?: readonly string[]; referenceKinds?: ReadonlyArray<{ kind: string; title: string }> },
  owner: { project_id: string; actor_id?: string }): Promise<Array<{ kind: string; title: string }> | undefined> {
  if (!options.referenceKindsFor || !options.questionTypes?.includes("reference") || !owner.actor_id) return undefined;
  const candidates = await options.referenceKindsFor({ project_id: owner.project_id, actor_id: owner.actor_id }).catch(() => []);
  const { kinds, problems } = boundReferenceKinds(candidates);
  if (kinds.length) return kinds;
  const ambiguous = new Set(problems.filter(problem => problem.reason === "duplicate").flatMap(problem => problem.kinds));
  if (!ambiguous.size) return undefined;
  // An empty per-round list otherwise restores the Runtime's defaults, including the very kind just refused.
  const remaining = options.referenceKinds?.filter(entry => !ambiguous.has(entry.kind));
  if (remaining?.length) return remaining;
  throw new ActionError("actions.subject_ambiguous", "可引用的对象种类存在多个可用安装，不能任意选择提供方");
}
