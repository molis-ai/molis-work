import { bindActionHandler, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext,
  type ActionHandlerBinding, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindPresentationValuesHandler, definePresentationOverviewAction, definePresentationValuesAction, PRESENTATION_LIMITS,
  type PresentationDeclaration, type PresentationLede, type PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import { cutCharacters } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { WORK_BRIEF_READ } from "./actions.js";
import { workBriefErrors } from "./error.js";
import { BRIEF_KIND, WORK_BRIEF_PROJECT_PLUGIN_ID } from "./identity.js";
import { briefSubjectKey, type BriefRecord, type BriefVersion } from "./model.js";
import type { BriefStore } from "./store.js";

/** The main-area view that is the project's brief: its versions, bases and revisions. The home shows its sentences (`overview.lede`). */
export const WORK_BRIEF_VIEW_ID = "brief";

const values = definePresentationValuesAction("work-brief.presentation.values", /* @version action.work-brief.presentation.values */ 1, [BRIEF_KIND], "简报显示字段", [...WORK_BRIEF_READ]);
const overview = definePresentationOverviewAction("work-brief.presentation.overview", /* @version action.work-brief.presentation.overview */ 1, "简报首页概况", [...WORK_BRIEF_READ]);
const subjectReader = defineSubjectContextAction("work-brief.subject.read", /* @version action.work-brief.subject.read */ 1, BRIEF_KIND, "简报", [...WORK_BRIEF_READ]);
const entries = defineSearchEntriesAction("work-brief.search.entries", /* @version action.work-brief.search.entries */ 1,
  [{ kind: BRIEF_KIND, title: "简报", surface: WORK_BRIEF_PROJECT_PLUGIN_ID }], "简报", [...WORK_BRIEF_READ]);
const subject = { ...subjectReader, action: { ...subjectReader.action, execution: { cost: "none" as const } } };
export const workBriefPresentationActions = [values, overview, entries, subject];

/** How a brief shows as a chip, row or card elsewhere: its title, whether something in it waits for the person, when it was last made. */
export const workBriefPresentation = {
  objects: [{
    kind: BRIEF_KIND,
    fields: [{ key: "title", role: "title" }, { key: "state", role: "status" }, { key: "waiting", role: "summary" }, { key: "updated_at", role: "updated_at" }],
    status: { field: "state", map: { waiting: { ring: "answer", attention: "needs_decision" }, settled: { ring: "done" }, empty: { ring: "idle" } } },
    forms: { chip: { fields: ["title"] }, row: { fields: ["title", "state", "waiting", "updated_at"] }, card: { fields: ["title", "state", "waiting", "updated_at"] },
      peek: { fields: ["title", "state", "waiting", "updated_at"] } },
    text: { lines: ["title", "state", "waiting", "updated_at"] },
  }],
  overview: { capability_id: overview.capability_id, version: overview.version },
} as const satisfies PresentationDeclaration;

const count = (name: string, number: number) => [{ name, kind: "number" as const, number }];
const waitingIn = (version: BriefVersion | null) => version?.attention.length ?? 0;
/** A project's own brief has no title of its own: it shows under the plugin's words for it, in the reader's language. */
const titleOf = (brief: BriefRecord) => brief.title || { key: "work-brief.presentation.home-title" };

/** The words a reader gets: the sentences as stored, their bases by title. Stored values, never translated sentences. */
function contentOf(version: BriefVersion | null): string {
  if (!version) return "";
  return [...version.claims.map(claim => `- ${claim.text}${claim.cites.length ? ` [${claim.cites.map(cite => cite.title).join("; ")}]` : ""}`),
    ...version.attention.map(item => `! ${item.why} (${item.subject.kind}:${item.subject.id})`), ...version.next.map(option => `> ${option.text}: ${option.why}`)].join("\n");
}

/**
 * The project's own brief as the head of the first page (`overview.lede`): its sentences as stored, the sources each stands on, and
 * one mark each: a source it stands on could not be read (`gap`), something it cites waits for the person (`yours`), or it differs
 * from the version before (`changed`). Before anything is written, one line that says so and the words of the button to this page.
 */
function ledeOf(version: BriefVersion | null, before: BriefVersion | null): PresentationLede {
  if (!version?.claims.length) return { label: { key: "work-brief.presentation.home-title" }, sentences: [],
    invite: { text: { key: "work-brief.presentation.invite" }, action: { key: "work-brief.presentation.invite-action" } } };
  const unread = new Set(version.sources.filter(row => row.read !== "ok" && row.read !== "none").map(row => row.plugin_id));
  const waiting = new Set(version.attention.map(item => briefSubjectKey(item.subject)));
  const was = before && new Map(before.claims.map(claim => [claim.claim_id, claim.text]));
  const changed = (id: string, text: string) => Boolean(was && was.get(id) !== text);
  const changedCount = version.claims.filter(claim => changed(claim.claim_id, claim.text)).length;
  return { label: changedCount ? { key: "work-brief.presentation.lede-label-changed", args: [...count("version", version.version), ...count("count", changedCount)] }
      : { key: "work-brief.presentation.lede-label", args: count("version", version.version) },
    as_of: version.as_of,
    sentences: version.claims.slice(0, PRESENTATION_LIMITS.lede_sentences).map(claim => {
      const sources = [...new Set(claim.cites.map(cite => cite.owner_plugin_id))].slice(0, PRESENTATION_LIMITS.lede_sources);
      const mark = claim.cites.some(cite => cite.gap === "gone" || cite.gap === "unreadable" || unread.has(cite.owner_plugin_id)) ? "gap" as const
        : claim.cites.some(cite => waiting.has(briefSubjectKey(cite.subject))) ? "yours" as const : changed(claim.claim_id, claim.text) ? "changed" as const : undefined;
      return { text: cutCharacters(claim.text, PRESENTATION_LIMITS.lede_sentence), ...(sources.length ? { sources } : {}), ...(mark ? { mark } : {}) };
    }) };
}

export function createPresentationHandlers(read: <T>(run: (store: BriefStore) => T) => T): ActionHandlerBinding[] {
  const open = (brief: BriefRecord) => ({ surface: WORK_BRIEF_PROJECT_PLUGIN_ID, id: brief.brief_id });
  return [
    bindPresentationValuesHandler(values, input => read(store => ({ items: input.subjects.map((item: ActionSubject): PresentationValueItem => {
      const brief = item.kind === BRIEF_KIND ? store.find(item.id) : null;
      if (!brief) return { subject: item, revision: "0", state: "deleted" };
      const waiting = waitingIn(store.version(brief));
      return { subject: item, revision: String(brief.revision), state: "ok", values: { title: titleOf(brief), state: !brief.current_version ? "empty" : waiting ? "waiting" : "settled",
        waiting: waiting ? { key: "work-brief.presentation.waiting", args: count("count", waiting) } : { key: "work-brief.presentation.nothing-waiting" }, updated_at: brief.updated_at } };
    }) }))),
    bindActionHandler(overview, () => read(store => {
      const briefs = store.list(), waiting = briefs.reduce((total, brief) => total + waitingIn(store.version(brief)), 0);
      const home = store.home(), version = home && store.version(home);
      const before = home && version?.base_version ? store.version(home, version.base_version) : null;
      // The project's own brief is the head of the page, so it is not also listed among the page's objects.
      const listed = briefs.filter(brief => brief.brief_id !== home?.brief_id);
      return { lede: ledeOf(version, before), summary: !briefs.length ? { key: "work-brief.presentation.empty" } : waiting ? { key: "work-brief.presentation.summary-waiting", args: count("count", waiting) }
        : { key: "work-brief.presentation.summary", args: count("count", briefs.length) },
        subjects: listed.slice(0, PRESENTATION_LIMITS.overview_subjects).map(brief => ({ kind: BRIEF_KIND, id: brief.brief_id })), start: [] };
    })),
    bindSearchEntriesHandler(entries, () => read(store => store.list().filter(brief => brief.current_version > 0).map(brief => ({
      subject: { kind: BRIEF_KIND, id: brief.brief_id }, revision: String(brief.revision), title: brief.title || "Work Brief",
      summary: searchText(store.version(brief)?.claims.map(claim => claim.text).join(" ") ?? "", 400), updated_at: brief.updated_at, content: "context" as const, open: open(brief) })))),
    bindActionHandler(subject, input => read(store => {
      const brief = store.find(input.subject_id);
      if (!brief) throw workBriefErrors.not_found("这份简报已不存在", { brief_id: input.subject_id });
      return subjectContext({ subject: { kind: BRIEF_KIND, id: brief.brief_id }, revision: String(brief.revision), title: brief.title || "Work Brief",
        content: contentOf(store.version(brief)), open: open(brief) }, input);
    })),
  ];
}
