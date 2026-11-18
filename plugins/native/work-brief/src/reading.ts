import { ActionError, findSubjectReader, type ActionReference, type ActionSubject, type ActionSubjectContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorKind, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { isPresentationOverviewReader } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { tryOwnedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { WORK_BRIEF_PLUGIN_ID } from "./identity.js";
import { BRIEF_LIMITS, briefSubjectKey, type SourceRow } from "./model.js";

/**
 * The Host's action directory as the running action's caller sees it (`actions:delegate`). Everything Work Brief knows of another
 * plugin comes through here: its home overview, its object readers, its actions. No table of another plugin is opened and no
 * plugin is named in this code, so a project without some plugin simply has one source fewer.
 */
export interface BriefDirectory {
  discover(): Promise<readonly ActionView[]>;
  invoke<Output = unknown>(reference: ActionReference, input: unknown): Promise<Output>;
  check(reference: ActionReference, input: unknown): Promise<void>;
}

const exact = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const ownerOf = (view: ActionView) => view.provider.plugin_id ?? view.provider.provider_id;

/** Runs `work` over `items`, a few at a time, keeping their order. */
async function mapLimited<Item, Result>(items: readonly Item[], work: (item: Item) => Promise<Result>, limit = 6): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await work(items[index]!); }
  }));
  return results;
}

export type SubjectRead = { state: "ok"; context: ActionSubjectContext; owner_plugin_id: string } | { state: "gone" | "unreadable" };

/** One object as its owner reads it for this caller now. A refusal or a missing reader is `unreadable`; an owner's "not found" is `gone`. */
async function readBriefSubject(directory: BriefDirectory, views: readonly ActionView[], subject: ActionSubject): Promise<SubjectRead> {
  const lookup = findSubjectReader(views, subject.kind);
  if (lookup.found !== "one") return { state: "unreadable" };
  try {
    const context = await directory.invoke<ActionSubjectContext>(exact(lookup.view), { subject_id: subject.id });
    if (!isRecord(context) || !isRecord(context.subject) || context.subject.kind !== subject.kind || context.subject.id !== subject.id) return { state: "unreadable" };
    return { state: "ok", context, owner_plugin_id: ownerOf(lookup.view) };
  } catch (error) {
    if (!(error instanceof ActionError)) throw error;
    return { state: actionErrorKind(error) === "not_found" ? "gone" : "unreadable" };
  }
}

/** Reads each distinct object once. */
export async function readBriefSubjects(directory: BriefDirectory, views: readonly ActionView[], subjects: readonly ActionSubject[]): Promise<Map<string, SubjectRead>> {
  const distinct = [...new Map(subjects.map(subject => [briefSubjectKey(subject), subject])).values()];
  const reads = await mapLimited(distinct, subject => readBriefSubject(directory, views, subject));
  return new Map(distinct.map((subject, index) => [briefSubjectKey(subject), reads[index]!]));
}

/** The plugins that offer a home overview to this caller now, other than Work Brief itself, by plugin id. */
export function overviewReaders(views: readonly ActionView[]): Map<string, ActionView[]> {
  const readers = new Map<string, ActionView[]>();
  for (const view of views) {
    if (view.provider.kind !== "plugin" || !view.provider.plugin_id || view.provider.plugin_id === WORK_BRIEF_PLUGIN_ID || !isPresentationOverviewReader(view)) continue;
    readers.set(view.provider.plugin_id, [...readers.get(view.provider.plugin_id) ?? [], view]);
  }
  return readers;
}

function overviewOf(value: unknown, owner: string): Pick<SourceRow, "summary" | "subjects"> | null {
  if (!isRecord(value) || !Array.isArray(value.subjects)) return null;
  const summary = tryOwnedTextRef(value.summary, owner);
  const subjects = value.subjects.flatMap((subject: unknown) => isRecord(subject) && typeof subject.kind === "string" && typeof subject.id === "string"
    ? [{ kind: subject.kind, id: subject.id }] : []);
  return summary ? { summary, subjects } : null;
}

/**
 * How each source reads now, in parallel: one failing does not hold the others (WBR-12). A source that cannot be read keeps what the
 * version before knew, marked `stale` with that read's time; one never read is `unreadable`; one this caller may not read is
 * `unauthorized`. Nothing is made up for a source that gave nothing. `turn` is filled by the caller, which knows the brief's content.
 */
export async function readBriefSources(directory: BriefDirectory, views: readonly ActionView[], before: readonly SourceRow[], at: string): Promise<SourceRow[]> {
  const known = new Map(before.map(row => [row.plugin_id, row]));
  const readers = [...overviewReaders(views)].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).slice(0, BRIEF_LIMITS.sources);
  return mapLimited(readers, async ([pluginId, matches]): Promise<SourceRow> => {
    const view = matches[0]!, name: OwnedTextRef = view.provider.title_text ?? { literal: view.provider.title }, old = known.get(pluginId);
    const failed = (read: "unreadable" | "unauthorized"): SourceRow => read === "unreadable" && old && (old.read === "ok" || old.read === "stale") && old.read_at
      ? { ...old, name, read: "stale", turn: "idle" } : { plugin_id: pluginId, name, read, subjects: [], turn: "idle" };
    if (matches.length !== 1) return failed("unreadable");
    if (!view.availability.available) return failed(actionErrorKind(new ActionError(view.availability.code, view.availability.reason)) === "forbidden" ? "unauthorized" : "unreadable");
    try {
      const overview = overviewOf(await directory.invoke(exact(view), {}), pluginId);
      if (!overview) return failed("unreadable");
      return { plugin_id: pluginId, name, read: overview.subjects.length || overview.summary ? "ok" : "none", read_at: at, ...overview, turn: "idle" };
    } catch (error) {
      if (!(error instanceof ActionError)) throw error;
      return failed(actionErrorKind(error) === "forbidden" ? "unauthorized" : "unreadable");
    }
  });
}
